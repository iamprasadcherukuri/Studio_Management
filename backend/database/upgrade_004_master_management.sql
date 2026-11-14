-- Review and back up the target before execution. Existing records are preserved.
BEGIN;
SET LOCAL search_path TO studio,public;
SELECT pg_advisory_xact_lock(hashtext('studio-migrations:studio'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='003_receipt_design') THEN RAISE EXCEPTION 'Apply migration 003 first'; END IF;
IF EXISTS(SELECT 1 FROM schema_migrations WHERE version='004_master_management') THEN RAISE EXCEPTION 'Master migration already applied'; END IF;
END; $$;
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

INSERT INTO schema_migrations(version) VALUES('004_master_management');
COMMIT;
