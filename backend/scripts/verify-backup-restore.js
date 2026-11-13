import {
  verifiedBackup,
  localPgContext,
  runPgTool,
} from "./verified-backup.js";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import pg from "pg";
import assert from "node:assert/strict";
const context = localPgContext();
const archive = await verifiedBackup();
const metadata = JSON.parse(await readFile(archive + ".verified.json", "utf8"));
const hash = createHash("sha256");
for await (const chunk of createReadStream(archive)) hash.update(chunk);
assert.equal(hash.digest("hex"), metadata.sha256, "Backup checksum mismatch");
const name = "studio_restore_test_" + randomBytes(6).toString("hex");
assert.match(name, /^studio_restore_test_[a-f0-9]{12}$/);
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
let created = false,
  target;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await runPgTool(
    context.restore,
    [
      "--no-owner",
      "--no-acl",
      "--single-transaction",
      "--exit-on-error",
      "--dbname",
      name,
      archive,
    ],
    { ...context.env, PGDATABASE: name },
  );
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/" + name;
  target = new pg.Client({ connectionString: url.toString() });
  await target.connect();
  const counts = JSON.parse(await readFile(archive + ".counts.json", "utf8"));
  for (const [table, count] of Object.entries(counts)) {
    assert.match(table, /^[a-z_][a-z0-9_]*$/);
    assert.equal(
      (
        await target.query(
          `SELECT count(*)::text AS count FROM ${metadata.schema}.${table}`,
        )
      ).rows[0].count,
      count,
      table,
    );
  }
  const invalid = (
    await target.query(
      "SELECT conname FROM pg_constraint WHERE connamespace=$1::regnamespace AND NOT convalidated",
      [metadata.schema],
    )
  ).rows;
  assert.deepEqual(invalid, []);
  console.log(
    "PASS: backup checksum, actual restore into a disposable local database, exact table counts and validated constraints.",
  );
} finally {
  if (target) await target.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
}
