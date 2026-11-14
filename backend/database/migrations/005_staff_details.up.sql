-- Preserve existing records; require profile details through API validation on save.
ALTER TABLE staff ADD COLUMN dob DATE;
ALTER TABLE staff ADD COLUMN email TEXT;
ALTER TABLE staff ADD COLUMN address TEXT;
ALTER TABLE staff ADD CONSTRAINT staff_dob_valid CHECK(dob IS NULL OR dob<=(now() AT TIME ZONE 'Asia/Kolkata')::date);
ALTER TABLE staff ADD CONSTRAINT staff_email_valid CHECK(email IS NULL OR length(trim(email))>0);
ALTER TABLE staff ADD CONSTRAINT staff_address_valid CHECK(address IS NULL OR length(trim(address))>0);
