-- Review and back up before execution. Original payments/receipts remain unchanged.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='006_customer_title_gender') THEN RAISE EXCEPTION 'Apply migration 006 first'; END IF;
IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='007_payment_discounts') THEN RAISE EXCEPTION 'Payment discount migration already applied'; END IF;
END;$$;
-- Store the additional discount granted with each payment; preserve historical receipts.
ALTER TABLE payments ADD COLUMN payment_discount_type TEXT NOT NULL DEFAULT 'NONE' CHECK(payment_discount_type IN ('NONE','FIXED','PERCENTAGE'));
ALTER TABLE payments ADD COLUMN payment_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(payment_discount_value>=0);
ALTER TABLE payments ADD COLUMN payment_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(payment_discount_amount>=0);
ALTER TABLE payments ADD COLUMN payment_discount_basis NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(payment_discount_basis>=0);
ALTER TABLE payments ADD CONSTRAINT payment_discount_consistency CHECK(
 payment_discount_amount<=payment_discount_basis AND (
 (payment_discount_type='NONE' AND payment_discount_value=0 AND payment_discount_amount=0) OR
 (payment_discount_type='FIXED' AND payment_discount_value=payment_discount_amount) OR
 (payment_discount_type='PERCENTAGE' AND payment_discount_value<=100 AND payment_discount_amount=round(payment_discount_basis*payment_discount_value/100,2))));
CREATE FUNCTION protect_payment_discount() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.receipt_snapshot IS NOT NULL AND ROW(NEW.payment_discount_type,NEW.payment_discount_value,NEW.payment_discount_amount,NEW.payment_discount_basis) IS DISTINCT FROM ROW(OLD.payment_discount_type,OLD.payment_discount_value,OLD.payment_discount_amount,OLD.payment_discount_basis) THEN RAISE EXCEPTION 'Issued payment discount is immutable'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER protect_payment_discount BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_payment_discount();

INSERT INTO schema_migrations(version) VALUES('007_payment_discounts');
COMMIT;
