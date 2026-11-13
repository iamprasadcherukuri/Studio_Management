import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const schema='studio_test_'+randomBytes(6).toString('hex');
assert.match(schema,/^studio_test_[a-f0-9]{12}$/);
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 const sql=(await readFile(new URL('../database/install_all.sql',import.meta.url),'utf8')).replace(/\bstudio\b/g,schema);
 await client.query(sql);
 const tables=(await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type=$2',[schema,'BASE TABLE'])).rows;
 assert.equal(tables.length,19);
 assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${schema}.users`)).rows[0].count,0);
 assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${schema}.roles`)).rows[0].count,2);
 assert.equal((await client.query(`SELECT version FROM ${schema}.schema_migrations`)).rows[0].version,'001_invoices_equipment');
 await assert.rejects(()=>client.query(sql),/already contains tables/);
 await client.query('ROLLBACK');
 assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${schema}.roles`)).rows[0].count,2);
 console.log('PASS: single-run installation creates all 19 tables and records the migration; repeat execution is blocked without modifying records.');
}finally{await client.query('ROLLBACK');await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await client.end();}
