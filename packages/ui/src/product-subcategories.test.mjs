import assert from "node:assert/strict";
import { test } from "node:test";
import { productSubcategory, SUBCATEGORIES } from "./product-subcategories.ts";
test("electronics groups distinguish devices, accessories, batteries and audio", () => {
  for (const [name, wanted] of [
    ["I ＰHONE", "Mobiles"],
    ["iPhone 16", "Mobiles"],
    ["Samsung", "Mobiles"],
    ["Phone Case", "Cases & sleeves"],
    ["Smartphone Camera Lens", "Cameras & accessories"],
    ["Portable Power Bank Charger", "Power banks"],
    ["Wireless Charging Pad", "Chargers & cables"],
    ["Pocket Bluetooth Speaker", "Bluetooth & audio"],
    ["Over-Ear Headphones", "Bluetooth & audio"],
    ["Wireless Desk Keyboard", "Keyboards & mice"],
    ["Laptop Cooling Stand", "Screens & stands"],
  ])
    assert.equal(productSubcategory({ name }, "Tech & audio"), wanted, name);
});
test("home, carry and wellness products receive meaningful browsing groups", () => {
  for (const [parent, name, wanted] of [
    ["Home & living", "Oak Reading Lamp", "Lighting"],
    ["Home & living", "Linen Table Runner", "Bedding & textiles"],
    ["Home & living", "Glass Tea Infuser", "Kitchen & dining"],
    ["Home & living", "Paper", "Stationery"],
    ["Home & living", "Tea", "Food & drinks"],
    ["Everyday carry", "City Commuter Backpack", "Backpacks"],
    ["Everyday carry", "Leather Card Wallet", "Wallets & pouches"],
    ["Everyday carry", "Waterproof Laptop Sleeve", "Laptop sleeves"],
    ["Everyday carry", "Packing Cube Collection", "Travel accessories"],
    ["Wellness", "Cork Yoga Mat", "Yoga & stretching"],
    ["Wellness", "Foam Recovery Roller", "Recovery & relaxation"],
    ["Wellness", "Sport Shaker Bottle", "Bottles & hydration"],
    ["Wellness", "Fitness Resistance Band", "Fitness equipment"],
  ])
    assert.equal(productSubcategory({ name }, parent), wanted, name);
  for (const parent of Object.keys(SUBCATEGORIES))
    assert.equal(
      productSubcategory({ name: "Unclassified custom item" }, parent),
      SUBCATEGORIES[parent].at(-1),
    );
});
