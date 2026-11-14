-- Photography Studio: one-run FRESH installation (core + invoices + equipment).
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

CREATE SCHEMA IF NOT EXISTS studio;
SET LOCAL search_path TO studio, public;
CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL CHECK(name IN ('admin','staff')));
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role_id INTEGER NOT NULL REFERENCES roles(id),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY,customer_code TEXT GENERATED ALWAYS AS ('CUS-' || lpad(id::text,5,'0')) STORED UNIQUE,name TEXT NOT NULL,mobile TEXT NOT NULL,alternate_mobile TEXT,email TEXT,address TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS event_types (id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS packages (id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,amount NUMERIC(12,2) NOT NULL CHECK(amount>=0),description TEXT);
CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY,user_id INTEGER UNIQUE REFERENCES users(id),name TEXT NOT NULL,mobile TEXT,active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY,customer_id INTEGER NOT NULL REFERENCES customers(id),event_type_id INTEGER NOT NULL REFERENCES event_types(id),package_id INTEGER REFERENCES packages(id),event_date DATE NOT NULL,location TEXT NOT NULL,agreed_amount NUMERIC(12,2) NOT NULL CHECK(agreed_amount>=0),notes TEXT,status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','in progress','completed','cancelled')),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS booking_staff (booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,staff_id INTEGER REFERENCES staff(id),PRIMARY KEY(booking_id,staff_id));
CREATE TABLE IF NOT EXISTS payments (id SERIAL PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id),date DATE NOT NULL DEFAULT CURRENT_DATE,amount NUMERIC(12,2) NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN ('Cash','UPI','Bank transfer','Cheque')),reference TEXT,remarks TEXT,idempotency_key UUID UNIQUE NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS albums (id SERIAL PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id),album_type TEXT NOT NULL,size TEXT NOT NULL,pages INTEGER NOT NULL CHECK(pages>0),printing_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(printing_cost>=0),expected_delivery DATE,actual_delivery DATE,status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Photo Selection','Editing','Design','Customer Approval','Printing','Ready for Delivery','Delivered')),acknowledgement TEXT,notes TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),CHECK(status<>'Delivered' OR (actual_delivery IS NOT NULL AND length(trim(acknowledgement))>0)));
CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY,date DATE NOT NULL,category TEXT NOT NULL CHECK(category IN ('Salaries','Equipment','Printing','Travel','Other')),description TEXT NOT NULL,amount NUMERIC(12,2) NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN ('Cash','UPI','Bank transfer','Cheque')),booking_id INTEGER REFERENCES bookings(id),remarks TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id INTEGER,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS studio_settings (id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),name TEXT NOT NULL DEFAULT 'The Photo Studio',phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS customers_search_idx ON customers(lower(name));
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(event_date);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments(booking_id);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(date);
CREATE INDEX IF NOT EXISTS albums_booking_idx ON albums(booking_id);
CREATE INDEX IF NOT EXISTS albums_status_idx ON albums(status);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);
INSERT INTO roles(name) VALUES ('admin'),('staff') ON CONFLICT DO NOTHING;
INSERT INTO event_types(name) VALUES ('Wedding'),('Engagement'),('Birthday'),('Pre-wedding'),('Other') ON CONFLICT DO NOTHING;
INSERT INTO studio_settings(id) VALUES(1) ON CONFLICT DO NOTHING;


CREATE TABLE invoices (
 id BIGSERIAL PRIMARY KEY,
 invoice_number TEXT GENERATED ALWAYS AS ('INV-' || lpad(id::text,8,'0')) STORED UNIQUE NOT NULL,
 booking_id INTEGER NOT NULL REFERENCES bookings(id),customer_id INTEGER NOT NULL REFERENCES customers(id),
 invoice_date DATE NOT NULL,due_date DATE NOT NULL CHECK(due_date>=invoice_date),
 studio_snapshot JSONB NOT NULL,customer_snapshot JSONB NOT NULL,
 subtotal NUMERIC(12,2) NOT NULL CHECK(subtotal>=0),discount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(discount>=0),
 tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(tax_amount=0),
 total_amount NUMERIC(12,2) NOT NULL CHECK(total_amount>=0 AND total_amount=subtotal-discount+tax_amount),
 status TEXT NOT NULL DEFAULT 'Issued' CHECK(status IN ('Issued','Void')),
 terms TEXT NOT NULL DEFAULT '',idempotency_key UUID UNIQUE NOT NULL,request_hash TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 void_reason TEXT,voided_by INTEGER REFERENCES users(id),voided_at TIMESTAMPTZ,
 CHECK(status<>'Void' OR (length(trim(void_reason))>0 AND voided_by IS NOT NULL AND voided_at IS NOT NULL))
);
CREATE UNIQUE INDEX invoices_one_active_booking ON invoices(booking_id) WHERE status='Issued';
CREATE INDEX invoices_customer_idx ON invoices(customer_id);
CREATE INDEX invoices_date_idx ON invoices(invoice_date);
CREATE TABLE invoice_items (
 id BIGSERIAL PRIMARY KEY,invoice_id BIGINT NOT NULL REFERENCES invoices(id),description TEXT NOT NULL,
 quantity NUMERIC(12,3) NOT NULL CHECK(quantity>0),unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price>=0),
 line_total NUMERIC(12,2) NOT NULL CHECK(line_total=round(quantity*unit_price,2)),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE TABLE equipment (
 id SERIAL PRIMARY KEY,asset_code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('Cameras','Lenses','Lighting','Tripods','Audio','Accessories','Other')),
 brand TEXT,model TEXT,serial_number TEXT UNIQUE,purchase_date DATE,purchase_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(purchase_cost>=0),
 condition TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available','Maintenance','Retired')),
 remarks TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX equipment_category_idx ON equipment(category);
CREATE TABLE equipment_assignments (
 id BIGSERIAL PRIMARY KEY,equipment_id INTEGER NOT NULL REFERENCES equipment(id),booking_id INTEGER NOT NULL REFERENCES bookings(id),
 assigned_by INTEGER NOT NULL REFERENCES users(id),assigned_date DATE NOT NULL,expected_return_date DATE NOT NULL CHECK(expected_return_date>=assigned_date),
 actual_return_date DATE,status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Returned')),remarks TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((status='Active' AND actual_return_date IS NULL) OR (status='Returned' AND actual_return_date>=assigned_date))
);
CREATE INDEX equipment_assignments_lookup_idx ON equipment_assignments(equipment_id,assigned_date,expected_return_date) WHERE status='Active';
CREATE INDEX equipment_assignments_booking_idx ON equipment_assignments(booking_id);
CREATE TABLE equipment_maintenance (
 id BIGSERIAL PRIMARY KEY,equipment_id INTEGER NOT NULL REFERENCES equipment(id),maintenance_type TEXT NOT NULL,service_date DATE NOT NULL,
 description TEXT NOT NULL,service_provider TEXT,maintenance_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(maintenance_cost>=0),next_service_date DATE,
 status TEXT NOT NULL CHECK(status IN ('In progress','Completed')),expense_id INTEGER UNIQUE REFERENCES expenses(id),
 created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(next_service_date IS NULL OR next_service_date>=service_date)
);
CREATE UNIQUE INDEX equipment_one_open_service ON equipment_maintenance(equipment_id) WHERE status='In progress';
CREATE INDEX equipment_maintenance_equipment_idx ON equipment_maintenance(equipment_id);
CREATE FUNCTION protect_invoiced_booking() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.agreed_amount<>OLD.agreed_amount OR NEW.customer_id<>OLD.customer_id OR NEW.status='cancelled') AND EXISTS(SELECT 1 FROM invoices WHERE booking_id=OLD.id AND status='Issued') THEN
  RAISE EXCEPTION 'Void the active invoice before changing its customer, agreed amount or cancelling its booking' USING ERRCODE='P0001';
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER protect_invoiced_booking BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION protect_invoiced_booking();
CREATE FUNCTION protect_maintenance_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM equipment_maintenance WHERE expense_id=OLD.id) THEN
  RAISE EXCEPTION 'This expense is linked to equipment maintenance and cannot be edited or deleted' USING ERRCODE='P0001';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;
CREATE TRIGGER protect_maintenance_expense BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_maintenance_expense();

CREATE TABLE payment_reversals (
 id BIGSERIAL PRIMARY KEY,
 payment_id INTEGER NOT NULL REFERENCES payments(id),
 date DATE NOT NULL,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 reason TEXT NOT NULL CHECK(length(trim(reason))>=3),
 idempotency_key UUID UNIQUE NOT NULL,
 request_hash TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_reversals_payment_idx ON payment_reversals(payment_id);
CREATE INDEX payment_reversals_date_idx ON payment_reversals(date);
CREATE VIEW payment_ledger AS
 SELECT p.id::bigint AS id,p.id AS payment_id,NULL::bigint AS reversal_id,
 p.booking_id,p.date,p.amount,p.method,p.created_by,p.created_at,'Payment'::text AS entry_type
 FROM payments p
 UNION ALL
 SELECT -r.id,p.id,r.id,p.booking_id,r.date,-r.amount,p.method,r.created_by,r.created_at,'Reversal'::text
 FROM payment_reversals r JOIN payments p ON p.id=r.payment_id;

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

-- Version tracked. Existing transactional values and column types are preserved.
CREATE TABLE master_entity (
 entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity_code VARCHAR(100) NOT NULL UNIQUE CHECK(entity_code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
 entity_name VARCHAR(150) NOT NULL CHECK(length(trim(entity_name))>0),
 description TEXT NOT NULL DEFAULT '',display_order INTEGER NOT NULL DEFAULT 0,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE master_entity_value (
 entity_value_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity_id BIGINT NOT NULL REFERENCES master_entity(entity_id),
 value_code VARCHAR(100) NOT NULL CHECK(value_code ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'),
 value_name VARCHAR(150) NOT NULL CHECK(length(trim(value_name))>0),description TEXT NOT NULL DEFAULT '',
 display_order INTEGER NOT NULL DEFAULT 0,is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 stored_value TEXT NOT NULL,legacy_aliases TEXT[] NOT NULL DEFAULT '{}',
 legacy_event_type_id INTEGER UNIQUE REFERENCES event_types(id),
 UNIQUE(entity_id,value_code),UNIQUE(entity_id,stored_value)
);
CREATE INDEX master_entity_order_idx ON master_entity(is_active,display_order,entity_id);
CREATE INDEX master_value_order_idx ON master_entity_value(entity_id,is_active,display_order,entity_value_id);
CREATE FUNCTION master_code(input TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT trim(both '_' from regexp_replace(upper(trim(input)),'[^A-Z0-9]+','_','g'))
$$;
CREATE FUNCTION protect_master_codes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='master_entity' THEN
  IF TG_OP='INSERT' THEN NEW.entity_code:=master_code(NEW.entity_name);
  ELSIF NEW.entity_code IS DISTINCT FROM OLD.entity_code THEN RAISE EXCEPTION 'Entity codes cannot be changed'; END IF;
 ELSE
  IF TG_OP='INSERT' THEN NEW.value_code:=master_code(NEW.value_name);
  ELSIF ROW(NEW.entity_id,NEW.value_code,NEW.stored_value,NEW.legacy_aliases,NEW.legacy_event_type_id) IS DISTINCT FROM ROW(OLD.entity_id,OLD.value_code,OLD.stored_value,OLD.legacy_aliases,OLD.legacy_event_type_id) THEN RAISE EXCEPTION 'Master codes and compatibility mappings cannot be changed'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;$$;
-- Seed before installing immutability triggers; ON CONFLICT never overwrites names/custom settings.
INSERT INTO master_entity(entity_code,entity_name,display_order)
SELECT master_code(name),name,n FROM unnest(ARRAY['Album Type','Payment Type','Event Type','Expense Category','Equipment Category','Album Size','Package Type']) WITH ORDINALITY AS x(name,n)
ON CONFLICT(entity_code) DO NOTHING;
INSERT INTO master_entity_value(entity_id,value_code,value_name,stored_value,display_order)
SELECT e.entity_id,master_code(v.name),v.name,CASE WHEN e.entity_code='PAYMENT_TYPE' AND v.name='Bank Transfer' THEN 'Bank transfer' ELSE v.name END,v.n
FROM master_entity e CROSS JOIN LATERAL unnest(CASE e.entity_code
 WHEN 'ALBUM_TYPE' THEN ARRAY['Wedding Album','Pre-Wedding Album','Engagement Album','Reception Album','Birthday Album','Baby Shower Album','Maternity Album','Baby Photography Album','Naming Ceremony Album','Half Saree Ceremony Album','Dhoti Ceremony Album','Housewarming Album','Anniversary Album','Family Album','Traditional Album','Candid Album','Photo Book','Mini Album','Coffee Table Album','Customized Album','Other']
 WHEN 'PAYMENT_TYPE' THEN ARRAY['Cash','UPI','Bank Transfer','Cheque','Card']
 WHEN 'EVENT_TYPE' THEN ARRAY['Wedding','Engagement','Reception','Birthday','Pre-Wedding','Other']
 WHEN 'EXPENSE_CATEGORY' THEN ARRAY['Salaries','Equipment','Printing','Travel','Other']
 WHEN 'EQUIPMENT_CATEGORY' THEN ARRAY['Camera','Lens','Lighting','Tripod','Audio','Accessories','Other']
 WHEN 'ALBUM_SIZE' THEN ARRAY['8×12','10×12','12×15','12×18','Other']
 WHEN 'PACKAGE_TYPE' THEN ARRAY['Basic','Standard','Premium','Customized'] END) WITH ORDINALITY v(name,n)
ON CONFLICT(entity_id,value_code) DO NOTHING;
-- Import every existing custom text, preserving alternate spellings as aliases.
DO $$ DECLARE r RECORD; eid BIGINT; BEGIN
 FOR r IN SELECT 'ALBUM_TYPE' AS code,album_type AS name FROM albums UNION SELECT 'ALBUM_SIZE',size FROM albums UNION SELECT 'PAYMENT_TYPE',method FROM payments UNION SELECT 'EVENT_TYPE',name FROM event_types UNION SELECT 'EXPENSE_CATEGORY',category FROM expenses UNION SELECT 'EQUIPMENT_CATEGORY',category FROM equipment LOOP
  SELECT entity_id INTO eid FROM master_entity WHERE entity_code=r.code;
  INSERT INTO master_entity_value(entity_id,value_code,value_name,stored_value,display_order)
  VALUES(eid,master_code(r.name),r.name,r.name,1000)
  ON CONFLICT(entity_id,value_code) DO UPDATE SET legacy_aliases=array_append(master_entity_value.legacy_aliases,EXCLUDED.stored_value)
  WHERE master_entity_value.stored_value<>EXCLUDED.stored_value AND NOT EXCLUDED.stored_value=ANY(master_entity_value.legacy_aliases);
 END LOOP;
 -- Bridge the old event FK without renumbering or renaming any existing event.
 INSERT INTO event_types(name) SELECT v.value_name FROM master_entity_value v JOIN master_entity e USING(entity_id)
 WHERE e.entity_code='EVENT_TYPE' AND NOT EXISTS(SELECT 1 FROM event_types t WHERE master_code(t.name)=v.value_code) ON CONFLICT DO NOTHING;
 UPDATE master_entity_value v SET legacy_event_type_id=(SELECT min(t.id) FROM event_types t WHERE master_code(t.name)=v.value_code)
 FROM master_entity e WHERE e.entity_id=v.entity_id AND e.entity_code='EVENT_TYPE';
END;$$;
ALTER TABLE packages ADD COLUMN package_type TEXT;
-- Replace fixed category lists with transactional service validation against active masters.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE expenses DROP CONSTRAINT expenses_category_check;
ALTER TABLE equipment DROP CONSTRAINT equipment_category_check;
CREATE TRIGGER protect_master_entity BEFORE INSERT OR UPDATE ON master_entity FOR EACH ROW EXECUTE FUNCTION protect_master_codes();
CREATE TRIGGER protect_master_value BEFORE INSERT OR UPDATE ON master_entity_value FOR EACH ROW EXECUTE FUNCTION protect_master_codes();
DO $$ BEGIN
 IF (SELECT count(*) FROM master_entity WHERE entity_code IN ('ALBUM_TYPE','PAYMENT_TYPE','EVENT_TYPE','EXPENSE_CATEGORY','EQUIPMENT_CATEGORY','ALBUM_SIZE','PACKAGE_TYPE'))<>7 THEN RAISE EXCEPTION 'Default master entities missing'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('ALBUM_TYPE',21),('PAYMENT_TYPE',5),('EVENT_TYPE',6),('EXPENSE_CATEGORY',5),('EQUIPMENT_CATEGORY',7),('ALBUM_SIZE',5),('PACKAGE_TYPE',4)) expected(code,n)
 WHERE (SELECT count(*) FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.entity_code=expected.code)<expected.n) THEN RAISE EXCEPTION 'Default master values missing'; END IF;
 IF EXISTS(SELECT 1 FROM master_entity_value v LEFT JOIN master_entity e USING(entity_id) WHERE e.entity_id IS NULL) THEN RAISE EXCEPTION 'Orphan master values'; END IF;
END;$$;

-- Preserve existing records; require profile details through API validation on save.
ALTER TABLE staff ADD COLUMN dob DATE;
ALTER TABLE staff ADD COLUMN email TEXT;
ALTER TABLE staff ADD COLUMN address TEXT;
ALTER TABLE staff ADD CONSTRAINT staff_dob_valid CHECK(dob IS NULL OR dob<=(now() AT TIME ZONE 'Asia/Kolkata')::date);
ALTER TABLE staff ADD CONSTRAINT staff_email_valid CHECK(email IS NULL OR length(trim(email))>0);
ALTER TABLE staff ADD CONSTRAINT staff_address_valid CHECK(address IS NULL OR length(trim(address))>0);

-- Add optional fields without rewriting existing customer records.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender TEXT;
INSERT INTO master_entity(entity_code,entity_name,display_order) VALUES
('CUSTOMER_TITLE','Customer Title',8),('CUSTOMER_GENDER','Customer Gender',9)
ON CONFLICT(entity_code) DO NOTHING;
INSERT INTO master_entity_value(entity_id,value_code,value_name,stored_value,display_order)
SELECT e.entity_id,master_code(v.name),v.name,v.name,v.n
FROM master_entity e CROSS JOIN LATERAL unnest(CASE e.entity_code
WHEN 'CUSTOMER_TITLE' THEN ARRAY['Mr.','Mrs.','Ms.','Mx.','Dr.']
WHEN 'CUSTOMER_GENDER' THEN ARRAY['Male','Female','Non-binary','Other','Prefer not to say'] END) WITH ORDINALITY v(name,n)
WHERE e.entity_code IN ('CUSTOMER_TITLE','CUSTOMER_GENDER') ON CONFLICT(entity_id,value_code) DO NOTHING;

DO $customer_details_types$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid='customers'::regclass AND attname IN ('title','gender')
     AND NOT attisdropped AND (atttypid NOT IN ('text'::regtype,'varchar'::regtype) OR attgenerated<>'')) THEN
  RAISE EXCEPTION 'Existing customer title/gender columns must be text or varchar and not generated. No data changed.';
 END IF;
END;$customer_details_types$;

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


CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001_invoices_equipment'),('002_payment_reversals'),('003_receipt_design'),('004_master_management'),('005_staff_details'),('006_customer_title_gender'),('007_payment_discounts'),('008_audit_fixes');
COMMIT;
