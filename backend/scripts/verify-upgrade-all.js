import "dotenv/config";
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { migrationVersions } from "../database/versions.js";
const connection = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname) ||
  process.env.DATABASE_TARGET === "supabase"
)
  throw new Error("Local disposable upgrade tests only");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  for (const stage of [0, 1, 7]) {
    const schema = "studio_upgrade_test_" + randomBytes(6).toString("hex");
    assert.match(schema, /^studio_upgrade_test_[a-f0-9]{12}$/);
    try {
      await c.query(
        (
          await readFile(
            new URL("../database/schema.sql", import.meta.url),
            "utf8",
          )
        ).replace(/\bstudio\b/g, schema),
      );
      if (stage) {
        await c.query(
          "CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        );
        for (const version of migrationVersions.slice(0, stage)) {
          await c.query(
            await readFile(
              new URL(
                `../database/migrations/${version}.up.sql`,
                import.meta.url,
              ),
              "utf8",
            ),
          );
          await c.query("INSERT INTO schema_migrations(version) VALUES($1)", [
            version,
          ]);
        }
      }
      const user = (
        await c.query(
          "INSERT INTO users(name,email,password_hash,role_id) SELECT 'Upgrade fixture','upgrade@example.test','unused',id FROM roles WHERE name='admin' RETURNING id",
        )
      ).rows[0];
      const customer = (
        await c.query(
          "INSERT INTO customers(name,mobile) VALUES('Upgrade fixture','9876543210') RETURNING id",
        )
      ).rows[0];
      const booking = (
        await c.query(
          "INSERT INTO bookings(customer_id,event_type_id,event_date,location,agreed_amount) SELECT $1,id,CURRENT_DATE,'Upgrade fixture',1000 FROM event_types ORDER BY id LIMIT 1 RETURNING id",
          [customer.id],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO payments(booking_id,date,amount,method,idempotency_key,created_by) VALUES($1,CURRENT_DATE,100,'Cash',$2,$3)",
        [booking.id, randomUUID(), user.id],
      );
      await c.query(
        "INSERT INTO expenses(date,category,description,amount,method) VALUES(CURRENT_DATE,'Travel','Upgrade fixture',10,'Cash')",
      );
      const before = {};
      for (const table of [
        "users",
        "customers",
        "bookings",
        "payments",
        "expenses",
      ])
        before[table] = (
          await c.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)
        ).rows.map((r) => r.value);
      const sql = (
        await readFile(
          new URL("../database/upgrade_all.sql", import.meta.url),
          "utf8",
        )
      ).replace(/\bstudio\b/g, schema);
      await c.query(sql);
      for (const [table, rows] of Object.entries(before)) {
        const after = (
          await c.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)
        ).rows.map((r) => r.value);
        assert.equal(after.length, rows.length);
        for (let i = 0; i < rows.length; i++)
          for (const key of Object.keys(rows[i]))
            assert.deepEqual(
              after[i][key],
              rows[i][key],
              `${table}.${key} changed`,
            );
      }
      assert.deepEqual(
        (
          await c.query(
            "SELECT version FROM schema_migrations ORDER BY version",
          )
        ).rows.map((r) => r.version),
        migrationVersions,
      );
      const counts = (
        await c.query(
          "SELECT (SELECT count(*) FROM payments)::int payments,(SELECT count(*) FROM expenses)::int expenses,(SELECT sum(amount)::text FROM payment_ledger) net",
        )
      ).rows[0];
      await c.query(sql);
      assert.deepEqual(
        (
          await c.query(
            "SELECT (SELECT count(*) FROM payments)::int payments,(SELECT count(*) FROM expenses)::int expenses,(SELECT sum(amount)::text FROM payment_ledger) net",
          )
        ).rows[0],
        counts,
      );
      await c.query(
        "DELETE FROM schema_migrations WHERE version='001_invoices_equipment'",
      );
      await assert.rejects(() => c.query(sql), /history has a gap/);
      await c.query("ROLLBACK");
      console.log(
        `PASS: upgrade_all from ${stage === 0 ? "base schema" : "migration " + String(stage).padStart(3, "0")}, record preservation, safe rerun and history-gap rejection`,
      );
    } finally {
      await c.query("ROLLBACK");
      await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  }
} finally {
  await c.end();
}
