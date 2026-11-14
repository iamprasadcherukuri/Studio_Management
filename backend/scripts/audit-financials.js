import "dotenv/config";
import pg from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  process.env.DATABASE_TARGET === "supabase"
)
  throw new Error(
    "This audit runner is restricted to the local database. Review the read-only SQL separately for cloud execution.",
  );
const schema = process.env.DB_SCHEMA || "studio";
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid schema");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  query_timeout: 30000,
});
await c.connect();
try {
  const sql = (
    await readFile(
      new URL("../database/financial_audit.sql", import.meta.url),
      "utf8",
    )
  ).replace(/\bstudio\b/g, schema);
  const results = await c.query(sql);
  const report = results.find((result) => result.rows?.[0]?.financial_audit)
    ?.rows[0].financial_audit;
  if (!report) throw new Error("Audit result missing");
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL("../../test-results/financial-audit-local.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        read_only: report.read_only,
        financial_columns: report.financial_columns.length,
        violations: report.violations,
        information: report.information,
        totals: report.totals,
      },
      null,
      2,
    ),
  );
  if (report.violations.length || Number(report.unvalidated_constraints))
    process.exitCode = 1;
} finally {
  await c.query("ROLLBACK");
  await c.end();
}
