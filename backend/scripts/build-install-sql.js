import { readFile, writeFile } from "node:fs/promises";
const core = await readFile(
  new URL("../database/schema.sql", import.meta.url),
  "utf8",
);
const feature = await readFile(
  new URL(
    "../database/migrations/001_invoices_equipment.up.sql",
    import.meta.url,
  ),
  "utf8",
);
const reversals = await readFile(
  new URL(
    "../database/migrations/002_payment_reversals.up.sql",
    import.meta.url,
  ),
  "utf8",
);
const receipts = await readFile(
  new URL("../database/migrations/003_receipt_design.up.sql", import.meta.url),
  "utf8",
);
const sql = `-- Photography Studio: one-run FRESH installation (core + invoices + equipment).
-- Run the entire file in Supabase SQL Editor or psql against the chosen database.
-- No passwords, customer data, payment data, demo packages or rollback statements.
-- Refuses an existing studio schema containing tables; use migrations for upgrades.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $install_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='studio' AND table_type='BASE TABLE') THEN
  RAISE EXCEPTION 'studio already contains tables. Installation stopped without changing records. Use the migration runner for an existing application.';
 END IF;
END;
$install_guard$;

${core.replace("SET search_path TO studio, public;", "SET LOCAL search_path TO studio, public;")}

${feature}
${reversals}
${receipts}

CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001_invoices_equipment'),('002_payment_reversals'),('003_receipt_design');
COMMIT;
`;
await writeFile(new URL("../database/install_all.sql", import.meta.url), sql);
await writeFile(
  new URL("../database/upgrade_002_payment_reversals.sql", import.meta.url),
  `-- Existing installations only. Back up the target before running. No original payment rows are changed.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $upgrade_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='001_invoices_equipment') THEN RAISE EXCEPTION 'Apply the initial schema and invoice/equipment migration first';END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='002_payment_reversals') THEN RAISE EXCEPTION 'Payment reversal migration is already applied; no changes made';END IF;
END;$upgrade_guard$;
${reversals}
INSERT INTO schema_migrations(version) VALUES('002_payment_reversals');
COMMIT;
`,
);
console.log("Created backend/database/install_all.sql for a fresh database.");

await writeFile(
  new URL("../database/upgrade_003_receipt_design.sql", import.meta.url),
  `-- Existing installations: obtain approval and back up before execution.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $receipt_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='002_payment_reversals') THEN RAISE EXCEPTION 'Apply migration 002 first';END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='003_receipt_design') THEN RAISE EXCEPTION 'Receipt migration already applied; no changes made';END IF;
END;$receipt_guard$;
${receipts}
INSERT INTO schema_migrations(version) VALUES('003_receipt_design');
COMMIT;
`,
);
