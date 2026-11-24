import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await derive(password,salt)).toString('hex')}`;}
const dummy=`scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password:string,stored:string|null){const match=/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored??dummy);if(!match)return false;const actual=await derive(password,match[1]);return timingSafeEqual(actual,Buffer.from(match[2],'hex'))&&stored!==null;}
