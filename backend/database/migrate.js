import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { backupDatabase } from "../scripts/backup.js";
export async function migrate(client, schema = "studio", down = false) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid migration schema");
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('search_path',$1,true)", [
      `${schema},public`,
    ]);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "studio-migrations:" + schema,
    ]);
    const existing = [
      "roles",
      "users",
      "customers",
      "packages",
      "staff",
      "bookings",
      "booking_staff",
      "payments",
      "albums",
      "expenses",
      "audit_logs",
      "studio_settings",
    ];
    const counts = async () => {
      const result = {};
      for (const table of existing)
        result[table] = (
          await client.query(`SELECT count(*)::text AS count FROM ${table}`)
        ).rows[0].count;
      return result;
    };
    const before = await counts();
    const originalEvents = (
      await client.query("SELECT id,name FROM event_types ORDER BY id")
    ).rows;
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const versions = [
      "001_invoices_equipment",
      "002_payment_reversals",
      "003_receipt_design",
      "004_master_management",
      "005_staff_details",
      "006_customer_title_gender",
      "007_payment_discounts",
    ];
    const applied = new Set(
      (await client.query("SELECT version FROM schema_migrations")).rows.map(
        (row) => row.version,
      ),
    );
    const selected = down
      ? versions.filter((version) => applied.has(version)).slice(-1)
      : versions.filter((version) => !applied.has(version));
    for (const version of selected) {
      if (down) {
        const financial = applied.has("002_payment_reversals")
          ? " +(SELECT count(*) FROM payment_reversals)"
          : "";
        const records = (
          await client.query(
            "SELECT (SELECT count(*) FROM invoices)+(SELECT count(*) FROM equipment)+(SELECT count(*) FROM equipment_assignments)+(SELECT count(*) FROM equipment_maintenance)" +
              financial +
              (applied.has("003_receipt_design")
                ? " +(SELECT count(*) FROM studio_brand_assets)+(SELECT count(*) FROM payments WHERE receipt_number IS NOT NULL OR receipt_snapshot IS NOT NULL OR method='Card')+(SELECT count(*) FROM bookings WHERE discount_amount<>0)"
                : "") +
              " AS records",
          )
        ).rows[0].records;
        if (Number(records) > 0)
          throw new Error(
            "Rollback refused: feature or reversal records exist; preserve/export them before planning rollback",
          );
      }
      await client.query(
        await readFile(
          new URL(
            "./migrations/" + version + (down ? ".down.sql" : ".up.sql"),
            import.meta.url,
          ),
          "utf8",
        ),
      );
      if (down)
        await client.query("DELETE FROM schema_migrations WHERE version=$1", [
          version,
        ]);
      else
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES($1)",
          [version],
        );
    }
    if (JSON.stringify(before) !== JSON.stringify(await counts()))
      throw new Error("Existing row counts changed; migration rolled back");
    const afterEvents = (
      await client.query("SELECT id,name FROM event_types ORDER BY id")
    ).rows;
    if (
      originalEvents.some(
        (old) =>
          !afterEvents.some(
            (row) => row.id === old.id && row.name === old.name,
          ),
      )
    )
      throw new Error("Existing event records changed; migration rolled back");
    const invalid = await client.query(
      "SELECT conname FROM pg_constraint WHERE connamespace=$1::regnamespace AND NOT convalidated",
      [schema],
    );
    if (invalid.rowCount)
      throw new Error(
        "Unvalidated database constraints; migration rolled back",
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (
    process.env.NODE_ENV === "production" &&
    !process.argv.includes("--approve-production")
  )
    throw new Error("Production migration needs explicit --approve-production");
  await backupDatabase();
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await migrate(
      c,
      process.env.DB_SCHEMA || "studio",
      process.argv.includes("--down"),
    );
    console.log("Migration complete.");
  } finally {
    await c.end();
  }
}
