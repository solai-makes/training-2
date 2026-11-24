import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../private-api/package.json',import.meta.url));
const {Pool}=require('pg');
const original=process.env.DATABASE_URL;
if(!original)throw Error('Run inside the development container.');
const pool=new Pool({connectionString:original});
const schema='qa_customer_care_'+randomUUID().replaceAll('-','');
let db;
try{
 await pool.query(`CREATE SCHEMA ${schema}`);
 const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();
 ({db}=await import('../../../packages/prisma/src/index.ts'));
 await pool.query(`CREATE TABLE ${schema}.products(id uuid PRIMARY KEY,name text NOT NULL,stock integer NOT NULL)`);
 const sql=await readFile(new URL('../../../packages/postgres/migrations/013_restock_requests.sql',import.meta.url),'utf8');
 const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL search_path TO ${schema}`);await client.query(sql);await client.query('COMMIT');}finally{client.release();}
 const {requestRestock,restockRequests,restockDemand,cancelRestock}=await import('../../../packages/prisma/src/restock.ts');
 const id=randomUUID(),available=randomUUID();await pool.query(`INSERT INTO ${schema}.products VALUES($1,'Sold-out test',0),($2,'In-stock test',5)`,[id,available]);
 await Promise.all([requestRestock('qa-a',id),requestRestock('qa-a',id)]);
 assert.equal((await restockRequests('qa-a')).length,1,'duplicate requests must not inflate demand');
 assert.equal((await restockRequests('qa-b')).length,0,'customers see only their requests');
 await requestRestock('qa-b',id);assert.equal((await restockDemand())[0].requests,2);
 await assert.rejects(()=>requestRestock('qa-a',available),e=>e.code==='ALREADY_AVAILABLE');
 await assert.rejects(()=>requestRestock('qa-a',randomUUID()),e=>e.code==='PRODUCT_NOT_FOUND');
 await cancelRestock('qa-other',id);assert.equal((await restockDemand())[0].requests,2,'cannot remove another customer request');
 await pool.query(`UPDATE ${schema}.products SET stock=3 WHERE id=$1`,[id]);assert.equal((await restockRequests('qa-a'))[0].stock,3,'restocked availability is live');
 await cancelRestock('qa-a',id);assert.equal((await restockRequests('qa-a')).length,0);assert.equal((await restockDemand())[0].requests,1);
 const {Recipient}=await import('../../../packages/api-contracts/src/index.ts');
 const base={name:'Customer',address:'Street',city:'City',postalCode:'1000001'};
 assert.equal(Recipient.safeParse(base).success,true,'old addresses stay valid');
 assert.equal(Recipient.safeParse({...base,deliveryPreference:'call'}).success,false,'call delivery requires a phone');
 assert.equal(Recipient.safeParse({...base,deliveryPreference:'call',deliveryPhone:'+81 90 1234 5678',deliveryInstructions:'Reception desk'}).success,true);
 assert.equal(Recipient.safeParse({...base,deliveryInstructions:'x'.repeat(401)}).success,false);
 assert.equal(Recipient.safeParse({...base,deliveryPreference:'unknown'}).success,false);
 const {AddressInput}=await import('../../../packages/api-contracts/src/shopping-tools.ts');assert.equal(AddressInput.safeParse({label:'Home',recipient:{...base,deliveryPreference:'reception',deliveryInstructions:'Front desk'}}).success,true,'saved addresses accept delivery preferences');
 console.log('Customer care checks passed: deduplication, ownership, demand totals, live stock, cancellation, missing/available products, and delivery validation. All test data was isolated.');
}finally{
 if(db)await db.$disconnect();process.env.DATABASE_URL=original;
 await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();
}
