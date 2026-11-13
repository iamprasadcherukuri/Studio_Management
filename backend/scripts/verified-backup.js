import dotenv from "dotenv";
import pg from "pg";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config({ path: new URL("../.env", import.meta.url), quiet: true });
export async function runPgTool(executable, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(executable)} failed (${code})`)),
    );
  });
}
export function localPgContext() {
  let url;
  try {
    url = new URL(process.env.DATABASE_URL || "");
  } catch {
    throw new Error(
      "Set a valid local DATABASE_URL in the ignored backend/.env file",
    );
  }
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    process.env.DATABASE_TARGET === "supabase"
  )
    throw new Error(
      "This backup/restore workflow is restricted to local PostgreSQL. Use a separately reviewed cloud backup configuration for Supabase.",
    );
  const bin =
    process.env.PG_BIN_PATH ||
    (process.platform === "win32"
      ? `${process.env.ProgramFiles}/PostgreSQL/18/bin/`
      : "");
  return {
    url,
    dump:
      process.env.PG_DUMP_PATH ||
      bin + (process.platform === "win32" ? "pg_dump.exe" : "pg_dump"),
    restore:
      process.env.PG_RESTORE_PATH ||
      bin + (process.platform === "win32" ? "pg_restore.exe" : "pg_restore"),
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
    },
  };
}
export async function verifiedBackup() {
  const context = localPgContext(),
    schema = process.env.DB_SCHEMA || "studio";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid backup schema");
  const directory = fileURLToPath(new URL("../../backups/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const filename = path.join(
    directory,
    "studio-" + new Date().toISOString().replaceAll(/[:.]/g, "-") + ".dump",
  );
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let counts = {};
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (
      await client.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    await runPgTool(
      context.dump,
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--snapshot",
        snapshot,
        "--file",
        filename,
      ],
      context.env,
    );
    for (const { table_name } of (
      await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
        [schema],
      )
    ).rows) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table_name))
        throw new Error("Unexpected table name");
      counts[table_name] = (
        await client.query(
          `SELECT count(*)::text AS count FROM ${schema}.${table_name}`,
        )
      ).rows[0].count;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  await runPgTool(context.restore, ["--list", filename], context.env);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  await writeFile(filename + ".counts.json", JSON.stringify(counts, null, 2));
  await writeFile(
    filename + ".verified.json",
    JSON.stringify(
      {
        schema,
        archiveListed: true,
        sha256: hash.digest("hex"),
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Verified backup saved: ${filename}`);
  return filename;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await verifiedBackup();
