-- CLEAR ALL DATA: database postgres, schema studio, migrations 001-008.
-- FILE ONLY: not executed against your database.
-- Removes ALL rows from EVERY studio table EXCEPT schema_migrations.
-- Includes users, roles, customers, staff, masters, settings, inventory, branding,
-- receipt counters, audit logs and all financial/transaction history.
-- Keeps table structures, views, functions, constraints, triggers and migrations.
-- Does NOT drop the schema, disable triggers, use CASCADE or create replacement data.
-- Identity sequences are retained. Receipt counters are deleted: new receipt
-- numbers can repeat historical numbers if you later reinitialize this database.
--
-- IMPORTANT: the application will need reinitialization of roles, studio profile,
-- master data and a new administrator before normal use. Retained migration
-- markers mean rerunning migrations alone will NOT restore the default masters.
-- This script deliberately does not seed anything: all requested tables stay empty.
--
-- 1. Stop application writes and select the correct database/project.
-- 2. Run the ENTIRE file: the last ROLLBACK makes it a preview.
-- 3. Review NOTICE output listing the exact tables and row counts.
-- 4. For permanent deletion, change ONLY the last ROLLBACK to COMMIT and run
--    the ENTIRE file again. Committed deletion requires a prior backup to undo.
-- If a statement fails, run ROLLBACK separately before retrying.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path TO studio,public;

DO $clear_all_data$
DECLARE
 expected TEXT[] := ARRAY['001_invoices_equipment','002_payment_reversals',
 '003_receipt_design','004_master_management','005_staff_details',
 '006_customer_title_gender','007_payment_discounts','008_audit_fixes'];
 table_list TEXT;
 target RECORD;
 n BIGINT;
 before_counts JSONB := '{}'::jsonb;
 migration_history JSONB;
BEGIN
 IF current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Wrong database: %. Expected postgres. No changes made.',current_database();
 END IF;
 IF to_regclass('studio.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'studio.schema_migrations is missing';
 END IF;
 LOCK TABLE studio.schema_migrations IN SHARE MODE;
 IF (SELECT count(*) FROM studio.schema_migrations WHERE version=ANY(expected))<>8
 OR EXISTS(SELECT 1 FROM studio.schema_migrations WHERE NOT(version=ANY(expected))) THEN
  RAISE EXCEPTION 'Requires exactly migrations 001-008; review a different schema version before resetting';
 END IF;
 SELECT jsonb_agg(to_jsonb(m) ORDER BY version) INTO migration_history
 FROM studio.schema_migrations m;

 -- Reject inheritance/partitioning rather than implicitly truncating descendants
 -- that could live outside this schema or include the retained migration table.
 IF EXISTS(SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
 JOIN pg_class p ON p.oid=i.inhparent
 WHERE c.relnamespace='studio'::regnamespace OR p.relnamespace='studio'::regnamespace) THEN
  RAISE EXCEPTION 'Partitioned/inherited tables need a separately reviewed reset';
 END IF;

 SELECT string_agg(format('%I.%I',ns.nspname,c.relname),', ' ORDER BY c.relname)
 INTO table_list FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='studio' AND c.relkind IN ('r','p') AND c.relname<>'schema_migrations';
 IF table_list IS NULL THEN RAISE EXCEPTION 'No data tables found'; END IF;
 EXECUTE 'LOCK TABLE '||table_list||' IN ACCESS EXCLUSIVE MODE';

 FOR target IN SELECT c.relname FROM pg_class c
 WHERE c.relnamespace='studio'::regnamespace AND c.relkind IN ('r','p')
 AND c.relname<>'schema_migrations' ORDER BY c.relname LOOP
  EXECUTE format('SELECT count(*) FROM studio.%I',target.relname) INTO n;
  before_counts:=before_counts||jsonb_build_object(target.relname,n);
 END LOOP;
 RAISE NOTICE 'Rows to delete (preview until COMMIT): %',before_counts;

 -- RESTRICT stops on external FK dependencies; it never expands to other schemas.
 EXECUTE 'TRUNCATE TABLE '||table_list||' CONTINUE IDENTITY RESTRICT';

 FOR target IN SELECT c.relname FROM pg_class c
 WHERE c.relnamespace='studio'::regnamespace AND c.relkind IN ('r','p')
 AND c.relname<>'schema_migrations' LOOP
  EXECUTE format('SELECT count(*) FROM studio.%I',target.relname) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Table % is not empty; reset rolled back',target.relname; END IF;
 END LOOP;
 IF migration_history IS DISTINCT FROM
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM studio.schema_migrations m) THEN
  RAISE EXCEPTION 'Migration history changed; reset rolled back';
 END IF;
 RAISE NOTICE 'Verified: every data table is empty; migration history and structures retained. Final ROLLBACK restores the preview.';
END;
$clear_all_data$;

SELECT version,applied_at FROM studio.schema_migrations ORDER BY version;

-- PREVIEW DEFAULT. Change ONLY this final statement to COMMIT for permanent deletion.
ROLLBACK;
