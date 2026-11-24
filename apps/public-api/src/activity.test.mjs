import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../private-api/package.json',import.meta.url));const {Pool}=require('pg');
const original=process.env.DATABASE_URL;if(!original)throw Error('Run inside the Dev Container.');
const pool=new Pool({connectionString:original}),schema='qa_activity_'+randomUUID().replaceAll('-','');let db;
try{
 await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();({db}=await import('../../../packages/prisma/src/index.ts'));
 const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL search_path TO ${schema}`);
 await client.query('CREATE TABLE products(id uuid PRIMARY KEY,name text NOT NULL,stock integer NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE orders(id uuid PRIMARY KEY,customer_id text NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE store_order_details(order_id uuid PRIMARY KEY REFERENCES orders(id),payload jsonb);CREATE TABLE store_returns(id uuid PRIMARY KEY,order_id uuid,customer_id text,status text,updated_at timestamptz);');
 for(const name of ['013_restock_requests.sql','014_wishlist_notifications.sql'])await client.query(await readFile(new URL('../../../packages/postgres/migrations/'+name,import.meta.url),'utf8'));await client.query('COMMIT');}finally{client.release();}
 const {wishlist,saveWishlist,removeWishlist,notificationFeed,readNotifications}=await import('../../../packages/prisma/src/customer-activity.ts');
 const product=randomUUID(),product2=randomUUID(),missing=randomUUID(),order=randomUUID(),ret=randomUUID();
 const now=Date.now()+1000,updated=new Date(now-60000),confirmed=new Date(now-7200000).toISOString();
 await pool.query(`INSERT INTO ${schema}.products VALUES($1,'Wishlist phone',0,$3),($2,'Other product',5,$3)`,[product,product2,updated]);
 await Promise.all([saveWishlist('qa-a',[product],true),saveWishlist('qa-a',[product],true)]);assert.equal((await wishlist('qa-a')).length,1,'wishlist deduplicates concurrent saves');assert.equal((await wishlist('qa-b')).length,0,'wishlist is private');
 await saveWishlist('qa-a',[product,product2,missing]);assert.equal((await wishlist('qa-a')).length,2,'guest imports ignore deleted products and duplicates');
 await assert.rejects(()=>saveWishlist('qa-a',[missing],true),e=>e.code==='PRODUCT_NOT_FOUND');await assert.rejects(()=>saveWishlist('qa-a',Array.from({length:201},()=>randomUUID())),e=>e.code==='WISHLIST_LIMIT');
 await removeWishlist('qa-b',product);assert.equal((await wishlist('qa-a')).length,2);await removeWishlist('qa-a',product2);assert.equal((await wishlist('qa-a')).length,1);
 await pool.query(`INSERT INTO ${schema}.orders VALUES($1,'qa-a','confirmed',$2)`,[order,updated]);await pool.query(`INSERT INTO ${schema}.store_order_details VALUES($1,$2::jsonb)`,[order,JSON.stringify({confirmedAt:confirmed})]);await pool.query(`INSERT INTO ${schema}.store_returns VALUES($1,$2,'qa-a','approved',$3)`,[ret,order,updated]);await pool.query(`INSERT INTO ${schema}.store_restock_requests VALUES('qa-a',$1,$2)`,[product,updated]);
 let feed=await notificationFeed('qa-a',now);assert.equal(feed.items.length,2);assert.equal(feed.unread,2);assert.ok(feed.items.some(n=>n.payload.title==='Order shipped'));assert.ok(feed.items.some(n=>n.payload.title==='Return approved'));
 await Promise.all([notificationFeed('qa-a',now),notificationFeed('qa-a',now)]);assert.equal((await notificationFeed('qa-a',now)).unread,2,'refresh never duplicates notices');assert.equal((await notificationFeed('qa-b',now)).items.length,0,'notification feed is private');
 await readNotifications('qa-b',feed.items[0].id);assert.equal((await notificationFeed('qa-a',now)).unread,2,'cannot mark another account notice');await readNotifications('qa-a',feed.items[0].id);assert.equal((await notificationFeed('qa-a',now)).unread,1);await readNotifications('qa-a');assert.equal((await notificationFeed('qa-a',now)).unread,0,'read state survives refresh');
 await pool.query(`UPDATE ${schema}.products SET stock=3,updated_at=$2 WHERE id=$1`,[product,new Date(now-100)]);feed=await notificationFeed('qa-a',now);assert.equal(feed.unread,1);assert.ok(feed.items.some(n=>n.payload.title==='Back in stock'));
 feed=await notificationFeed('qa-a',now+4*3600000);assert.ok(feed.items.some(n=>n.payload.title==='Out for delivery'),'automatic timeline advances after five hours');await pool.query(`UPDATE ${schema}.store_order_details SET payload=jsonb_set(payload,'{tracking}',$2::jsonb) WHERE order_id=$1`,[order,JSON.stringify({stage:'out_for_delivery',history:[{stage:'out_for_delivery',at:new Date(now).toISOString()}]})]);feed=await notificationFeed('qa-a',now+4*3600000);assert.ok(feed.items.some(n=>n.payload.title==='Out for delivery'));
 await pool.query(`UPDATE ${schema}.orders SET status='cancelled',updated_at=$2 WHERE id=$1`,[order,updated]);feed=await notificationFeed('qa-a',now+26*3600000);assert.ok(feed.items.some(n=>n.payload.title==='Order cancelled'));assert.ok(!feed.items.some(n=>n.payload.title==='Order delivered'),'cancelled orders never emit delivery completion');
 console.log('Wishlist and notification checks passed: guest merge, limits, duplicates, ownership, unread persistence, restock alerts, automatic tracking and cancellation. All data was isolated.');
}finally{if(db)await db.$disconnect();process.env.DATABASE_URL=original;await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
