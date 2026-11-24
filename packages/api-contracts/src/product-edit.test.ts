import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ProductUpdateInput} from './index.ts';
const product={name:'Tripod',price:1300,stock:8};
test('product edits accept UTC and offset timestamps returned by the APIs',()=>{
 for(const expectedUpdatedAt of ['2026-11-24T06:54:17.619Z','2026-11-24T06:54:17.619550+00:00','2026-11-24T15:54:17.619550+09:00'])assert.equal(ProductUpdateInput.safeParse({...product,expectedUpdatedAt}).success,true,expectedUpdatedAt);
});
test('product edits still reject malformed or timezone-less concurrency timestamps',()=>{
 for(const expectedUpdatedAt of ['','not-a-date','2026-13-24T06:54:17Z','2026-11-24T06:54:17'])assert.equal(ProductUpdateInput.safeParse({...product,expectedUpdatedAt}).success,false,expectedUpdatedAt);
});
