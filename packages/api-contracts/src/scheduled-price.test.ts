import assert from "node:assert/strict";
import test from "node:test";
import { prepareProduct } from "./product-details.ts";
import { pricedProduct } from "./scheduled-price.ts";

test("scheduled offers start inclusively and end exclusively", () => {
  const startsAt = "2026-10-28T10:00:00.000Z",
    endsAt = "2026-10-28T11:00:00.000Z";
  const input = {
    name: "Test",
    description: "Sample",
    price: 1000,
    category: "Wellness" as const,
    discountPercent: 20,
    offerStartsAt: startsAt,
    offerEndsAt: endsAt,
  };
  const product = { ...input, ...prepareProduct(input) };
  assert.equal(product.price, 1000);
  assert.equal(pricedProduct(product, Date.parse(startsAt) - 1).price, 1000);
  assert.equal(pricedProduct(product, Date.parse(startsAt)).price, 800);
  assert.equal(pricedProduct(product, Date.parse(endsAt) - 1).price, 800);
  assert.equal(pricedProduct(product, Date.parse(endsAt)).price, 1000);
});
