import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanProductDescription, prepareProduct } from "./product-details.ts";
import {
  productSubcategory,
  readSubcategory,
  setSubcategory,
} from "./product-subcategories.ts";
test("staff-selected subcategory survives saving with offers and is hidden from public descriptions", () => {
  const description = setSubcategory("A durable accessory.", "Cases & sleeves");
  const saved = prepareProduct({
    name: "Custom accessory",
    description,
    price: 1000,
    stock: 1,
    category: "Tech & audio",
    discountPercent: 10,
  } as Parameters<typeof prepareProduct>[0]);
  assert.equal(saved.price, 900);
  assert.equal(readSubcategory(saved.description), "Cases & sleeves");
  assert.equal(
    productSubcategory(
      { name: "Custom accessory", description: saved.description },
      "Tech & audio",
    ),
    "Cases & sleeves",
  );
  assert.equal(
    cleanProductDescription(saved.description),
    "A durable accessory.",
  );
  assert.equal(
    readSubcategory(setSubcategory(saved.description, "Power banks")),
    "Power banks",
  );
  assert.equal(readSubcategory(setSubcategory(saved.description, "")), null);
  assert.throws(() => setSubcategory("Text", "Unknown type"));
  assert.equal(readSubcategory("[Subcategory: Unknown type]"), null);
});
