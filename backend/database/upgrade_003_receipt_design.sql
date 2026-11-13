-- Existing installations: obtain approval and back up before execution.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $receipt_guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='002_payment_reversals') THEN RAISE EXCEPTION 'Apply migration 002 first';END IF;
 IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='003_receipt_design') THEN RAISE EXCEPTION 'Receipt migration already applied; no changes made';END IF;
END;$receipt_guard$;
ALTER TABLE bookings ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0);
ALTER TABLE bookings ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'NONE' CHECK(discount_type IN ('NONE','PERCENTAGE','FIXED'));
ALTER TABLE bookings ADD COLUMN discount_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(discount_value>=0);
ALTER TABLE bookings ADD COLUMN total_amount NUMERIC(12,2) GENERATED ALWAYS AS (agreed_amount+discount_amount) STORED;
ALTER TABLE bookings ADD CONSTRAINT bookings_receipt_discount_consistency CHECK(
 (discount_type='NONE' AND discount_value=0 AND discount_amount=0) OR
 (discount_type='FIXED' AND discount_amount=discount_value) OR
 (discount_type='PERCENTAGE' AND discount_value<=100 AND discount_amount=round(total_amount*discount_value/100,2))
);
ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Payment' CHECK(payment_type IN ('Payment','Advance','Partial','Installment','Final'));
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK(method IN ('Cash','UPI','Card','Bank transfer','Cheque'));
ALTER TABLE payments ADD COLUMN receipt_number TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN receipt_snapshot JSONB;
ALTER TABLE payments ADD COLUMN receipt_basis TEXT CHECK(receipt_basis IN ('recorded','reconstructed'));
ALTER TABLE payments ADD CONSTRAINT payments_receipt_metadata CHECK((receipt_snapshot IS NULL AND receipt_basis IS NULL) OR (receipt_snapshot IS NOT NULL AND receipt_basis IS NOT NULL));
CREATE TABLE receipt_counters(year INTEGER PRIMARY KEY CHECK(year BETWEEN 1 AND 9999),last_value BIGINT NOT NULL CHECK(last_value>0));
CREATE FUNCTION assign_receipt_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_year INTEGER; next_number BIGINT;
BEGIN
 IF NEW.receipt_number IS NOT NULL THEN RAISE EXCEPTION 'Receipt numbers are assigned automatically' USING ERRCODE='P0001'; END IF;
 receipt_year:=extract(year FROM NEW.date)::integer;
 INSERT INTO receipt_counters(year,last_value) VALUES(receipt_year,1)
 ON CONFLICT(year) DO UPDATE SET last_value=receipt_counters.last_value+1 RETURNING last_value INTO next_number;
 NEW.receipt_number:='REC-'||lpad(receipt_year::text,4,'0')||'-'||lpad(next_number::text,greatest(3,length(next_number::text)),'0');
 RETURN NEW;
END;$$;
CREATE TRIGGER assign_receipt_number BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION assign_receipt_number();
CREATE TABLE studio_brand_assets(
 id BIGSERIAL PRIMARY KEY,sha256 TEXT UNIQUE NOT NULL,media_type TEXT NOT NULL CHECK(media_type IN ('image/png','image/jpeg')),
 image_data BYTEA NOT NULL CHECK(octet_length(image_data)<=102400),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE studio_settings ADD COLUMN tagline TEXT NOT NULL DEFAULT 'Photography & Videography Services';
ALTER TABLE studio_settings ADD COLUMN logo_asset_id BIGINT REFERENCES studio_brand_assets(id);
ALTER TABLE studio_settings ADD COLUMN signatory_name TEXT NOT NULL DEFAULT '';
ALTER TABLE studio_settings ADD COLUMN signatory_title TEXT NOT NULL DEFAULT 'Studio Manager';
ALTER TABLE studio_settings ADD COLUMN receipt_footer TEXT NOT NULL DEFAULT '';
CREATE FUNCTION protect_receipt_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.receipt_snapshot IS NOT NULL AND (NEW.receipt_snapshot IS DISTINCT FROM OLD.receipt_snapshot OR NEW.receipt_basis IS DISTINCT FROM OLD.receipt_basis OR ROW(NEW.booking_id,NEW.amount,NEW.date,NEW.receipt_number,NEW.payment_type,NEW.method,NEW.reference) IS DISTINCT FROM ROW(OLD.booking_id,OLD.amount,OLD.date,OLD.receipt_number,OLD.payment_type,OLD.method,OLD.reference)) THEN RAISE EXCEPTION 'Issued receipt details are immutable' USING ERRCODE='P0001';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER protect_receipt_snapshot BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_receipt_snapshot();

INSERT INTO schema_migrations(version) VALUES('003_receipt_design');
COMMIT;
