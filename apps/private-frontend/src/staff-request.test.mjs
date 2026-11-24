import assert from 'node:assert/strict';
import {test} from 'node:test';
import {staffRequest} from './staff-request.ts';
import {staffQueryClient} from './query-client.ts';
import {staffOperations} from '../../../packages/api-contracts/src/staff-graphql.ts';
test('all staff business calls use GraphQL and preserve mutation variables without REST fallback',async()=>{
 const originalFetch=globalThis.fetch,originalLocation=globalThis.location,calls=[];
 globalThis.location={origin:'http://staff.test'};
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return Response.json({data:{result:{ok:true}}});};
 try{for(const operation of staffOperations){const path='/api'+operation.path.replaceAll(':id','9c710afe-9aca-467c-abf3-3168db63640d');const options={method:operation.method,headers:{Authorization:'Bearer qa-session'}};if(operation.args.input)options.body=JSON.stringify({name:'Test input'});const response=await staffRequest(path,options);assert.equal(response.response.ok,true);const call=calls.at(-1);assert.equal(call.url,'http://staff.test/api/graphql');assert.match(call.body.query,new RegExp(operation.kind+' '+operation.name));if(operation.args.input)assert.deepEqual(call.body.variables.input,{name:'Test input'});}
 assert.equal(calls.length,staffOperations.length);
 }finally{globalThis.fetch=originalFetch;globalThis.location=originalLocation;staffQueryClient.clear();}
});
test('GraphQL conflicts reach the form and failed saves are never retried',async()=>{
 const originalFetch=globalThis.fetch,originalLocation=globalThis.location;let calls=0;globalThis.location={origin:'http://staff.test'};globalThis.fetch=async()=>{calls++;return Response.json({errors:[{message:'The product changed.',extensions:{code:'CONFLICT',status:409}}]},{status:400});};
 try{const response=await staffRequest('/api/products/9c710afe-9aca-467c-abf3-3168db63640d',{method:'PUT',body:'{}'});assert.equal(response.response.status,409);assert.equal(response.body.message,'The product changed.');assert.equal(calls,1);}finally{globalThis.fetch=originalFetch;globalThis.location=originalLocation;staffQueryClient.clear();}
});

