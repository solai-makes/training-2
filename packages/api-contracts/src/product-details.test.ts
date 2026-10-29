import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanProductDescription,
  discountedPrice,
  prepareProduct,
  productDetails,
} from "./product-details.ts";

test("selected category overrides names and percentage discounts always use the regular price", () => {
  const input = {
    name: "Wireless travel camera",
    description: "Everyday essential.",
    price: 10000,
    category: "Wellness" as const,
    discountPercent: 25,
  };
  const saved = prepareProduct(input);
  assert.equal(saved.price, 7500);
  assert.deepEqual(productDetails({ ...input, ...saved }), {
    category: "Wellness",
    basePrice: 10000,
    discountPercent: 25,
  });
  assert.equal(cleanProductDescription(saved.description), input.description);
  const edited = prepareProduct({
    ...input,
    description: saved.description,
    discountPercent: 10,
  });
  assert.equal(edited.price, 9000);
  assert.equal(
    prepareProduct({
      ...input,
      description: edited.description,
      discountPercent: 10,
    }).price,
    9000,
  );
  assert.equal(
    prepareProduct({
      ...input,
      description: edited.description,
      discountPercent: 0,
    }).price,
    10000,
  );
});
test("legacy launch offers remain editable and inconsistent offer markers are ignored", () => {
  const p = {
    name: "Headphones",
    description:
      "[Tech & audio] Good sound. [Launch 50% off; reference JPY 2000]",
    price: 1000,
  };
  assert.deepEqual(productDetails(p), {
    category: "Tech & audio",
    basePrice: 2000,
    discountPercent: 50,
  });
  assert.equal(prepareProduct({ ...p, category: "Wellness" }).price, 1000);
  assert.equal(productDetails({ ...p, price: 1100 }).discountPercent, 0);
  assert.deepEqual(
    prepareProduct({ name: "Legacy", description: "Original", price: 1000 }),
    { description: "Original", price: 1000 },
  );
});
test("yen rounding, zero discount and free products have deterministic prices", () => {
  assert.equal(discountedPrice(1001, 15), 851);
  assert.equal(discountedPrice(1000, 0), 1000);
  assert.equal(discountedPrice(1000, 100), 0);
  for (const discountPercent of [-1, 101, 2.5])
    assert.throws(() =>
      prepareProduct({
        name: "Test",
        description: "",
        price: 1000,
        discountPercent,
      }),
    );
});
