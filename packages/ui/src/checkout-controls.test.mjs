import assert from "node:assert/strict";
import { test } from "node:test";
import { pointsFromText, quantityFromText } from "./checkout-controls.ts";
test("typed quantities preserve blank drafts and respect live stock limits",()=>{
  assert.equal(quantityFromText("12",1,487).quantity,12);
  assert.equal(quantityFromText("500",1,487).quantity,487);
  assert.equal(quantityFromText("",12,487).quantity,12);
  assert.equal(quantityFromText("0",12,487).quantity,1);
  assert.equal(quantityFromText("2.5",12,487).invalid,true);
  assert.equal(quantityFromText("2",12,0).invalid,true);
});
test("loyalty drafts require explicit valid whole-point values within the order limit",()=>{
  assert.equal(pointsFromText("30",30),30);
  assert.equal(pointsFromText("31",30),null);
  assert.equal(pointsFromText("2.5",30),null);
  assert.equal(pointsFromText("-1",30),null);
  assert.equal(pointsFromText("",30),0);
});
