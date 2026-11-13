// Preparation only: exports local schema/data for review; never connects to or writes to Supabase.
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
const directory = fileURLToPath(new URL("../../backups/", import.meta.url));
await mkdir(directory, { recursive: true });
const name =
  directory +
  "supabase-review-" +
  new Date().toISOString().replaceAll(/[:.]/g, "-");
const url = new URL(process.env.DATABASE_URL);
const bin =
  process.env.PG_BIN_PATH ||
  (process.platform === "win32"
    ? `${process.env.ProgramFiles}/PostgreSQL/18/bin/`
    : "");
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      bin + command + (process.platform === "win32" ? ".exe" : ""),
      args,
      { env, windowsHide: true },
    );
    child.on("error", reject);
    child.stderr.on("data", () => {});
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)),
    );
  });
}
await run("pg_dump", [
  "--schema=studio",
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--file",
  name + ".dump",
]);
await run("pg_restore", [
  "--no-owner",
  "--no-acl",
  "--file",
  name + ".sql",
  name + ".dump",
]);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const tables = (
    await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='studio' AND table_type='BASE TABLE' ORDER BY table_name",
    )
  ).rows;
  const counts = {};
  for (const { table_name: t } of tables) {
    if (!/^[a-z_]+$/.test(t)) throw new Error("Unexpected table");
    counts[t] = (
      await client.query("SELECT count(*)::text AS count FROM studio." + t)
    ).rows[0].count;
  }
  await writeFile(
    name + ".counts.json",
    JSON.stringify(
      {
        source_database: url.pathname.slice(1),
        schema: "studio",
        counts,
        remote_changes: false,
      },
      null,
      2,
    ),
  );
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
console.log(
  `Review artifacts prepared: ${name}.{dump,sql,counts.json}. No remote changes made.`,
);
