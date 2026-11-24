import assert from 'node:assert/strict';
import {test} from 'node:test';
import {staffRequest} from './staff-request.ts';
import {staffQueryClient} from './query-client.ts';
test('turning off profit estimates sends an actual false GraphQL flag',async()=>{
 const previousFetch=globalThis.fetch,previousLocation=globalThis.location;let variables;globalThis.location={origin:'http://staff.test'};globalThis.fetch=async(_url,options)=>{variables=JSON.parse(options.body).variables;return Response.json({data:{result:{estimateMissingCosts:false}}});};
 try{const result=await staffRequest('/api/store/profit?days=30&estimateMissingCosts=false');assert.equal(variables.estimateMissingCosts,false);assert.equal(variables.days,30);assert.equal(result.body.estimateMissingCosts,false);}finally{globalThis.fetch=previousFetch;globalThis.location=previousLocation;staffQueryClient.clear();}
});
