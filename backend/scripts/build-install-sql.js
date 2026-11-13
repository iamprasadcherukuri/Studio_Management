import {readFile,writeFile} from 'node:fs/promises';
const core=await readFile(new URL('../database/schema.sql',import.meta.url),'utf8');
const feature=await readFile(new URL('../database/migrations/001_invoices_equipment.up.sql',import.meta.url),'utf8');
const sql=`-- Photography Studio: one-run FRESH installation (core + invoices + equipment).
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

${core.replace('SET search_path TO studio, public;','SET LOCAL search_path TO studio, public;')}

${feature}

CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001_invoices_equipment');
COMMIT;
`;
await writeFile(new URL('../database/install_all.sql',import.meta.url),sql);
console.log('Created backend/database/install_all.sql for a fresh database.');
