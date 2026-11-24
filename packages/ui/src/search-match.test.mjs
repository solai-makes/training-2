import {test} from "node:test";import assert from "node:assert/strict";import {searchMatches} from "./search-match.ts";
const data=[{id:"1",name:"Samsung Galaxy",code:"M1",description:"Mobile phone"},{id:"2",name:"Samsung charger",code:"C1",description:"USB charger"},{id:"3",name:"Case",code:"K1",description:"Fits Samsung"},{id:"4",name:"Samsung Blue",code:"V1",variantParentId:"1"},{id:"5",name:"Apple",code:"A1"}];
test("partial name ranks before description and excludes duplicate variant SKUs",()=>assert.deepEqual(searchMatches(data,"sam").map(p=>p.id),["1","2","3"]));
test("multiple words and Unicode normalization match without case sensitivity",()=>assert.deepEqual(searchMatches(data,"ＳＡＭ charger").map(p=>p.id),["2"]));
test("blank and unknown queries have no suggestions",()=>{assert.deepEqual(searchMatches(data,"  "),[]);assert.deepEqual(searchMatches(data,"xyz"),[]);});
