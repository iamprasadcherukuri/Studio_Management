import 'dotenv/config';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
export async function backupDatabase(){
 const connection=new URL(process.env.DATABASE_URL);
 const directory=fileURLToPath(new URL('../../backups/',import.meta.url));
 await mkdir(directory,{recursive:true});
 const filename=directory+`studio-${new Date().toISOString().replaceAll(/[:.]/g,'-')}.dump`;
 const executable=process.env.PG_DUMP_PATH||(process.platform==='win32'?`${process.env.ProgramFiles}/PostgreSQL/18/bin/pg_dump.exe`:'pg_dump');
 await new Promise((resolve,reject)=>{
  const child=spawn(executable,['--format=custom','--no-owner','--no-acl','--file',filename],{windowsHide:true,env:{...process.env,PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGDATABASE:decodeURIComponent(connection.pathname.slice(1)),PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password)}});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`pg_dump failed (${code}); migration stopped`)));child.stderr.on('data',()=>{});
 });
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{const rows=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='studio' AND table_type='BASE TABLE' ORDER BY table_name")).rows;const counts={};for(const {table_name} of rows){if(!/^[a-z_]+$/.test(table_name))throw new Error('Unexpected table name');counts[table_name]=(await client.query(`SELECT count(*)::text AS count FROM studio.${table_name}`)).rows[0].count;}await writeFile(filename+'.counts.json',JSON.stringify(counts,null,2));}finally{await client.end();}
 console.log(`Backup saved: ${filename}`);return filename;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await backupDatabase();
