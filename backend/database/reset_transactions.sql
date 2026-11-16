-- TRANSACTION RESET: database postgres, schema studio (migrations 001-008).
-- PREPARED ONLY. This file has NOT been run against your live database.
-- Deletes ALL bookings, booking staff links, payments, reversals, invoices/items,
-- albums, expenses, equipment assignments and equipment maintenance records.
-- Retains customers, users/roles, packages, staff, equipment inventory (including
-- its existing status), event types, master entities/values, settings, branding,
-- receipt counters, migration history and existing audit logs.
-- IDs and receipt counters are NOT reset, to avoid reusing issued document numbers.
-- Equipment status is NOT inferred from erased history: review Maintenance and
-- physical asset availability afterward before accepting new reservations.
--
-- STEPS:
-- 1. Stop application writes / put the studio into a maintenance window.
-- 2. Select the intended database/project in your SQL client.
-- 3. Run this ENTIRE file. The final ROLLBACK makes this a preview only.
-- 4. Review the before counts in NOTICE output and the zero-count result.
-- 5. To permanently reset, change ONLY the final ROLLBACK to COMMIT, then run
--    the ENTIRE file again. Once committed, recovery requires a prior backup.
-- If any error occurs, run ROLLBACK separately before retrying.
-- No CASCADE, trigger disabling, table drops or production execution is included.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path TO studio,public;

DO $reset_guard$
DECLARE
 expected TEXT[] := ARRAY['001_invoices_equipment','002_payment_reversals',
 '003_receipt_design','004_master_management','005_staff_details',
 '006_customer_title_gender','007_payment_discounts','008_audit_fixes'];
BEGIN
 IF current_database()<>'postgres' THEN
  RAISE EXCEPTION 'Wrong database: %. Expected postgres. No changes made.',current_database();
 END IF;
 IF to_regclass('studio.schema_migrations') IS NULL THEN
  RAISE EXCEPTION 'studio.schema_migrations is missing';
 END IF;
 IF (SELECT count(*) FROM studio.schema_migrations WHERE version=ANY(expected))<>8
 OR EXISTS(SELECT 1 FROM studio.schema_migrations WHERE NOT(version=ANY(expected))) THEN
  RAISE EXCEPTION 'Reset script requires exactly migrations 001-008; review a different schema version before resetting';
 END IF;
END;
$reset_guard$;

-- RESTRICT causes an unknown external FK to stop the entire reset, rather than
-- pulling additional tables into the deletion. Row DELETE protection triggers
-- remain installed: this deliberate table reset uses PostgreSQL TRUNCATE.
LOCK TABLE studio.payment_reversals,studio.payments,studio.invoice_items,
 studio.invoices,studio.equipment_assignments,studio.equipment_maintenance,
 studio.albums,studio.expenses,studio.booking_staff,studio.bookings
 IN ACCESS EXCLUSIVE MODE;

DO $reset_transactions$
DECLARE
 target TEXT;
 targets TEXT[] := ARRAY['payment_reversals','payments','invoice_items','invoices',
 'equipment_assignments','equipment_maintenance','albums','expenses','booking_staff','bookings'];
 before_counts JSONB := '{}'::jsonb;
 n BIGINT;
BEGIN
 FOREACH target IN ARRAY targets LOOP
  EXECUTE format('SELECT count(*) FROM studio.%I',target) INTO n;
  before_counts := before_counts || jsonb_build_object(target,n);
 END LOOP;
 RAISE NOTICE 'Rows to remove (preview until COMMIT): %',before_counts;

 TRUNCATE TABLE studio.payment_reversals,studio.payments,studio.invoice_items,
  studio.invoices,studio.equipment_assignments,studio.equipment_maintenance,
  studio.albums,studio.expenses,studio.booking_staff,studio.bookings
  CONTINUE IDENTITY RESTRICT;

 FOREACH target IN ARRAY targets LOOP
  EXECUTE format('SELECT count(*) FROM studio.%I',target) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Reset verification failed for %',target; END IF;
 END LOOP;

 -- Existing audit records stay untouched. This new record commits only if the
 -- operator explicitly changes the last ROLLBACK to COMMIT.
 INSERT INTO studio.audit_logs(user_id,action,entity,entity_id,details)
 VALUES(NULL,'reset_transactions','database',NULL,jsonb_build_object(
  'database',current_database(),'schema','studio','database_operator',session_user,
  'removed_rows',before_counts,'identity_sequences_preserved',true,
  'receipt_counters_preserved',true));
END;
$reset_transactions$;

SELECT 'bookings' AS transaction_table,count(*) AS remaining_rows FROM studio.bookings
UNION ALL SELECT 'booking_staff',count(*) FROM studio.booking_staff
UNION ALL SELECT 'payments',count(*) FROM studio.payments
UNION ALL SELECT 'payment_reversals',count(*) FROM studio.payment_reversals
UNION ALL SELECT 'invoices',count(*) FROM studio.invoices
UNION ALL SELECT 'invoice_items',count(*) FROM studio.invoice_items
UNION ALL SELECT 'albums',count(*) FROM studio.albums
UNION ALL SELECT 'expenses',count(*) FROM studio.expenses
UNION ALL SELECT 'equipment_assignments',count(*) FROM studio.equipment_assignments
UNION ALL SELECT 'equipment_maintenance',count(*) FROM studio.equipment_maintenance
ORDER BY transaction_table;

-- PREVIEW DEFAULT. Change this final statement to COMMIT only to delete for real.
ROLLBACK;
