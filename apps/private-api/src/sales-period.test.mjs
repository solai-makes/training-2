import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),{Pool}=require('pg');
const original=process.env.DATABASE_URL;if(!original)throw Error('Run inside the Dev Container.');
const pool=new Pool({connectionString:original}),schema='qa_reports_'+randomUUID().replaceAll('-','');let db;
try{
 await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();({db}=await import('../../../packages/prisma/src/index.ts'));
 await pool.query(`CREATE TABLE ${schema}.products(id uuid,name text,description text,price integer,stock integer);CREATE TABLE ${schema}.orders(id uuid,status text,created_at timestamptz);CREATE TABLE ${schema}.store_order_details(order_id uuid,payload jsonb);CREATE TABLE ${schema}.store_inventory_events(delta integer,created_at timestamptz);`);
 const {today}=(await pool.query("SELECT to_char(current_date,'YYYY-MM-DD') AS today")).rows[0];const day=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const product=randomUUID();await pool.query(`INSERT INTO ${schema}.products VALUES($1,'Report sample','Sample',1000,9)`,[product]);
 for(const [offset,total,status] of [[0,1100,'confirmed'],[-1,2200,'confirmed'],[-2,3300,'confirmed'],[-10,4400,'confirmed'],[-16,5500,'confirmed'],[-1,99999,'cancelled']]){const id=randomUUID(),date=day(offset);const confirmed=(await pool.query("SELECT ($1::date+time '12:00')::timestamptz AS stamp",[date])).rows[0].stamp.toISOString();const payload={confirmedAt:confirmed,total,items:[{productId:product,name:'Report sample',quantity:1,lineTotal:total}],payment:{provider:'cod',state:'due'}};await pool.query(`INSERT INTO ${schema}.orders VALUES($1,$2,$3)`,[id,status,confirmed]);await pool.query(`INSERT INTO ${schema}.store_order_details VALUES($1,$2::jsonb)`,[id,JSON.stringify(payload)]);}
 await pool.query(`INSERT INTO ${schema}.store_inventory_events VALUES(20,$1::date+time '10:00'),(-3,$2::date+time '10:00'),(50,$3::date+time '10:00')`,[day(-2),day(-1),today]);
 const {salesReport}=await import('../../../packages/prisma/src/sales-report.ts');
 const seven=await salesReport(7);assert.equal(seven.orders,3);assert.equal(seven.revenue,6600);assert.equal(seven.previousRevenue,4400);assert.equal(seven.daily.length,7);
 const fifteen=await salesReport(15);assert.equal(fifteen.orders,4);assert.equal(fifteen.previousRevenue,5500);assert.equal(fifteen.daily.length,15);
 const custom=await salesReport(7,{from:day(-2),to:day(-1)});assert.equal(custom.orders,2);assert.equal(custom.revenue,5500);assert.equal(custom.days,2);assert.equal(custom.from,day(-2));assert.equal(custom.to,day(-1));assert.equal(custom.stockIncoming,20);assert.equal(custom.stockOutgoing,3);assert.equal(custom.daily.reduce((sum,d)=>sum+d.revenue,0),custom.revenue);
 const single=await salesReport(7,{from:day(-1),to:day(-1)});assert.equal(single.daily.length,1);assert.equal(single.revenue,2200);assert.equal(single.previousRevenue,3300);
 const empty=await salesReport(7,{from:day(-5),to:day(-4)});assert.equal(empty.orders,0);assert.equal(empty.revenue,0);assert.equal(empty.daily.length,2);
 await assert.rejects(()=>salesReport(7,{from:day(-1),to:day(1)}),RangeError);
 console.log('Sales report checks passed: 7/15 days, inclusive custom dates, equal-length comparison, cancelled exclusions, one day, no sales and exact stock-movement boundaries. All data isolated.');
}finally{if(db)await db.$disconnect();process.env.DATABASE_URL=original;await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
