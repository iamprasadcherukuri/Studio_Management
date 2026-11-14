DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM staff WHERE dob IS NOT NULL OR email IS NOT NULL OR address IS NOT NULL) THEN RAISE EXCEPTION 'Rollback refused: staff profile details exist'; END IF;
END;$$;
ALTER TABLE staff DROP COLUMN dob,DROP COLUMN email,DROP COLUMN address;
