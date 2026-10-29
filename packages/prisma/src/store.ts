import { reserveLoyalty } from "./store-growth.ts";
import { createHash, randomUUID } from "node:crypto";
import { couponQuote } from "../../api-contracts/src/coupons.ts";
import { deliveryTimeline } from "../../api-contracts/src/delivery-timeline.ts";
import { pricedProduct } from "../../api-contracts/src/scheduled-price.ts";
import type { Prisma } from "../generated/index.js";
import { db } from "./index.ts";
import { enrichVariants } from "./shopping-tools.ts";

type Tx = Prisma.TransactionClient;
export type CatalogProduct = {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
};
export type ReceiptItem = {
  id: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
export type Shipping = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
};
export type TrackingStage =
  | "confirmed"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered";
export type Receipt = {
  storeName?: string;
  loyalty?: {pointsRedeemed:number;discount:number;earnEvery:number};
  version: 1;
  currency: "JPY";
  items: ReceiptItem[];
  subtotal: number;
  tracking?: {
    stage: TrackingStage;
    mode?: "automatic_demo";
    expectedDeliveryAt?: string;
    nextUpdateAt?: string | null;
    history: Array<{ stage: TrackingStage; at: string }>;
  };
  discount?: number;
  coupon?: { code: string; percent: number };
  tax: number;
  shipping: number;
  total: number;
  recipient: Shipping | null;
  confirmedAt: string | null;
  payment?: {
    provider: string;
    state: string;
    currency: string;
    amountMinor: number;
    fxRate: number;
    fxDate: string;
    paymentId?: string;
  };
};
export class StoreError extends Error {
  status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503;
  code: string;
  constructor(
    status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
    code: string,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function totals(items: ReceiptItem[], couponCode?: string) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  if (!Number.isSafeInteger(subtotal))
    throw new StoreError(400, "INVALID_TOTAL", "The order total is too large.");
  const quote = couponQuote(subtotal, couponCode);
  if (quote.error) throw new StoreError(400, "INVALID_COUPON", quote.error);
  const tax = Math.floor((subtotal - quote.discount) * 0.1);
  return {
    subtotal,
    tax,
    shipping: 0,
    total: subtotal - quote.discount + tax,
    ...(quote.code
      ? {
          discount: quote.discount,
          coupon: { code: quote.code, percent: quote.percent },
        }
      : {}),
  };
}
const columns = `id, code, name, description, price, stock, created_at AS "createdAt", updated_at AS "updatedAt"`;
// Only the fixed column list above is interpolated; all user values are bound parameters.
export async function products(page = 1, pageSize = 100, q = "") {
  const query = q.trim();
  const where = query ? `%${query.replace(/[\\%_]/g, "\\$&")}%` : "%";
  const [items, count] = await db.$transaction(
    [
      db.$queryRawUnsafe<CatalogProduct[]>(
        `SELECT ${columns} FROM products WHERE name ILIKE $1 OR code ILIKE $1 ORDER BY product_number, id LIMIT $2 OFFSET $3`,
        where,
        pageSize,
        (page - 1) * pageSize,
      ),
      db.$queryRaw<
        Array<{ total: bigint }>
      >`SELECT count(*) AS total FROM products WHERE name ILIKE ${where} OR code ILIKE ${where}`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    items: await enrichVariants(items.map((p) => pricedProduct(p))),
    total: Number(count[0].total),
    page,
    pageSize,
  };
}
type OrderRow = {
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
  items: ReceiptItem[];
  receipt: Receipt | null;
};
async function orderRows(
  tx: Tx,
  customer: string | null,
  id: string | null,
  page: number,
  pageSize: number,
) {
  const rows = await tx.$queryRaw<OrderRow[]>`
    SELECT o.id,o.status,o.customer_id AS "customerId",o.created_at AS "createdAt",o.updated_at AS "updatedAt",
      d.payload AS receipt, COALESCE(d.payload->'items', (
        SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',p.id,'code',p.code,'name',p.name,'quantity',i.quantity,'unitPrice',p.price,'lineTotal',p.price::bigint*i.quantity) ORDER BY p.code)
        FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id
      ), '[]'::jsonb) AS items
    FROM orders o LEFT JOIN store_order_details d ON d.order_id=o.id
    WHERE (${customer}::text IS NULL OR o.customer_id=${customer}) AND (${id}::uuid IS NULL OR o.id=${id}::uuid)
    ORDER BY o.created_at DESC,o.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  return rows.map((row) => ({
    ...row,
    receipt:
      row.receipt && row.status === "confirmed"
        ? {
            ...row.receipt,
            tracking:
              deliveryTimeline(row.receipt.confirmedAt, row.receipt.tracking) ??
              row.receipt.tracking,
          }
        : row.receipt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
export async function listOrders(
  customer: string | null,
  page = 1,
  pageSize = 20,
) {
  return db.$transaction(
    async (tx) => {
      const items = await orderRows(tx, customer, null, page, pageSize);
      const count = await tx.$queryRaw<
        Array<{ total: bigint }>
      >`SELECT count(*) AS total FROM orders WHERE (${customer}::text IS NULL OR customer_id=${customer})`;
      return { items, total: Number(count[0].total), page, pageSize };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getOrder(id: string, customer: string | null) {
  const result = await orderRows(db, customer, id, 1, 1);
  if (!result[0])
    throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
  return result[0];
}
export async function lockedProducts(tx: Tx, ids: string[]) {
  const result: CatalogProduct[] = [];
  for (const id of [...ids].sort()) {
    const rows = await tx.$queryRaw<
      CatalogProduct[]
    >`SELECT id,code,name,description,price,stock,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows[0])
      throw new StoreError(
        409,
        "PRODUCT_NOT_FOUND",
        "An item is no longer available. Refresh your cart.",
      );
    result.push(pricedProduct(rows[0]));
  }
  return result;
}
async function inventoryEvent(
  tx: Tx,
  product: CatalogProduct,
  delta: number,
  reason: string,
  actor: string,
  order: string | null,
) {
  await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id,order_id)
    VALUES(${product.id}::uuid,${product.code},${product.name},${delta},${product.stock + delta},${reason},${actor},${order}::uuid)`;
}
export async function changeStock(
  tx: Tx,
  product: CatalogProduct,
  delta: number,
  reason: string,
  actor: string,
  order: string | null,
) {
  if (product.stock + delta < 0)
    throw new StoreError(
      409,
      "INSUFFICIENT_STOCK",
      `${product.name}: only ${product.stock} available. Update your cart.`,
    );
  if (product.stock + delta > 2147483647)
    throw new StoreError(
      400,
      "INVALID_STOCK",
      "Stock exceeds the supported limit.",
    );
  await tx.$executeRaw`UPDATE products SET stock=stock+${delta},updated_at=now() WHERE id=${product.id}::uuid`;
  await inventoryEvent(tx, product, delta, reason, actor, order);
}
export async function createPending(
  tx: Tx,
  customer: string,
  items: Array<{ productId: string; quantity: number }>,
  recipient: Shipping | null,
  couponCode?: string,
  loyaltyPoints = 0,
) {
  const catalog = await lockedProducts(
    tx,
    items.map((item) => item.productId),
  );
  const receiptItems = items.map((item) => {
    const product = catalog.find((p) => p.id === item.productId);
    if (!product)
      throw new StoreError(
        404,
        "PRODUCT_NOT_FOUND",
        "A product is no longer available.",
      );
    return {
      id: randomUUID(),
      productId: product.id,
      code: product.code,
      name: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      lineTotal: product.price * item.quantity,
    };
  });
  const receipt: Receipt = {
    version: 1,
    currency: "JPY",
    items: receiptItems,
    ...totals(receiptItems, couponCode),
    recipient,
    confirmedAt: null,
  };
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`INSERT INTO orders(customer_id,status) VALUES(${customer},'pending') RETURNING id`;
  const id = rows[0].id;
  await reserveLoyalty(tx,customer,id,receipt,loyaltyPoints);
  for (const item of receiptItems)
    await tx.$executeRaw`INSERT INTO order_items(id,order_id,product_id,quantity) VALUES(${item.id}::uuid,${id}::uuid,${item.productId}::uuid,${item.quantity})`;
  await tx.$executeRaw`INSERT INTO store_order_details(order_id,payload) VALUES(${id}::uuid,${JSON.stringify(receipt)}::jsonb)`;
  return { id, catalog, receipt };
}
export async function createOrder(
  customer: string,
  items: Array<{ productId: string; quantity: number }>,
  recipient: Shipping | null = null,
) {
  const id = await db.$transaction(
    async (tx) => (await createPending(tx, customer, items, recipient)).id,
  );
  return getOrder(id, customer);
}
export async function confirm(tx: Tx, id: string, customer: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; status: string }>
  >`SELECT id,status FROM orders WHERE id=${id}::uuid AND customer_id=${customer} FOR UPDATE`;
  const order = rows[0];
  if (!order) throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (order.status === "confirmed") return;
  const gateway = await tx.$queryRaw<
    Array<{ provider: string }>
  >`SELECT provider FROM store_payments WHERE order_id=${id}::uuid`;
  if (gateway[0] && gateway[0].provider !== "cod")
    throw new StoreError(
      409,
      "PAYMENT_REQUIRED",
      "Complete the online payment before confirming this order.",
    );
  if (order.status !== "pending")
    throw new StoreError(
      409,
      "ORDER_NOT_PENDING",
      "This order cannot be confirmed.",
    );
  const items = await tx.order_items.findMany({ where: { order_id: id } });
  const catalog = await lockedProducts(
    tx,
    items.map((i) => i.product_id),
  );
  const saved = await tx.$queryRaw<
    Array<{ payload: Receipt }>
  >`SELECT payload FROM store_order_details WHERE order_id=${id}::uuid`;
  let receipt = saved[0]?.payload;
  if (!receipt) {
    const receiptItems = items.map((i) => {
      const p = catalog.find((p) => p.id === i.product_id);
      if (!p)
        throw new StoreError(
          404,
          "PRODUCT_NOT_FOUND",
          "A product is no longer available.",
        );
      return {
        id: i.id,
        productId: p.id,
        code: p.code,
        name: p.name,
        quantity: i.quantity,
        unitPrice: p.price,
        lineTotal: p.price * i.quantity,
      };
    });
    receipt = {
      version: 1,
      currency: "JPY",
      items: receiptItems,
      ...totals(receiptItems),
      recipient: null,
      confirmedAt: null,
    };
  }
  for (const product of catalog) {
    const item = items.find((i) => i.product_id === product.id);
    if (!item)
      throw new StoreError(
        409,
        "ORDER_CHANGED",
        "Order items changed. Please retry.",
      );
    await changeStock(
      tx,
      product,
      -item.quantity,
      "Order confirmed",
      customer,
      id,
    );
  }
  receipt.confirmedAt = new Date().toISOString();
  await tx.$executeRaw`INSERT INTO store_order_details(order_id,payload) VALUES(${id}::uuid,${JSON.stringify(receipt)}::jsonb) ON CONFLICT(order_id) DO UPDATE SET payload=EXCLUDED.payload`;
  await tx.$executeRaw`UPDATE orders SET status='confirmed',updated_at=now() WHERE id=${id}::uuid`;
}
export async function confirmOrder(id: string, customer: string) {
  await db.$transaction((tx) => confirm(tx, id, customer), { timeout: 15000 });
  return getOrder(id, customer);
}
export async function checkout(
  customer: string,
  key: string,
  items: Array<{ productId: string; quantity: number }>,
  recipient: Shipping,
  expectedTotal?: number,
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        items: [...items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        ),
        recipient,
        expectedTotal,
      }),
    )
    .digest("hex");
  const id = await db.$transaction(
    async (tx) => {
      // Serialize retries of this exact checkout before testing its key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${customer + key},0))`;
      const prior = await tx.$queryRaw<
        Array<{ order_id: string; request_hash: string }>
      >`SELECT order_id,request_hash FROM store_checkout_keys WHERE customer_id=${customer} AND key=${key}::uuid`;
      if (prior[0]) {
        if (prior[0].request_hash !== fingerprint)
          throw new StoreError(
            409,
            "CHECKOUT_KEY_REUSED",
            "Your cart changed. Start a new checkout.",
          );
        return prior[0].order_id;
      }
      const pending = await createPending(tx, customer, items, recipient);
      if (
        expectedTotal !== undefined &&
        pending.receipt.total !== expectedTotal
      )
        throw new StoreError(
          409,
          "PRICE_CHANGED",
          "A product price changed. Review the updated total before confirming again.",
        );
      await confirm(tx, pending.id, customer);
      await tx.$executeRaw`INSERT INTO store_checkout_keys(customer_id,key,request_hash,order_id) VALUES(${customer},${key}::uuid,${fingerprint},${pending.id}::uuid)`;
      return pending.id;
    },
    { timeout: 15000 },
  );
  return getOrder(id, customer);
}
export async function cancelOrder(id: string, customer: string) {
  await db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT status FROM orders WHERE id=${id}::uuid AND customer_id=${customer} FOR UPDATE`;
      if (!rows[0])
        throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
      if (rows[0].status === "cancelled") return;
      await assertCancellable(tx, id);
      const payments = await tx.$queryRaw<
        Array<{ provider: string; state: string }>
      >`SELECT provider,state FROM store_payments WHERE order_id=${id}::uuid`;
      if (payments[0] && payments[0].provider !== "cod")
        throw new StoreError(
          409,
          "PAYMENT_ORDER",
          "Use the payment cancellation/refund action for this order.",
        );
      if (payments[0]?.provider === "cod" && payments[0].state === "paid")
        throw new StoreError(
          409,
          "CASH_ALREADY_COLLECTED",
          "Cash was already collected. Contact staff to arrange a cash refund before returning stock.",
        );
      if (rows[0].status === "confirmed") {
        const items = await tx.order_items.findMany({
          where: { order_id: id },
        });
        for (const product of await lockedProducts(
          tx,
          items.map((i) => i.product_id),
        )) {
          const item = items.find((i) => i.product_id === product.id);
          if (!item)
            throw new StoreError(
              409,
              "ORDER_CHANGED",
              "Order items changed. Please retry.",
            );
          await changeStock(
            tx,
            product,
            item.quantity,
            "Order cancelled",
            customer,
            id,
          );
        }
      }
      await tx.$executeRaw`UPDATE orders SET status='cancelled',updated_at=now() WHERE id=${id}::uuid`;
      if (payments[0]) {
        await tx.$executeRaw`UPDATE store_payments SET state='cancelled',updated_at=now() WHERE order_id=${id}::uuid`;
        await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{payment,state}','"cancelled"'::jsonb) WHERE order_id=${id}::uuid`;
      }
    },
    { timeout: 15000 },
  );
  return getOrder(id, customer);
}
export async function adjustStock(
  id: string,
  delta: number,
  reason: string,
  actor: string,
) {
  await db.$transaction(async (tx) => {
    const [product] = await lockedProducts(tx, [id]);
    await changeStock(tx, product, delta, reason, actor, null);
  });
  const rows = await db.$queryRaw<
    CatalogProduct[]
  >`SELECT id,code,name,description,price,stock,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE id=${id}::uuid`;
  return rows[0];
}
export async function inventoryEvents() {
  return db.$queryRaw<
    Array<{
      id: string;
      productCode: string;
      productName: string;
      delta: number;
      stockAfter: number;
      reason: string;
      createdAt: Date;
    }>
  >`
    SELECT id,product_code AS "productCode",product_name AS "productName",delta,stock_after AS "stockAfter",reason,created_at AS "createdAt"
    FROM store_inventory_events ORDER BY created_at DESC,id LIMIT 60`;
}
export async function overview() {
  const [catalog, orders, daily] = await db.$transaction(
    [
      db.$queryRaw<
        Array<{ products: bigint; units: bigint; low: bigint; out: bigint }>
      >`SELECT count(*) AS products,COALESCE(sum(stock),0) AS units,count(*) FILTER(WHERE stock BETWEEN 1 AND 5) AS low,count(*) FILTER(WHERE stock=0) AS out FROM products`,
      db.$queryRaw<
        Array<{ confirmed: bigint; revenue: bigint }>
      >`SELECT count(*) AS confirmed,COALESCE(sum((d.payload->>'total')::bigint),0) AS revenue FROM orders o LEFT JOIN store_order_details d ON d.order_id=o.id WHERE o.status='confirmed'`,
      db.$queryRaw<
        Array<{ day: string; orders: bigint }>
      >`SELECT to_char(days.day,'Mon DD') AS day,count(o.id) AS orders FROM generate_series(current_date-6,current_date,'1 day') days(day) LEFT JOIN orders o ON o.created_at>=days.day AND o.created_at<days.day+interval '1 day' AND o.status='confirmed' GROUP BY days.day ORDER BY days.day`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    products: Number(catalog[0].products),
    units: Number(catalog[0].units),
    low: Number(catalog[0].low),
    out: Number(catalog[0].out),
    confirmed: Number(orders[0].confirmed),
    revenue: Number(orders[0].revenue),
    daily: daily.map((d) => ({ day: d.day, orders: Number(d.orders) })),
  };
}

export async function assertCancellable(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    Array<{ payload: Receipt }>
  >`SELECT payload FROM store_order_details WHERE order_id=${id}::uuid`;
  const receipt = rows[0]?.payload;
  const stage = receipt
    ? (deliveryTimeline(receipt.confirmedAt, receipt.tracking)?.stage ??
      receipt.tracking?.stage)
    : undefined;
  if (["shipped", "out_for_delivery", "delivered"].includes(stage ?? ""))
    throw new StoreError(
      409,
      "ALREADY_SHIPPED",
      "The delivery timeline has reached shipping. Contact staff to arrange a return.",
    );
}
export async function updateTracking(id: string, stage: TrackingStage) {
  const stages = [
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
  ];
  await db.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${id}::uuid FOR UPDATE`;
    if (!order)
      throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.status !== "confirmed")
      throw new StoreError(
        409,
        "ORDER_NOT_CONFIRMED",
        "Only confirmed orders can be prepared for delivery.",
      );
    const [row] = await tx.$queryRaw<
      Array<{ payload: Receipt }>
    >`SELECT payload FROM store_order_details WHERE order_id=${id}::uuid FOR UPDATE`;
    if (!row)
      throw new StoreError(
        409,
        "RECEIPT_MISSING",
        "This earlier order does not have saved delivery details.",
      );
    if (
      ["refund_pending", "refunded", "cancelled"].includes(
        row.payload.payment?.state ?? "",
      )
    )
      throw new StoreError(
        409,
        "PAYMENT_CLOSED",
        "This payment is being refunded or has closed.",
      );
    const prior: NonNullable<Receipt["tracking"]> = row.payload.tracking ?? {
      stage: "confirmed",
      history: [
        {
          stage: "confirmed",
          at: row.payload.confirmedAt ?? new Date().toISOString(),
        },
      ],
    };
    if (stage === prior.stage) return;
    if (stages.indexOf(stage) !== stages.indexOf(prior.stage) + 1)
      throw new StoreError(
        409,
        "INVALID_TRACKING_STEP",
        "Advance delivery by one step at a time.",
      );
    const tracking = {
      stage,
      history: [...prior.history, { stage, at: new Date().toISOString() }],
    };
    await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{tracking}',${JSON.stringify(tracking)}::jsonb) WHERE order_id=${id}::uuid`;
    await tx.$executeRaw`UPDATE orders SET updated_at=now() WHERE id=${id}::uuid`;
  });
  return getOrder(id, null);
}
