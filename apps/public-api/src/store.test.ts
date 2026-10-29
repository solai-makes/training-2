import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { db } from "@training2/prisma";
import { app } from "./index.ts";
import { login } from "../../private-api/src/auth.ts";
const productIds: string[] = [],
  orderIds: string[] = [];
async function product(stock: number) {
  const [sequence] = await db.$queryRaw<
    Array<{ n: bigint }>
  >`SELECT nextval('product_code_seq') n`;
  const p = await db.products.create({
    data: {
      code: `A-${sequence.n.toString().padStart(2, "0")}`,
      product_number: sequence.n,
      name: "Receipt integration test",
      description: "Temporary integration test item",
      price: 1200,
      stock,
    },
  });
  productIds.push(p.id);
  return p;
}
const recipient = {
  name: "Test Customer",
  address: "Test Street",
  city: "Test City",
  postalCode: "100-0001",
};
const call = (path: string, token: string, body?: unknown, key?: string) =>
  app.request(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
after(async () => {
  await db.$executeRaw`DELETE FROM store_payments WHERE order_id=ANY(${orderIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM store_inventory_events WHERE order_id=ANY(${orderIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM store_checkout_keys WHERE order_id=ANY(${orderIds}::uuid[])`;
  await db.orders.deleteMany({ where: { id: { in: orderIds } } });
  await db.products.deleteMany({ where: { id: { in: productIds } } });
  await db.$disconnect();
});
test("checkout retries do not double-decrement; receipts preserve prices and cancellation restores only once", async () => {
  const token = await login("buyer@example.test", "Training2-local!"),
    p = await product(3),
    key = randomUUID();
  const payload = { items: [{ productId: p.id, quantity: 2 }], recipient };
  const first = await call("/checkout", token, payload, key);
  assert.equal(first.status, 201);
  const order = await first.json();
  orderIds.push(order.id);
  const retry = await call("/checkout", token, payload, key);
  assert.equal((await retry.json()).id, order.id);
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: p.id } })).stock,
    1,
  );
  await db.products.update({
    where: { id: p.id },
    data: { price: 9000, name: "Changed later" },
  });
  const receipt = await (
    await call(`/orders/${order.id}/receipt`, token)
  ).json();
  assert.equal(receipt.items[0].unitPrice, 1200);
  assert.equal(receipt.items[0].name, "Receipt integration test");
  assert.equal(receipt.total, 2640);
  const foreign = await db.orders.create({
    data: { customer_id: "another-customer", status: "confirmed" },
  });
  orderIds.push(foreign.id);
  assert.equal(
    (await call(`/orders/${foreign.id}/receipt`, token)).status,
    404,
  );
  assert.equal(
    (await call(`/orders/${order.id}/cancel`, token, {})).status,
    200,
  );
  assert.equal(
    (await call(`/orders/${order.id}/cancel`, token, {})).status,
    200,
  );
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: p.id } })).stock,
    3,
  );
  assert.equal((await call(`/orders/${order.id}/receipt`, token)).status, 409);
});
test("two checkouts competing for one unit have one winner and leave no partial loser", async () => {
  const token = await login("buyer@example.test", "Training2-local!"),
    p = await product(1),
    payload = { items: [{ productId: p.id, quantity: 1 }], recipient };
  const responses = await Promise.all([
    call("/checkout", token, payload, randomUUID()),
    call("/checkout", token, payload, randomUUID()),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  for (const response of responses)
    if (response.status === 201) orderIds.push((await response.json()).id);
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: p.id } })).stock,
    0,
  );
  assert.equal(await db.order_items.count({ where: { product_id: p.id } }), 1);
});
