import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=[];for(const dir of ['packages/api-contracts/src','packages/ui/src'])for(const name of await readdir(dir))if(/\.test\.(ts|mjs)$/.test(name))files.push(dir+'/'+name);
files.push('apps/private-frontend/src/workspace-request.test.mjs','apps/private-frontend/src/query-client.test.mjs','apps/private-api/src/graphql-policy.test.ts','apps/private-api/src/staff-graphql.test.ts','apps/private-frontend/src/staff-request.test.mjs');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});process.exit(result.status??1);
