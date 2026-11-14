-- Review and back up before execution. Existing customers remain unchanged.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='005_staff_details') THEN RAISE EXCEPTION 'Apply migration 005 first'; END IF;
IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='006_customer_title_gender') THEN RAISE EXCEPTION 'Customer details migration already applied'; END IF;
END;$$;
-- Add optional fields without rewriting existing customer records.
ALTER TABLE customers ADD COLUMN title TEXT;
ALTER TABLE customers ADD COLUMN gender TEXT;
INSERT INTO master_entity(entity_code,entity_name,display_order) VALUES
('CUSTOMER_TITLE','Customer Title',8),('CUSTOMER_GENDER','Customer Gender',9)
ON CONFLICT(entity_code) DO NOTHING;
INSERT INTO master_entity_value(entity_id,value_code,value_name,stored_value,display_order)
SELECT e.entity_id,master_code(v.name),v.name,v.name,v.n
FROM master_entity e CROSS JOIN LATERAL unnest(CASE e.entity_code
WHEN 'CUSTOMER_TITLE' THEN ARRAY['Mr.','Mrs.','Ms.','Mx.','Dr.']
WHEN 'CUSTOMER_GENDER' THEN ARRAY['Male','Female','Non-binary','Other','Prefer not to say'] END) WITH ORDINALITY v(name,n)
WHERE e.entity_code IN ('CUSTOMER_TITLE','CUSTOMER_GENDER') ON CONFLICT(entity_id,value_code) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES('006_customer_title_gender');
COMMIT;
