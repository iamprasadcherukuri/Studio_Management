// Disposable local schema only; never resets the real studio schema.
import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || process.env.DATABASE_TARGET === 'supabase')
  throw new Error('Reset verification is restricted to local disposable schemas');
const schema = 'studio_reset_test_' + randomBytes(6).toString('hex');
const c = new pg.Client({connectionString: url.toString()});
await c.connect();
try {
  const install = (await readFile(new URL('../database/install_all.sql',import.meta.url),'utf8')).replace(/\bstudio\b/g,schema);
  await c.query(install);
  await c.query(`SET search_path TO "${schema}",public`);
  await c.query(`BEGIN;
    INSERT INTO users(name,email,password_hash,role_id) SELECT 'Reset fixture','reset@example.test','unused',id FROM roles WHERE name='admin';
    INSERT INTO customers(name,mobile) VALUES('Reset fixture','9876543210');
    INSERT INTO staff(name,mobile) VALUES('Reset fixture','9876543210');
    INSERT INTO packages(name,amount) VALUES('Reset fixture',1000);
    INSERT INTO bookings(customer_id,event_type_id,package_id,event_date,location,agreed_amount)
      SELECT 1,id,1,CURRENT_DATE,'Fixture',1000 FROM event_types ORDER BY id LIMIT 1;
    INSERT INTO booking_staff VALUES(1,1);
    INSERT INTO payments(booking_id,date,amount,method,idempotency_key,created_by)
      VALUES(1,CURRENT_DATE,100,'Cash','00000000-0000-4000-8000-000000000001',1);
    INSERT INTO payment_reversals(payment_id,date,amount,reason,idempotency_key,request_hash,created_by)
      VALUES(1,CURRENT_DATE,10,'Fixture reversal','00000000-0000-4000-8000-000000000002','fixture',1);
    INSERT INTO invoices(booking_id,customer_id,invoice_date,due_date,studio_snapshot,customer_snapshot,subtotal,total_amount,idempotency_key,request_hash,created_by)
      VALUES(1,1,CURRENT_DATE,CURRENT_DATE,'{}','{}',1000,1000,'00000000-0000-4000-8000-000000000003','fixture',1);
    INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,line_total) VALUES(1,'Fixture',1,1000,1000);
    INSERT INTO albums(booking_id,album_type,size,pages) VALUES(1,'Wedding Album','8×12',10);
    INSERT INTO expenses(date,category,description,amount,method) VALUES(CURRENT_DATE,'Equipment','Fixture',10,'Cash');
    INSERT INTO equipment(asset_code,name,category,condition) VALUES('RESET-FIXTURE','Fixture','Camera','Good');
    INSERT INTO equipment_assignments(equipment_id,booking_id,assigned_by,assigned_date,expected_return_date)
      VALUES(1,1,1,CURRENT_DATE,CURRENT_DATE);
    INSERT INTO equipment_maintenance(equipment_id,maintenance_type,service_date,description,maintenance_cost,status,expense_id,created_by)
      VALUES(1,'Fixture',CURRENT_DATE,'Fixture',10,'Completed',1,1);
    INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES(1,'fixture','bookings',1);
    COMMIT;`);
  const targets = ['payment_reversals','payments','invoice_items','invoices','equipment_assignments','equipment_maintenance','albums','expenses','booking_staff','bookings'];
  const preserved = ['roles','users','customers','staff','packages','event_types','equipment','master_entity','master_entity_value','studio_settings','studio_brand_assets','receipt_counters','schema_migrations'];
  async function snapshot(tables) {
    const rows = {};
    for (const table of tables) rows[table] = (await c.query(`SELECT to_jsonb(t) v FROM "${schema}".${table} t ORDER BY to_jsonb(t)::text`)).rows;
    return rows;
  }
  const original = await snapshot([...targets,...preserved,'audit_logs']);
  let sql = (await readFile(new URL('../database/reset_transactions.sql',import.meta.url),'utf8')).replace(/\bstudio\b/g,schema);
  const db = decodeURIComponent(url.pathname.slice(1));
  assert.match(db,/^[a-zA-Z0-9_-]+$/);
  // Only the disposable test copy targets the configured local database.
  sql = sql.replace("current_database()<>'postgres'",`current_database()<>'${db}'`);
  await c.query(sql);
  assert.deepEqual(await snapshot([...targets,...preserved,'audit_logs']),original);
  console.log('PASS: default preview rolls back all deletions and its audit entry');
  await c.query(`CREATE TABLE "${schema}".external_link(booking_id INTEGER REFERENCES "${schema}".bookings(id)); INSERT INTO "${schema}".external_link VALUES(1)`);
  const commitSql = sql.replace(/ROLLBACK;\s*$/,'COMMIT;');
  await assert.rejects(()=>c.query(commitSql), e=>e.code==='0A000');
  await c.query('ROLLBACK');
  assert.deepEqual(await snapshot([...targets,...preserved,'audit_logs']),original);
  await c.query(`DROP TABLE "${schema}".external_link`);
  console.log('PASS: unknown foreign-key dependency stops reset without cascading');
  const seq = (await c.query(`SELECT last_value FROM "${schema}".bookings_id_seq`)).rows[0];
  await c.query(commitSql);
  for (const table of targets) assert.equal((await c.query(`SELECT count(*)::int n FROM "${schema}".${table}`)).rows[0].n,0);
  assert.deepEqual(await snapshot(preserved),Object.fromEntries(preserved.map(t=>[t,original[t]])));
  assert.deepEqual((await c.query(`SELECT last_value FROM "${schema}".bookings_id_seq`)).rows[0],seq);
  const audit = (await c.query(`SELECT * FROM "${schema}".audit_logs ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.equal(audit.action,'reset_transactions');
  for (const table of targets) assert.equal(audit.details.removed_rows[table],1);
  assert.equal((await c.query(`SELECT count(*)::int n FROM "${schema}".audit_logs`)).rows[0].n,original.audit_logs.length+1);
  console.log('PASS: explicit commit empties all 10 transaction tables, preserves setup/counters/IDs and retains audit history');
  const allTables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename", [schema])).rows.map(r=>r.tablename);
  const beforeAll = await snapshot(allTables);
  const structureQuery = "SELECT c.relname,c.relkind,a.attname,a.atttypid,a.attnotnull,a.attgenerated FROM pg_class c LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE c.relnamespace=$1::regnamespace ORDER BY c.relname,a.attnum";
  const structures = (await c.query(structureQuery,[schema])).rows;
  let allSql = (await readFile(new URL('../database/reset_all_data.sql',import.meta.url),'utf8'))
    .replace(/\bstudio\b/g,schema)
    .replace("current_database()<>'postgres'",`current_database()<>'${db}'`);
  await c.query(allSql);
  assert.deepEqual(await snapshot(allTables),beforeAll);
  console.log('PASS: all-data preview restores every table, including users, settings and audit history');
  const external = schema+'_external';
  try {
    await c.query(`CREATE SCHEMA "${external}"; CREATE TABLE "${external}".customer_ref(customer_id INTEGER REFERENCES "${schema}".customers(id)); INSERT INTO "${external}".customer_ref VALUES(1)`);
    await assert.rejects(()=>c.query(allSql.replace(/ROLLBACK;\s*$/,'COMMIT;')), e=>e.code==='0A000');
    await c.query('ROLLBACK');
    assert.deepEqual(await snapshot(allTables),beforeAll);
    console.log('PASS: all-data reset refuses an external-schema FK without changing data');
  } finally {
    await c.query('ROLLBACK');
    await c.query(`DROP SCHEMA IF EXISTS "${external}" CASCADE`);
  }
  await c.query(allSql.replace(/ROLLBACK;\s*$/,'COMMIT;'));
  const afterAll = await snapshot(allTables);
  for (const table of allTables) {
    assert.deepEqual(afterAll[table],table==='schema_migrations'?beforeAll[table]:[]);
  }
  assert.deepEqual((await c.query(structureQuery,[schema])).rows,structures);
  assert.deepEqual((await c.query(`SELECT last_value FROM "${schema}".bookings_id_seq`)).rows[0],seq);
  console.log('PASS: all-data commit clears every data table, preserves migration rows, DB structures and identity sequence');
} finally {
  await c.query('ROLLBACK');
  await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await c.end();
}
