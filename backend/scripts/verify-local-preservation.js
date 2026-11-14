// Read-only before/after comparison for the separately approved local 008 migration.
import 'dotenv/config';
import pg from 'pg';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const url=new URL(process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||process.env.DATABASE_TARGET==='supabase')throw new Error('Local database only');
const schema=process.env.DB_SCHEMA||'studio';assert.match(schema,/^[a-z_][a-z0-9_]*$/);
const metadata={bookings:['booking_discount_type','booking_discount_value','booking_discount_amount'],invoices:['financial_snapshot'],expenses:['idempotency_key','request_hash'],audit_logs:['details'],equipment_assignments:['cancelled_at','cancelled_by','cancellation_reason']};
const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
const file=new URL('../../test-results/migration008-preservation.json',import.meta.url);
try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const applied=Boolean((await c.query(`SELECT 1 FROM "${schema}".schema_migrations WHERE version='008_audit_fixes'`)).rowCount);
 const tables={};for(const {table_name:t} of(await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' AND table_name<>'schema_migrations' ORDER BY table_name",[schema])).rows){assert.match(t,/^[a-z_][a-z0-9_]*$/);tables[t]=(await c.query(`SELECT count(*)::text count,md5(coalesce(string_agg(md5((to_jsonb(t)-$1::text[])::text),'' ORDER BY (to_jsonb(t)-$1::text[])::text),'')) digest FROM "${schema}".${t} t`,[metadata[t]||[]])).rows[0];}
 if(process.argv.includes('--before')){assert.equal(applied,false,'008 is already applied; do not overwrite the baseline');await mkdir(new URL('../../test-results/',import.meta.url),{recursive:true});await writeFile(file,JSON.stringify({tables,created_at:new Date().toISOString(),read_only:true},null,2));console.log('Saved read-only baseline for '+Object.keys(tables).length+' original application tables');}
 else{assert.equal(applied,true,'008 is not applied');const original=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(tables,original.tables);await writeFile(file,JSON.stringify({...original,verified_at:new Date().toISOString(),original_fields_unchanged:true},null,2));console.log('PASS: all original fields/counts preserved across local migration in '+Object.keys(tables).length+' application tables');}
}finally{await c.query('ROLLBACK');await c.end();}
