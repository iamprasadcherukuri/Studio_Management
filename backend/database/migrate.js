import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {backupDatabase} from '../scripts/backup.js';
export async function migrate(client,schema='studio',down=false){
 if(!/^[a-z_][a-z0-9_]*$/.test(schema))throw new Error('Invalid migration schema');
 await client.query('BEGIN');
 try {
  await client.query("SELECT set_config('search_path',$1,true)",[`${schema},public`]);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",['studio-migrations:'+schema]);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const version='001_invoices_equipment';const exists=(await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount;
  if(down&&exists){
   const {rows}=await client.query('SELECT (SELECT count(*) FROM invoices)+(SELECT count(*) FROM equipment)+(SELECT count(*) FROM equipment_assignments)+(SELECT count(*) FROM equipment_maintenance) AS records');
   if(Number(rows[0].records)>0)throw new Error('Rollback refused: feature records exist; preserve/export them before planning rollback');
   await client.query(await readFile(new URL(`./migrations/${version}.down.sql`,import.meta.url),'utf8'));
   await client.query('DELETE FROM schema_migrations WHERE version=$1',[version]);
  } else if(!down&&!exists){await client.query(await readFile(new URL(`./migrations/${version}.up.sql`,import.meta.url),'utf8'));await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);}
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.env.NODE_ENV==='production'&&!process.argv.includes('--approve-production'))throw new Error('Production migration needs explicit --approve-production');
 await backupDatabase();
 const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
 try{await migrate(c,process.env.DB_SCHEMA||'studio',process.argv.includes('--down'));console.log('Migration complete.');}finally{await c.end();}
}
