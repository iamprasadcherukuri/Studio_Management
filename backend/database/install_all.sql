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


CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('001_invoices_equipment');
COMMIT;
