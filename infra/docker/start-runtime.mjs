import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
await mkdir('.local',{recursive:true});
const setup=spawn(process.execPath,['apps/private-api/src/setup.ts'],{stdio:'inherit'});
await new Promise((resolve,reject)=>setup.once('exit',code=>code===0?resolve():reject(Error('Runtime setup failed'))));
const children=['apps/public-api/src/server.ts','apps/private-api/src/index.ts','infra/docker/web-runtime.mjs'].map(file=>spawn(process.execPath,[file],{stdio:'inherit'}));
let stopping=false;function stop(code){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),1500).unref();}
for(const child of children)child.once('exit',code=>stop(code??1));
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
