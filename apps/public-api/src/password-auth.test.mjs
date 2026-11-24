import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../private-api/package.json',import.meta.url));const {Pool}=require('pg');
const original=process.env.DATABASE_URL;if(!original)throw Error('Run inside the Dev Container.');
const pool=new Pool({connectionString:original}),schema='qa_password_'+randomUUID().replaceAll('-','');let db;
try{
 await pool.query(`CREATE SCHEMA ${schema}`);const url=new URL(original);url.searchParams.set('options',`-c search_path=${schema}`);process.env.DATABASE_URL=url.toString();({db}=await import('../../../packages/prisma/src/index.ts'));
 const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL search_path TO ${schema}`);for(const name of ['010_customer_otp.sql','015_customer_passwords.sql'])await client.query(await readFile(new URL('../../../packages/postgres/migrations/'+name,import.meta.url),'utf8'));await client.query('COMMIT');}finally{client.release();}
 const {customerAuth:app,customerSession}=await import('./customer-auth.ts');
 app.onError((e,c)=>c.json({message:e.message},e.status??500));
 const call=async(path,body,token)=>{const response=await app.request('http://localhost'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const password='Local-test-only-42!',email='account-a@example.test';
 const first=await call('/register',{email,name:'Account A',password});assert.equal(first.status,201);assert.ok(first.token.startsWith('ss_'));
 const identity=await customerSession(first.token);assert.equal(identity.guest,false);
 const stored=await pool.query(`SELECT w.password_hash,p.verified_at FROM ${schema}.store_customer_passwords w JOIN ${schema}.store_customer_profiles p ON p.id=w.customer_id`);assert.match(stored.rows[0].password_hash,/^scrypt\$/);assert.ok(!stored.rows[0].password_hash.includes(password));assert.equal(stored.rows[0].verified_at,null);
 assert.equal((await call('/register',{email:email.toUpperCase(),name:'Impostor',password})).status,409);
 assert.equal((await call('/login',{email,password:'wrong-password'})).status,401);
 assert.equal((await call('/login',{email:'missing@example.test',password})).status,401);
 for(let i=0;i<3;i++){const again=await call('/login',{email:email.toUpperCase(),password});assert.equal(again.status,200);assert.equal((await customerSession(again.token)).sub,identity.sub);}
 const second=await call('/register',{email:'account-b@example.test',name:'Account B',password});assert.equal(second.status,201);assert.notEqual((await customerSession(second.token)).sub,identity.sub);
 assert.equal((await call('/password/set',{password:'Replacement-42!',currentPassword:'wrong'},first.token)).status,401);
 assert.equal((await call('/password/set',{password:'Replacement-42!',currentPassword:password},first.token)).status,200);
 assert.equal((await call('/login',{email,password})).status,401);assert.equal((await call('/login',{email,password:'Replacement-42!'})).status,200);
 assert.equal((await call('/password/set',{password},second.token)).status,401,'cannot change an existing password without current password');
 const profile=(await pool.query(`INSERT INTO ${schema}.store_customer_profiles(channel,identifier,name) VALUES('email','old@example.test','Existing customer') RETURNING id`)).rows[0];
 assert.equal((await call('/register',{email:'old@example.test',name:'Takeover',password})).status,409,'registration never claims existing OTP profiles');
 // Represent a session already authenticated through the previous email system.
 const {createHash}=await import('node:crypto');const oldToken='ss_'+'a'.repeat(64);await pool.query(`INSERT INTO ${schema}.store_customer_sessions(token_hash,customer_id,name,expires_at) VALUES($1,$2,'Existing customer',now()+interval '1 hour')`,[createHash('sha256').update(oldToken).digest('hex'),profile.id]);
 assert.equal((await call('/password/status',undefined,oldToken)).hasPassword,false);
 assert.equal((await call('/password/set',{password},oldToken)).status,200);assert.equal((await customerSession((await call('/login',{email:'old@example.test',password})).token)).sub,profile.id,'existing customer keeps the same data owner');
 const guest=await call('/guest',{});assert.equal((await call('/password/set',{password},guest.token)).status,401);
 await call('/logout',{},first.token);assert.equal(await customerSession(first.token),null);assert.equal((await call('/password/set',{password})).status,401);
 assert.equal((await call('/register',{email:'weak@example.test',name:'Weak',password:'123'})).status,400);
 let last;for(let i=0;i<18;i++)last=await call('/login',{email:'rate@example.test',password});assert.equal(last.status,429);
 console.log('Password auth passed: secure hashes, repeat sign-in, wrong credentials, case-insensitive duplicates, separate identities, password changes, existing-account preservation, guest restrictions, logout and rate limits. All data isolated.');
}finally{if(db)await db.$disconnect();process.env.DATABASE_URL=original;await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
