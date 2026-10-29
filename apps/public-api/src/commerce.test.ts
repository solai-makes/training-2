import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "@training2/prisma";
import { app } from "./index.ts";
import { login } from "../../private-api/src/auth.ts";
import { collectCOD } from "../../../packages/prisma/src/cod.ts";
import { stockReport } from "../../../packages/prisma/src/stock-report.ts";
import { validSignature } from "./payment-providers.ts";
import { startPayment, completeDemo, refundPayment } from "./payments.ts";
const products: string[] = [];
after(async () => {
  const items = await db.order_items.findMany({
      where: { product_id: { in: products } },
      select: { order_id: true },
    }),
    orders = [...new Set(items.map((i) => i.order_id))];
  await db.$executeRaw`DELETE FROM store_inventory_events WHERE product_id=ANY(${products}::uuid[])`;
  await db.$executeRaw`DELETE FROM store_payments WHERE order_id=ANY(${orders}::uuid[])`;
  await db.$executeRaw`DELETE FROM store_checkout_keys WHERE order_id=ANY(${orders}::uuid[])`;
  await db.orders.deleteMany({ where: { id: { in: orders } } });
  await db.products.deleteMany({ where: { id: { in: products } } });
  await db.$disconnect();
});
test("COD remains due until staff record collection; collection does not change stock", async () => {
  const token = await login("buyer@example.test", "Training2-local!");
  const [seq] = await db.$queryRaw<
    Array<{ n: bigint }>
  >`SELECT nextval('product_code_seq') n`;
  const product = await db.products.create({
    data: {
      code: `A-${seq.n.toString().padStart(2, "0")}`,
      product_number: seq.n,
      name: "Commerce integration test",
      description: "Temporary test record",
      price: 1200,
      stock: 5,
    },
  });
  products.push(product.id);
  const response = await app.request("/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      items: [{ productId: product.id, quantity: 2 }],
      recipient: {
        name: "Test",
        address: "Test",
        city: "Test",
        postalCode: "1000001",
      },
      paymentMethod: "cod",
      currency: "JPY",
      expectedPaymentAmountMinor: 2640,
    }),
  });
  assert.equal(response.status, 201);
  const order = await response.json();
  assert.equal(order.receipt.payment.state, "due");
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: product.id } })).stock,
    3,
  );
  const collected = await collectCOD(order.id);
  assert.equal(collected.receipt?.payment?.state, "paid");
  assert.equal(
    (await db.products.findUniqueOrThrow({ where: { id: product.id } })).stock,
    3,
  );
  const report = await stockReport(product.id, 7);
  assert.equal(report.current, 3);
  assert.equal(report.outgoing, 2);
  assert.equal(report.incoming, 0);
  assert.equal(report.daily.length, 7);
  const cancelled = await app.request(`/orders/${order.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(cancelled.status, 409);
});
test("payment signatures reject altered and malformed values", () => {
  const secret = "unit-test-secret",
    body = "provider-order|provider-payment",
    signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(validSignature(body, signature, secret), true);
  assert.equal(validSignature(body + "changed", signature, secret), false);
  assert.equal(validSignature(body, "invalid", secret), false);
});

test("demo card and QR orders cannot double-decrement or double-restore inventory", async () => {
  const [seq] = await db.$queryRaw<
    Array<{ n: bigint }>
  >`SELECT nextval('product_code_seq') n`;
  const product = await db.products.create({
    data: {
      code: `A-${seq.n.toString().padStart(2, "0")}`,
      product_number: seq.n,
      name: "Solaistore demo integration fixture",
      description: "Temporary test record",
      price: 1000,
      stock: 10,
    },
  });
  products.push(product.id);
  for (const provider of ["demo_card", "demo_qr"] as const) {
    const key = randomUUID(),
      input = {
        items: [{ productId: product.id, quantity: 2 }],
        recipient: {
          name: "Demo",
          address: "Demo",
          city: "Demo",
          postalCode: "1000001",
        },
        paymentMethod: provider,
        currency: "JPY" as const,
      };
    const currentStock = (
      await db.products.findUniqueOrThrow({ where: { id: product.id } })
    ).stock;
    const order = await startPayment(
      "solaistore-integration-fixture",
      key,
      input,
    );
    assert.equal(order.gateway?.mode, "demo");
    assert.equal(
      (await startPayment("solaistore-integration-fixture", key, input)).id,
      order.id,
    );
    await assert.rejects(() => completeDemo(order.id, "another-customer"));
    const paid = await completeDemo(order.id, "solaistore-integration-fixture");
    assert.equal(paid.status, "confirmed");
    assert.equal(paid.receipt?.payment?.provider, provider);
    assert.match(paid.receipt!.payment!.paymentId!, /^DEMO-NO-MONEY-/);
    await completeDemo(order.id, "solaistore-integration-fixture");
    assert.equal(
      (await db.products.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
      currentStock - 2,
    );
    await refundPayment(order.id, "solaistore-integration-fixture");
    await refundPayment(order.id, "solaistore-integration-fixture");
    assert.equal(
      (await db.products.findUniqueOrThrow({ where: { id: product.id } }))
        .stock,
      currentStock,
    );
  }
});
