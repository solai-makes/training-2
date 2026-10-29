import { withProductImages } from "./product-images.ts";
import { normalizeTrackingReference } from "../../api-contracts/src/tracking-reference.ts";
import { getOrder } from "./store.ts";
import { randomUUID } from "node:crypto";
import { deliveryTimeline } from "../../api-contracts/src/delivery-timeline.ts";
import { productDetails } from "../../api-contracts/src/product-details.ts";
import {
  pricedProduct,
  saleWindow,
} from "../../api-contracts/src/scheduled-price.ts";
import { db } from "./index.ts";
import type { CatalogProduct, Receipt, Shipping } from "./store.ts";
import { changeStock, lockedProducts, StoreError } from "./store.ts";

export type SavedAddress = {
  id: string;
  label: string;
  recipient: Shipping;
  isDefault: boolean;
};
export async function addresses(customer: string) {
  return db.$queryRaw<
    SavedAddress[]
  >`SELECT id,label,recipient,is_default AS "isDefault" FROM store_customer_addresses WHERE customer_id=${customer} AND deleted_at IS NULL ORDER BY is_default DESC,created_at,id`;
}
export async function saveAddress(
  customer: string,
  input: Omit<SavedAddress, "id">,
  id?: string,
) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`addresses:${customer}`},0))`;
    const existing = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM store_customer_addresses WHERE customer_id=${customer} AND deleted_at IS NULL FOR UPDATE`;
    if (id && !existing.some((row) => row.id === id))
      throw new StoreError(404, "ADDRESS_NOT_FOUND", "Address not found.");
    if (!id && existing.length >= 10)
      throw new StoreError(
        409,
        "ADDRESS_LIMIT",
        "You can save up to 10 addresses.",
      );
    const isDefault = input.isDefault || existing.length === 0;
    if (isDefault)
      await tx.$executeRaw`UPDATE store_customer_addresses SET is_default=false WHERE customer_id=${customer} AND deleted_at IS NULL`;
    const key = id ?? randomUUID();
    if (id)
      await tx.$executeRaw`UPDATE store_customer_addresses SET label=${input.label},recipient=${JSON.stringify(input.recipient)}::jsonb,is_default=${isDefault},updated_at=now() WHERE id=${key}::uuid AND customer_id=${customer}`;
    else
      await tx.$executeRaw`INSERT INTO store_customer_addresses(id,customer_id,label,recipient,is_default) VALUES(${key}::uuid,${customer},${input.label},${JSON.stringify(input.recipient)}::jsonb,${isDefault})`;
    return key;
  });
  return (await addresses(customer)).find((row) => row.id === result);
}
export async function removeAddress(customer: string, id: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`addresses:${customer}`},0))`;
    const rows = await tx.$queryRaw<
      Array<{ id: string; is_default: boolean }>
    >`SELECT id,is_default FROM store_customer_addresses WHERE id=${id}::uuid AND customer_id=${customer} AND deleted_at IS NULL FOR UPDATE`;
    if (!rows[0])
      throw new StoreError(404, "ADDRESS_NOT_FOUND", "Address not found.");
    await tx.$executeRaw`UPDATE store_customer_addresses SET deleted_at=now(),is_default=false,updated_at=now() WHERE id=${id}::uuid`;
    if (rows[0].is_default)
      await tx.$executeRaw`UPDATE store_customer_addresses SET is_default=true WHERE id=(SELECT id FROM store_customer_addresses WHERE customer_id=${customer} AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1)`;
  });
}

export type Variant = CatalogProduct & {
  label: string;
  color: string;
  size: string;
};
export async function enrichVariants<T extends { id: string }>(items: T[]) {
  if (!items.length) return items;
  const ids = items.map((p) => p.id);
  const rows = await db.$queryRaw<
    Array<Variant & { parentId: string }>
  >`SELECT p.id,p.code,p.name,p.description,p.price,p.stock,p.created_at AS "createdAt",p.updated_at AS "updatedAt",v.parent_id AS "parentId",v.label,v.color,v.size FROM store_product_variants v JOIN products p ON p.id=v.variant_id WHERE v.parent_id=ANY(${ids}::uuid[]) OR v.variant_id=ANY(${ids}::uuid[]) ORDER BY p.product_number`;
  return withProductImages(items.map((item) => ({
    ...item,
    variantParentId: rows.find((row) => row.id === item.id)?.parentId,
    variants: rows
      .filter((row) => row.parentId === item.id)
      .map((row) => pricedProduct(row)),
  })));
}
export async function createVariant(
  parent: string,
  input: {
    label: string;
    color: string;
    size: string;
    price: number;
    stock: number;
  },
  actor: string,
) {
  const id = await db.$transaction(async (tx) => {
    const [product] = await lockedProducts(tx, [parent]);
    const nested = await tx.$queryRaw<
      Array<{ variant_id: string }>
    >`SELECT variant_id FROM store_product_variants WHERE variant_id=${parent}::uuid`;
    if (nested.length)
      throw new StoreError(
        409,
        "VARIANT_PARENT",
        "Choose a standard product, not another variant.",
      );
    const duplicate = await tx.$queryRaw<
      Array<{ variant_id: string }>
    >`SELECT variant_id FROM store_product_variants WHERE parent_id=${parent}::uuid AND lower(btrim(label))=lower(btrim(${input.label}))`;
    if (duplicate.length)
      throw new StoreError(
        409,
        "VARIANT_EXISTS",
        "This option label already exists for this product.",
      );
    const [seq] = await tx.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT nextval('product_code_seq') AS n`;
    const key = randomUUID(),
      code = `A-${String(seq.n).padStart(2, "0")}`;
    const name = `${product.name.slice(0, 157 - input.label.length)} · ${input.label}`;
    const description = `[${productDetails(product).category}] ${input.color ? `Color: ${input.color}. ` : ""}${input.size ? `Size: ${input.size}. ` : ""}Option: ${input.label}.`;
    await tx.$executeRaw`INSERT INTO products(id,code,product_number,name,description,price,stock) VALUES(${key}::uuid,${code},${seq.n},${name},${description},${input.price},${input.stock})`;
    await tx.$executeRaw`INSERT INTO store_product_variants(variant_id,parent_id,label,color,size) VALUES(${key}::uuid,${parent}::uuid,${input.label},${input.color},${input.size})`;
    if (input.stock > 0)
      await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) VALUES(${key}::uuid,${code},${name},${input.stock},${input.stock},'Initial variant stock',${actor})`;
    return key;
  });
  return { id };
}

export async function priceHistory(id: string, days = 30) {
  const [product] = await db.$queryRaw<
    CatalogProduct[]
  >`SELECT id,code,name,description,price,stock,created_at AS "createdAt",updated_at AS "updatedAt" FROM products WHERE id=${id}::uuid`;
  if (!product)
    throw new StoreError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const rows = await db.$queryRaw<
    Array<{
      id: bigint;
      recordedAt: Date;
      price: number;
      description: string;
      reason: string;
    }>
  >`SELECT id,recorded_at AS "recordedAt",price,description,reason FROM store_product_price_history WHERE product_id=${id}::uuid ORDER BY recorded_at,id`;
  const now = Date.now(),
    cutoff = now - days * 86400000;
  const points: Array<{
    at: string;
    regular: number;
    selling: number;
    reason: string;
  }> = [];
  const add = (time: number, row: (typeof rows)[number], reason: string) => {
    if (time > now || time < cutoff) return;
    const state = {
        ...product,
        price: row.price,
        description: row.description,
      },
      details = productDetails(state);
    points.push({
      at: new Date(time).toISOString(),
      regular: details.basePrice,
      selling: pricedProduct(state, time).price,
      reason,
    });
  };
  rows.forEach((row, index) => {
    const start = row.recordedAt.getTime(),
      end = rows[index + 1]?.recordedAt.getTime() ?? now;
    if (end < cutoff) return;
    add(
      Math.max(start, cutoff),
      row,
      start < cutoff ? "Price at period start" : row.reason,
    );
    const window = saleWindow(row);
    if (window)
      for (const [at, reason] of [
        [window.startsAt, "Scheduled offer started"],
        [window.endsAt, "Scheduled offer ended"],
      ]) {
        const time = Date.parse(at);
        if (time >= start && time < end) add(time, row, reason);
      }
  });
  if (rows.length) add(now, rows[rows.length - 1], "Current price");
  points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    product: pricedProduct(product),
    days,
    trackingStartedAt: rows[0]?.recordedAt.toISOString() ?? null,
    generatedAt: new Date(now).toISOString(),
    points,
  };
}

type ReturnRow = {
  id: string;
  orderId: string;
  customerId: string;
  reason: string;
  details: string;
  status: string;
  staffNote: string;
  inventoryProcessed: boolean;
  stockRestocked: boolean;
  refundAmountJPY: number;
  createdAt: Date;
  updatedAt: Date;
  receipt: Receipt;
  paymentState: string | null;
  provider: string | null;
};
export async function returnsList(customer: string | null) {
  const rows = await db.$queryRaw<
    ReturnRow[]
  >`SELECT r.id,r.order_id AS "orderId",r.customer_id AS "customerId",r.reason,r.details,r.status,r.staff_note AS "staffNote",r.inventory_processed AS "inventoryProcessed",r.stock_restocked AS "stockRestocked",r.refund_amount_jpy::float8 AS "refundAmountJPY",r.created_at AS "createdAt",r.updated_at AS "updatedAt",d.payload AS receipt,p.state AS "paymentState",p.provider FROM store_returns r JOIN store_order_details d ON d.order_id=r.order_id LEFT JOIN store_payments p ON p.order_id=r.order_id WHERE (${customer}::text IS NULL OR r.customer_id=${customer}) ORDER BY r.created_at DESC,r.id LIMIT 200`;
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
export async function requestReturn(
  customer: string,
  input: { orderId: string; reason: string; details: string },
) {
  await db.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${input.orderId}::uuid AND customer_id=${customer} FOR UPDATE`;
    if (!order)
      throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
    if (order.status !== "confirmed")
      throw new StoreError(
        409,
        "RETURN_NOT_AVAILABLE",
        "Only confirmed, delivered orders can be returned.",
      );
    const [saved] = await tx.$queryRaw<
      Array<{ payload: Receipt }>
    >`SELECT payload FROM store_order_details WHERE order_id=${input.orderId}::uuid`;
    const receipt = saved?.payload,
      tracking = receipt
        ? deliveryTimeline(receipt.confirmedAt, receipt.tracking)
        : undefined;
    if (tracking?.stage !== "delivered")
      throw new StoreError(
        409,
        "NOT_DELIVERED",
        "Returns become available after delivery.",
      );
    if (Date.now() - Date.parse(tracking.expectedDeliveryAt) > 30 * 86400000)
      throw new StoreError(
        409,
        "RETURN_WINDOW_CLOSED",
        "The 30-day return window has ended.",
      );
    const existing = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM store_returns WHERE order_id=${input.orderId}::uuid`;
    if (existing.length) return;
    await tx.$executeRaw`INSERT INTO store_returns(order_id,customer_id,reason,details) VALUES(${input.orderId}::uuid,${customer},${input.reason},${input.details})`;
  });
  return (await returnsList(customer)).find(
    (row) => row.orderId === input.orderId,
  );
}
export async function reviewReturn(
  id: string,
  action: "approve" | "reject" | "receive",
  note: string,
  restock: boolean,
  actor: string,
) {
  await db.$transaction(
    async (tx) => {
      const [lookup] = await tx.$queryRaw<
        Array<{ order_id: string }>
      >`SELECT order_id FROM store_returns WHERE id=${id}::uuid`;
      if (!lookup)
        throw new StoreError(
          404,
          "RETURN_NOT_FOUND",
          "Return request not found.",
        );
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${lookup.order_id}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<
        Array<{ status: string; inventory_processed: boolean }>
      >`SELECT status,inventory_processed FROM store_returns WHERE id=${id}::uuid FOR UPDATE`;
      if (action === "approve" || action === "reject") {
        const status = action === "approve" ? "approved" : "rejected";
        if (row.status === status) return;
        if (row.status !== "requested")
          throw new StoreError(
            409,
            "RETURN_CHANGED",
            "This return has already been reviewed.",
          );
        await tx.$executeRaw`UPDATE store_returns SET status=${status},staff_note=${note},updated_at=now() WHERE id=${id}::uuid`;
        return;
      }
      if (row.inventory_processed) return;
      if (row.status !== "approved")
        throw new StoreError(
          409,
          "RETURN_NOT_APPROVED",
          "Approve the return before receiving it.",
        );
      const [saved] = await tx.$queryRaw<
        Array<{ payload: Receipt }>
      >`SELECT payload FROM store_order_details WHERE order_id=${lookup.order_id}::uuid`;
      if (restock) {
        const catalog = await lockedProducts(
          tx,
          saved.payload.items.map((item) => item.productId),
        );
        for (const product of catalog) {
          const item = saved.payload.items.find(
            (item) => item.productId === product.id,
          );
          if (!item)
            throw new StoreError(409, "ORDER_CHANGED", "Order items changed.");
          await changeStock(
            tx,
            product,
            item.quantity,
            "Return received and restocked",
            actor,
            lookup.order_id,
          );
        }
      }
      const [payment] = await tx.$queryRaw<
        Array<{ provider: string; state: string }>
      >`SELECT provider,state FROM store_payments WHERE order_id=${lookup.order_id}::uuid FOR UPDATE`;
      const unpaid = payment?.provider === "cod" && payment.state === "due";
      await tx.$executeRaw`UPDATE store_returns SET status=${unpaid ? "completed" : "received"},inventory_processed=true,stock_restocked=${restock},staff_note=${note},received_at=now(),updated_at=now() WHERE id=${id}::uuid`;
      if (unpaid) {
        await tx.$executeRaw`UPDATE orders SET status='cancelled',updated_at=now() WHERE id=${lookup.order_id}::uuid`;
        await tx.$executeRaw`UPDATE store_payments SET state='cancelled',updated_at=now() WHERE order_id=${lookup.order_id}::uuid`;
        await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{payment,state}','"cancelled"'::jsonb) WHERE order_id=${lookup.order_id}::uuid`;
      }
    },
    { timeout: 15000 },
  );
  return (await returnsList(null)).find((row) => row.id === id);
}
export async function prepareReturnRefund(id: string, cashConfirmed: boolean) {
  return db.$transaction(async (tx) => {
    const [lookup] = await tx.$queryRaw<
      Array<{ order_id: string }>
    >`SELECT order_id FROM store_returns WHERE id=${id}::uuid`;
    if (!lookup)
      throw new StoreError(
        404,
        "RETURN_NOT_FOUND",
        "Return request not found.",
      );
    await tx.$queryRaw`SELECT id FROM orders WHERE id=${lookup.order_id}::uuid FOR UPDATE`;
    const [row] = await tx.$queryRaw<
      Array<{ status: string; inventory_processed: boolean }>
    >`SELECT status,inventory_processed FROM store_returns WHERE id=${id}::uuid FOR UPDATE`;
    const [saved] = await tx.$queryRaw<
      Array<{ payload: Receipt }>
    >`SELECT payload FROM store_order_details WHERE order_id=${lookup.order_id}::uuid`;
    const [payment] = await tx.$queryRaw<
      Array<{ provider: string; state: string }>
    >`SELECT provider,state FROM store_payments WHERE order_id=${lookup.order_id}::uuid FOR UPDATE`;
    if (row.status === "refunded" || row.status === "completed")
      return { orderId: lookup.order_id, done: true };
    if (
      !row.inventory_processed ||
      !["received", "refunding"].includes(row.status)
    )
      throw new StoreError(
        409,
        "RETURN_NOT_RECEIVED",
        "Record receipt of returned goods before refunding.",
      );
    if (!payment)
      throw new StoreError(
        409,
        "PAYMENT_MISSING",
        "This earlier order has no saved payment. Arrange a refund outside this checkout.",
      );
    if (payment.provider === "cod") {
      if (!cashConfirmed)
        throw new StoreError(
          400,
          "CASH_CONFIRMATION_REQUIRED",
          "Confirm that you have already returned the cash to the customer.",
        );
      if (payment.state !== "paid")
        throw new StoreError(
          409,
          "CASH_NOT_COLLECTED",
          "No collected cash is available to refund.",
        );
      await tx.$executeRaw`UPDATE store_payments SET state='refunded',updated_at=now() WHERE order_id=${lookup.order_id}::uuid`;
      await tx.$executeRaw`UPDATE orders SET status='cancelled',updated_at=now() WHERE id=${lookup.order_id}::uuid`;
      await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{payment,state}','"refunded"'::jsonb) WHERE order_id=${lookup.order_id}::uuid`;
      await tx.$executeRaw`UPDATE store_returns SET status='refunded',refund_amount_jpy=${saved.payload.total},refunded_at=now(),updated_at=now() WHERE id=${id}::uuid`;
      return { orderId: lookup.order_id, done: true };
    }
    if (!["paid", "refund_pending", "refunded"].includes(payment.state))
      throw new StoreError(
        409,
        "PAYMENT_NOT_PAID",
        "Only a paid order can be refunded.",
      );
    if (payment.state === "refunded") {
      await tx.$executeRaw`UPDATE store_returns SET status='refunded',refund_amount_jpy=${saved.payload.total},refunded_at=now(),updated_at=now() WHERE id=${id}::uuid`;
      return { orderId: lookup.order_id, done: true };
    }
    await tx.$executeRaw`UPDATE store_returns SET status='refunding',updated_at=now() WHERE id=${id}::uuid`;
    return { orderId: lookup.order_id, done: false };
  });
}

export async function returnableOrders(customer: string) {
  const rows = await db.$queryRaw<
    Array<{ id: string; receipt: Receipt }>
  >`SELECT o.id,d.payload AS receipt FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.customer_id=${customer} AND o.status='confirmed' AND (d.payload->>'confirmedAt')::timestamptz>=now()-interval '31 days' ORDER BY o.created_at DESC LIMIT 200`;
  return rows.filter((row) => {
    const tracking = deliveryTimeline(
      row.receipt.confirmedAt,
      row.receipt.tracking,
    );
    return (
      tracking?.stage === "delivered" &&
      Date.now() - Date.parse(tracking.expectedDeliveryAt) <= 30 * 86400000
    );
  });
}

export async function findOrderByTrackingReference(reference: string, customer: string) {
  const normalized = normalizeTrackingReference(reference);
  if (!normalized) throw new StoreError(400, "INVALID_TRACKING_REFERENCE", "Enter a tracking reference in the format SS- followed by 12 letters or numbers.");
  const prefix = normalized.slice(3).toLowerCase();
  const matches = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM orders WHERE customer_id=${customer} AND left(replace(id::text,'-',''),12)=${prefix} LIMIT 2`;
  if (!matches.length) throw new StoreError(404, "TRACKING_NOT_FOUND", "No order with this reference was found in your account. Check the reference and sign in with the account used for the order.");
  if (matches.length > 1) throw new StoreError(409, "AMBIGUOUS_TRACKING_REFERENCE", "More than one order matches. Open the order from Your orders to track it.");
  return getOrder(matches[0].id, customer);
}
