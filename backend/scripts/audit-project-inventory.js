import "dotenv/config";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  files = [];
const excluded = new Set([
  "node_modules",
  "dist",
  ".git",
  ".vercel",
  "test-results",
  "backups",
  "certs",
]);
async function walk(relative) {
  for (const item of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    if (excluded.has(item.name) || item.name.startsWith(".env")) continue;
    const name = path.join(relative, item.name);
    if (item.isDirectory()) await walk(name);
    else if (
      /\.(?:js|jsx|mjs|css|sql|json|yaml|md|html|ps1|txt)$/.test(item.name)
    ) {
      const bytes = await readFile(path.join(root, name));
      files.push({
        path: name.replaceAll("\\", "/"),
        bytes: bytes.length,
        lines: bytes.toString("utf8").split(/\r?\n/).length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}
for (const dir of ["backend", "frontend", "shared"]) await walk(dir);
for (const name of [
  "README.md",
  "package.json",
  "package-lock.json",
  "render.yaml",
]) {
  const bytes = await readFile(path.join(root, name));
  files.push({
    path: name,
    bytes: bytes.length,
    lines: bytes.toString("utf8").split(/\r?\n/).length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const schema = process.env.DB_SCHEMA || "studio";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  process.env.DATABASE_TARGET === "supabase"
)
  throw new Error("Inventory database reads are local only");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let database;
try {
  await c.query("BEGIN READ ONLY");
  database = {
    migrations: (
      await c.query(
        `SELECT version FROM "${schema}".schema_migrations ORDER BY version`,
      )
    ).rows.map((r) => r.version),
    tables: (
      await c.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
        [schema],
      )
    ).rows.map((r) => r.table_name),
    constraints: (
      await c.query(
        "SELECT contype,count(*)::int count,count(*) FILTER(WHERE NOT convalidated)::int unvalidated FROM pg_constraint WHERE connamespace=$1::regnamespace GROUP BY contype ORDER BY contype",
        [schema],
      )
    ).rows,
    indexes: (
      await c.query(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname",
        [schema],
      )
    ).rows,
  };
  const plan = await c.query(
    `EXPLAIN (FORMAT JSON) SELECT id,name,mobile FROM "${schema}".customers WHERE strpos(lower(name),lower($1))>0 OR strpos(mobile,$1)>0 ORDER BY lower(name),id LIMIT 10`,
    ["no_match_audit"],
  );
  database.customer_search_plan = plan.rows[0]["QUERY PLAN"];
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
const headers = await Promise.all(
  [
    "https://studio-management-sandy.vercel.app/",
    "https://studio-management-fv00.onrender.com/api/health",
  ].map(async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      return {
        url,
        status: r.status,
        headers: Object.fromEntries(
          [
            "content-security-policy",
            "strict-transport-security",
            "x-content-type-options",
            "x-frame-options",
            "referrer-policy",
          ].map((name) => [name, r.headers.get(name)]),
        ),
      };
    } catch {
      return { url, status: "not reachable during header check" };
    }
  }),
);
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
const result = {
  generated_at: new Date().toISOString(),
  source_files: files.sort((a, b) => a.path.localeCompare(b.path)),
  source_file_count: files.length,
  lockfile_packages: Object.keys(lock.packages || {}).length,
  database,
  public_response_headers: headers,
  read_only: true,
};
await mkdir(new URL("../../test-results/", import.meta.url), {
  recursive: true,
});
await writeFile(
  new URL("../../test-results/project-audit-inventory.json", import.meta.url),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      files: files.length,
      tables: database.tables.length,
      migrations: database.migrations,
      unvalidated_constraints: database.constraints.reduce(
        (n, r) => n + r.unvalidated,
        0,
      ),
      public_response_headers: headers,
    },
    null,
    2,
  ),
);
