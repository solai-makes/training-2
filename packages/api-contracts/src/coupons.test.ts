import assert from "node:assert/strict";
import test from "node:test";
import { couponQuote } from "./coupons.ts";

test("coupons require a subtotal strictly above 20000 JPY", () => {
  for (const code of ["solai26", "santhoshhere341"]) {
    assert.ok(couponQuote(19_999, code).error);
    assert.ok(couponQuote(20_000, code).error);
    assert.equal(couponQuote(20_001, code).error, "");
  }
});
test("coupon codes normalize case and discounts round to whole yen", () => {
  assert.equal(couponQuote(20_001, " SOLAI26 ").discount, 2000);
  assert.equal(couponQuote(20_010, "santhoshhere341").discount, 1601);
  assert.equal(couponQuote(90_000).discount, 0);
  assert.ok(couponQuote(90_000, "unknown").error);
});
