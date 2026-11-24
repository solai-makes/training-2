import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),{Pool}=require('pg');const original=process.env.DATABASE_URL;if(!original)throw Error('Run in the Dev Container.');const pool=new Pool({connectionString:original}),schema='qa_fleet_'+randomUUID().replaceAll('-','');let db;
try{
 await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();({db}=await import('../../../packages/prisma/src/index.ts'));
 await pool.query(`CREATE TABLE ${schema}.orders(id uuid PRIMARY KEY,status text);CREATE TABLE ${schema}.store_order_details(order_id uuid PRIMARY KEY,payload jsonb);`);
 const c=await pool.connect();try{await c.query('BEGIN');await c.query(`SET LOCAL search_path TO ${schema}`);await c.query(await readFile(new URL('../../../packages/postgres/migrations/016_delivery_fleet.sql',import.meta.url),'utf8'));await c.query(await readFile(new URL('../../../packages/postgres/migrations/018_delivery_profiles.sql',import.meta.url),'utf8'));await c.query(await readFile(new URL('../../../packages/postgres/migrations/020_delivery_dispatch.sql',import.meta.url),'utf8'));await c.query('ALTER TABLE store_delivery_assignments ADD COLUMN dispatched_at timestamptz');await c.query('COMMIT');}finally{c.release();}

 const {syncAutomaticDeliveries}=await import('../../../packages/prisma/src/automatic-delivery.ts');
 await pool.query(`UPDATE ${schema}.store_delivery_people SET on_duty=false`);
 const courier=(await pool.query(`SELECT id FROM ${schema}.store_delivery_people LIMIT 1`)).rows[0].id;
 await pool.query(`UPDATE ${schema}.store_delivery_people SET on_duty=true,zones=ARRAY['tokyo'] WHERE id=$1`,[courier]);
 const start=Date.now(),a=randomUUID(),b=randomUUID();
 for(const id of [a,b]){await pool.query(`INSERT INTO ${schema}.orders VALUES($1,'confirmed')`,[id]);await pool.query(`INSERT INTO ${schema}.store_order_details VALUES($1,$2::jsonb)`,[id,JSON.stringify({confirmedAt:new Date(start).toISOString(),recipient:{city:'Tokyo'},payment:{state:'due'}})]);}
 const read=async id=>(await pool.query(`SELECT payload FROM ${schema}.store_order_details WHERE order_id=$1`,[id])).rows[0].payload;
 await syncAutomaticDeliveries(start);assert.equal((await read(a)).tracking.stage,'confirmed');
 await Promise.all([syncAutomaticDeliveries(start+3600000),syncAutomaticDeliveries(start+3600000)]);
 let active=(await pool.query(`SELECT * FROM ${schema}.store_delivery_assignments WHERE released_at IS NULL`)).rows;assert.equal(active.length,1,'no concurrent double booking');
 const first=active[0].order_id,waiting=first===a?b:a;
 assert.equal((await read(first)).deliveryPerson.id,courier);assert.equal((await read(waiting)).tracking.awaitingPartner,true);
 await syncAutomaticDeliveries(start+18000000);assert.equal((await read(first)).tracking.stage,'out_for_delivery');assert.equal((await read(waiting)).tracking.stage,'shipped');
 await syncAutomaticDeliveries(start+54000000);assert.equal((await read(first)).tracking.stage,'delivered');
 await syncAutomaticDeliveries(start+54000001);assert.equal((await read(waiting)).deliveryPerson.id,courier,'completed courier reusable');
 await syncAutomaticDeliveries(start+54000002);assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.store_delivery_assignments WHERE released_at IS NULL`)).rows[0].n,0);
 console.log('Automatic delivery passed: exact milestones, area matching, concurrent assignment, unavailable queue, completion and courier reuse. Isolated test data only.');
}finally{if(db)await db.$disconnect();process.env.DATABASE_URL=original;await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
