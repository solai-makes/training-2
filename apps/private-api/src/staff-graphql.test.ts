import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {staffOperations,matchStaffOperation,staffDocument} from '../../../packages/api-contracts/src/staff-graphql.ts';
import {staffPermission,allowed} from '../../../packages/api-contracts/src/growth-policy.ts';
import {parse} from 'postgraphile/graphql';
import {validateCatalogQuery} from './graphql-policy.ts';
test('all staff operations have unique named documents and preserve role permissions',()=>{
 assert.equal(new Set(staffOperations.map(op=>op.name)).size,staffOperations.length);
 for(const operation of staffOperations){assert.equal(operation.permission,staffPermission(operation.path,operation.method),operation.name);const query=staffDocument(operation);assert.doesNotThrow(()=>parse(query));const variables=Object.fromEntries(Object.entries(operation.args).filter(([,type])=>type==='Int').map(([key])=>[key,key==='pageSize'?20:1]));assert.doesNotThrow(()=>validateCatalogQuery(query,variables));if(operation.kind==='mutation')assert.notEqual(operation.method,'GET');}
 assert.ok(!allowed('inventory','orders:write'));assert.ok(!allowed('support','refunds:write'));assert.ok(!allowed('manager','staff:write'));assert.ok(!allowed('disabled','catalog:view'));
});
test('every existing store route has an explicit GraphQL operation',async()=>{
 for(const [file,prefix] of [['store-routes.ts','/store'],['growth-routes.ts','/store/growth'],['profit-routes.ts','/store/profit']]){
  const source=await readFile(new URL(file,import.meta.url),'utf8');for(const route of source.matchAll(/(?:storeRoutes|growthRoutes|profitRoutes)\.(get|post|put|delete)\(['"]([^'"]+)['"]/g)){const path=(prefix+route[2]).replace(/\/$/,'').replaceAll(':id','9c710afe-9aca-467c-abf3-3168db63640d');assert.ok(matchStaffOperation(path,route[1].toUpperCase()),route[1]+' '+path);}
 }
});
