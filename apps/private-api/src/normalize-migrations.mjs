import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {migrationChecksum,canNormalizeMigrationChecksum} from '../../../packages/postgres/src/migration-checksum.ts';
const originalDirectory=process.argv[2];
if(!originalDirectory)throw Error('Provide the previous source migration directory. No database changes were made.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000}),client=await pool.connect();let changed=0;
try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(20261023)');const rows=await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name FOR UPDATE');
 for(const row of rows.rows){if(!/^[0-9a-z_]+\.sql$/.test(row.name))throw Error('Invalid migration filename.');const original=await readFile(join(originalDirectory,row.name),'utf8');const released=await readFile(new URL('../../../packages/postgres/migrations/'+row.name,import.meta.url),'utf8');if(!canNormalizeMigrationChecksum(original,released,row.checksum))throw Error('Migration content or recorded fingerprint differs: '+row.name+'. Existing data was preserved.');const checksum=migrationChecksum(released);if(checksum!==row.checksum){await client.query('UPDATE schema_migrations SET checksum=$1 WHERE name=$2 AND checksum=$3',[checksum,row.name,row.checksum]);changed++;}}
 await client.query('COMMIT');console.log('Verified unchanged SQL for '+rows.rowCount+' migrations. Normalized '+changed+' line-ending fingerprints. No migrations were rerun; store records were preserved.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
