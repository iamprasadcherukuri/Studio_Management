-- Review and verify a backup before execution. No financial values are backfilled.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='007_payment_discounts') THEN RAISE EXCEPTION 'Apply migration 007 first'; END IF;
IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='008_audit_fixes') THEN RAISE EXCEPTION 'Audit fixes already applied'; END IF;
END;$$;
-- Additive metadata only: never backfill or reinterpret historical financial amounts.
ALTER TABLE bookings ADD COLUMN booking_discount_type TEXT CHECK(booking_discount_type IN ('NONE','FIXED','PERCENTAGE'));
ALTER TABLE bookings ADD COLUMN booking_discount_value NUMERIC(12,2) CHECK(booking_discount_value>=0);
ALTER TABLE bookings ADD COLUMN booking_discount_amount NUMERIC(12,2) CHECK(booking_discount_amount>=0);
ALTER TABLE bookings ADD CONSTRAINT booking_discount_metadata CHECK(
 (booking_discount_type IS NULL AND booking_discount_value IS NULL AND booking_discount_amount IS NULL) OR
 (booking_discount_type IS NOT NULL AND booking_discount_value IS NOT NULL AND booking_discount_amount IS NOT NULL AND booking_discount_amount<=discount_amount
 AND ((booking_discount_type='NONE' AND booking_discount_value=0 AND booking_discount_amount=0)
 OR (booking_discount_type='FIXED' AND booking_discount_amount=booking_discount_value)
 OR (booking_discount_type='PERCENTAGE' AND booking_discount_value<=100 AND booking_discount_amount=round(total_amount*booking_discount_value/100,2)))));
ALTER TABLE invoices ADD COLUMN financial_snapshot JSONB CHECK(financial_snapshot IS NULL OR jsonb_typeof(financial_snapshot)='object');
ALTER TABLE expenses ADD COLUMN idempotency_key UUID UNIQUE;
ALTER TABLE expenses ADD COLUMN request_hash TEXT;
ALTER TABLE expenses ADD CONSTRAINT expense_request_pair CHECK((idempotency_key IS NULL)=(request_hash IS NULL));
ALTER TABLE audit_logs ADD COLUMN details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE equipment_assignments ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE equipment_assignments ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE equipment_assignments ADD COLUMN cancellation_reason TEXT;
DO $$ DECLARE item RECORD; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='equipment_assignments'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
  EXECUTE format('ALTER TABLE equipment_assignments DROP CONSTRAINT %I',item.conname);
 END LOOP;
END;$$;
ALTER TABLE equipment_assignments ADD CONSTRAINT equipment_assignment_lifecycle CHECK(
 (status='Active' AND actual_return_date IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR
 (status='Returned' AND actual_return_date IS NOT NULL AND actual_return_date>=assigned_date AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR
 (status='Cancelled' AND actual_return_date IS NULL AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason))>=3));
CREATE FUNCTION protect_invoice_financials() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (OLD.financial_snapshot IS NOT NULL OR OLD.created_at<transaction_timestamp()) AND (NEW.financial_snapshot IS DISTINCT FROM OLD.financial_snapshot OR ROW(NEW.id,NEW.created_at,NEW.booking_id,NEW.customer_id,NEW.invoice_date,NEW.due_date,NEW.studio_snapshot,NEW.customer_snapshot,NEW.subtotal,NEW.discount,NEW.tax_amount,NEW.total_amount,NEW.terms) IS DISTINCT FROM ROW(OLD.id,OLD.created_at,OLD.booking_id,OLD.customer_id,OLD.invoice_date,OLD.due_date,OLD.studio_snapshot,OLD.customer_snapshot,OLD.subtotal,OLD.discount,OLD.tax_amount,OLD.total_amount,OLD.terms)) THEN RAISE EXCEPTION 'Issued invoice financial details are immutable'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER protect_invoice_financials BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_financials();
CREATE FUNCTION protect_invoice_items() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE invoice_key BIGINT; BEGIN
 invoice_key:=CASE WHEN TG_OP='DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
 IF EXISTS(SELECT 1 FROM invoices WHERE id=invoice_key AND (financial_snapshot IS NOT NULL OR created_at<transaction_timestamp())) OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM invoices WHERE id=OLD.invoice_id AND (financial_snapshot IS NOT NULL OR created_at<transaction_timestamp()))) THEN RAISE EXCEPTION 'Issued invoice items are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$$;
CREATE TRIGGER protect_invoice_items BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION protect_invoice_items();
CREATE FUNCTION guard_last_administrator() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.active AND EXISTS(SELECT 1 FROM roles WHERE id=OLD.role_id AND name='admin') AND (TG_OP='DELETE' OR NOT NEW.active OR NEW.role_id<>OLD.role_id) THEN
  PERFORM pg_advisory_xact_lock(hashtext(current_schema()||':administrator-status'));
  IF NOT EXISTS(SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active AND r.name='admin' AND u.id<>OLD.id) THEN RAISE EXCEPTION 'At least one active administrator must remain'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$$;
CREATE TRIGGER guard_last_administrator BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION guard_last_administrator();
CREATE FUNCTION guard_granted_discounts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.discount_amount<(SELECT coalesce(sum(payment_discount_amount),0) FROM payments WHERE booking_id=OLD.id) THEN RAISE EXCEPTION 'Granted payment discounts cannot be removed by a booking edit'; END IF;
 IF NEW.agreed_amount<(SELECT coalesce(sum(amount),0) FROM payment_ledger WHERE booking_id=OLD.id) THEN RAISE EXCEPTION 'Agreed amount cannot be below net payments received'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER guard_granted_discounts BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION guard_granted_discounts();

INSERT INTO schema_migrations(version) VALUES('008_audit_fixes');
COMMIT;
