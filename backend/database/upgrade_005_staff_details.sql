-- Review and back up before execution. Existing staff records remain unchanged.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_master_management') THEN RAISE EXCEPTION 'Apply migration 004 first'; END IF;
IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='005_staff_details') THEN RAISE EXCEPTION 'Staff details migration already applied'; END IF;
END;$$;
-- Preserve existing records; require profile details through API validation on save.
ALTER TABLE staff ADD COLUMN dob DATE;
ALTER TABLE staff ADD COLUMN email TEXT;
ALTER TABLE staff ADD COLUMN address TEXT;
ALTER TABLE staff ADD CONSTRAINT staff_dob_valid CHECK(dob IS NULL OR dob<=(now() AT TIME ZONE 'Asia/Kolkata')::date);
ALTER TABLE staff ADD CONSTRAINT staff_email_valid CHECK(email IS NULL OR length(trim(email))>0);
ALTER TABLE staff ADD CONSTRAINT staff_address_valid CHECK(address IS NULL OR length(trim(address))>0);

INSERT INTO schema_migrations(version) VALUES('005_staff_details');
COMMIT;
