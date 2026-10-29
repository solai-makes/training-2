import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowed,
  staffPermission,
  DEFAULT_SETTINGS,
  loyaltyDiscount,
  SavedCart,
  StoreSettings,
} from "./store-growth.ts";
test("staff permissions restrict administration, refunds and customer data", () => {
  assert.equal(allowed("admin", "staff:write"), true);
  assert.equal(allowed("manager", "staff:write"), false);
  assert.equal(allowed("inventory", "orders:view"), false);
  assert.equal(allowed("support", "orders:write"), false);
  assert.equal(allowed("orders", "refunds:write"), false);
  assert.equal(allowed("disabled", "catalog:view"), false);
  assert.equal(
    staffPermission("/store/returns/123/refund", "POST"),
    "refunds:write",
  );
  assert.equal(
    staffPermission("/store/growth/settings", "PUT"),
    "settings:write",
  );
  assert.equal(staffPermission("/products", "POST"), "catalog:write");
});
test("loyalty redemption obeys balance and the cap after coupons with whole-yen rounding", () => {
  assert.equal(loyaltyDiscount(100, 500, 1000, DEFAULT_SETTINGS).discount, 100);
  assert.ok(loyaltyDiscount(101, 500, 1000, DEFAULT_SETTINGS).error);
  assert.ok(loyaltyDiscount(1, 0, 1000, DEFAULT_SETTINGS).error);
  assert.ok(loyaltyDiscount(-1, 500, 1000, DEFAULT_SETTINGS).error);
  assert.ok(loyaltyDiscount(1.5, 500, 1000, DEFAULT_SETTINGS).error);
  assert.equal(loyaltyDiscount(0, 100, 999, DEFAULT_SETTINGS).maxPoints, 99);
  assert.equal(loyaltyDiscount(0, 100, 900, DEFAULT_SETTINGS).maxPoints, 90);
  assert.ok(
    loyaltyDiscount(1, 100, 1000, {
      ...DEFAULT_SETTINGS,
      loyaltyEnabled: false,
    }).error,
  );
});
test("saved carts reject duplicate lines, excessive quantities and settings reject secret-like unknown fields", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(
    SavedCart.safeParse({
      items: [
        { productId: id, quantity: 1 },
        { productId: id, quantity: 1 },
      ],
    }).success,
    false,
  );
  assert.equal(
    SavedCart.safeParse({ items: [{ productId: id, quantity: 1001 }] }).success,
    false,
  );
  assert.equal(
    StoreSettings.safeParse({ secretKey: "not-a-setting" }).success,
    false,
  );
});
