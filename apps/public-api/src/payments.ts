import { createHash } from "node:crypto";
import { db } from "../../../packages/prisma/src/index.ts";
import type { Shipping } from "../../../packages/prisma/src/store.ts";
import {
  assertCancellable,
  changeStock,
  confirm,
  createPending,
  getOrder,
  lockedProducts,
  StoreError,
} from "../../../packages/prisma/src/store.ts";
import {
  demoFx,
  demoReady,
  exchangeRate,
  paypay,
  paypayReady,
  razorpay,
  razorpayReady,
  shopOrigin,
  validSignature,
} from "./payment-providers.ts";

type Provider = "cod" | "razorpay" | "paypay" | "demo_card" | "demo_qr";
type Payment = {
  order_id: string;
  provider: Provider;
  state: string;
  currency: "JPY" | "INR";
  amount_minor: bigint;
  fx_rate: string;
  fx_date: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider_url: string | null;
  provider_code_id: string | null;
  reserved: boolean;
};
export type PaymentInput = {
  items: Array<{ productId: string; quantity: number }>;
  recipient: Shipping;
  expectedTotal?: number;
  couponCode?: string;
  loyaltyPoints?: number;
  paymentMethod?: Provider;
  currency?: "JPY" | "INR";
  expectedPaymentAmountMinor?: number;
};
async function payment(id: string, customer: string | null): Promise<Payment> {
  const rows = await db.$queryRaw<
    Payment[]
  >`SELECT p.* FROM store_payments p JOIN orders o ON o.id=p.order_id WHERE p.order_id=${id}::uuid AND (${customer}::text IS NULL OR o.customer_id=${customer})`;
  if (!rows[0])
    throw new StoreError(404, "ORDER_NOT_FOUND", "Payment order not found.");
  return rows[0];
}
function publicPayment(p: Payment) {
  return {
    provider: p.provider,
    state: p.state,
    currency: p.currency,
    amountMinor: Number(p.amount_minor),
    fxRate: Number(p.fx_rate),
    fxDate: p.fx_date,
    paymentId: p.provider_payment_id ?? undefined,
  };
}
async function writeSnapshot(tx: any, p: Payment) {
  await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{payment}',${JSON.stringify(publicPayment(p))}::jsonb) WHERE order_id=${p.order_id}::uuid`;
}
export async function startPayment(
  customer: string,
  key: string,
  input: PaymentInput,
) {
  const provider = input.paymentMethod ?? "cod",
    currency = input.currency ?? "JPY";
  if (provider.startsWith("demo_") && !demoReady())
    throw new StoreError(
      409,
      "DEMO_DISABLED",
      "Demo payments are disabled on this server.",
    );
  if (provider === "razorpay" && (currency !== "INR" || !razorpayReady()))
    throw new StoreError(
      409,
      "GATEWAY_NOT_CONFIGURED",
      "Razorpay cards and UPI require INR and your locally configured Razorpay test keys.",
    );
  if (provider === "paypay" && (currency !== "JPY" || !paypayReady()))
    throw new StoreError(
      409,
      "GATEWAY_NOT_CONFIGURED",
      "PayPay QR requires JPY and your locally configured PayPay sandbox credentials.",
    );
  const fx =
    currency === "INR"
      ? provider.startsWith("demo_")
        ? demoFx()
        : await exchangeRate()
      : {
          rate: 1,
          date: new Date().toISOString().slice(0, 10),
          source: "JPY base price",
        };
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        ...input,
        items: [...input.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        ),
        paymentMethod: provider,
        currency,
      }),
    )
    .digest("hex");
  const id = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${customer + key},0))`;
      const prior = await tx.$queryRaw<
        Array<{ order_id: string; request_hash: string }>
      >`SELECT order_id,request_hash FROM store_checkout_keys WHERE customer_id=${customer} AND key=${key}::uuid`;
      if (prior[0]) {
        if (prior[0].request_hash !== fingerprint)
          throw new StoreError(
            409,
            "CHECKOUT_KEY_REUSED",
            "The cart or payment choice changed. Start a new checkout.",
          );
        return prior[0].order_id;
      }
      const pending = await createPending(
        tx,
        customer,
        input.items,
        input.recipient,
        input.couponCode,
        input.loyaltyPoints ?? 0,
      );
      if (
        input.expectedTotal !== undefined &&
        pending.receipt.total !== input.expectedTotal
      )
        throw new StoreError(
          409,
          "PRICE_CHANGED",
          "A price changed. Review your cart total again.",
        );
      const amount = Math.round(
        pending.receipt.total * fx.rate * (currency === "INR" ? 100 : 1),
      );
      if (
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        (provider !== "cod" && amount === 0) ||
        amount > 999999999
      )
        throw new StoreError(
          400,
          "INVALID_AMOUNT",
          "This amount is outside the supported payment range.",
        );
      if (
        input.expectedPaymentAmountMinor !== undefined &&
        amount !== input.expectedPaymentAmountMinor
      )
        throw new StoreError(
          409,
          "FX_CHANGED",
          "The conversion quote changed. Refresh and review the total again.",
        );
      if (provider === "cod") await confirm(tx, pending.id, customer);
      else
        for (const p of pending.catalog) {
          const item = input.items.find((i) => i.productId === p.id)!;
          await changeStock(
            tx,
            p,
            -item.quantity,
            "Payment reservation",
            customer,
            pending.id,
          );
        }
      await tx.$executeRaw`INSERT INTO store_payments(order_id,provider,state,currency,amount_minor,fx_rate,fx_date,reserved) VALUES(${pending.id}::uuid,${provider},${provider === "cod" ? "due" : "pending"},${currency},${amount},${fx.rate},${fx.date},${provider !== "cod"})`;
      const [p] = await tx.$queryRaw<
        Payment[]
      >`SELECT * FROM store_payments WHERE order_id=${pending.id}::uuid`;
      await writeSnapshot(tx, p);
      await tx.$executeRaw`INSERT INTO store_checkout_keys(customer_id,key,request_hash,order_id) VALUES(${customer},${key}::uuid,${fingerprint},${pending.id}::uuid)`;
      return pending.id;
    },
    { timeout: 15000 },
  );
  return resumePayment(id, customer);
}
export async function resumePayment(id: string, customer: string) {
  let p = await payment(id, customer);
  if (p.state !== "pending")
    return { ...(await getOrder(id, customer)), gateway: null };
  if (p.provider.startsWith("demo_"))
    return {
      ...(await getOrder(id, customer)),
      gateway: {
        provider: p.provider,
        providerOrderId: id,
        url: null,
        currency: p.currency,
        amountMinor: Number(p.amount_minor),
        mode: "demo",
      },
    };
  if (!p.provider_order_id) {
    if (p.provider === "razorpay") {
      const created = await razorpay("/orders", "POST", {
        amount: Number(p.amount_minor),
        currency: "INR",
        receipt: id,
        notes: { training2_order: id },
      });
      if (
        typeof created.id !== "string" ||
        created.amount !== Number(p.amount_minor) ||
        created.currency !== "INR"
      )
        throw new StoreError(
          409,
          "GATEWAY_ERROR",
          "The payment provider returned an unexpected order.",
        );
      await db.$executeRaw`UPDATE store_payments SET provider_order_id=${created.id},updated_at=now() WHERE order_id=${id}::uuid AND provider_order_id IS NULL`;
    } else if (p.provider === "paypay") {
      const created = await paypay("/v2/codes", "POST", {
        merchantPaymentId: id,
        amount: { amount: Number(p.amount_minor), currency: "JPY" },
        codeType: "ORDER_QR",
        requestedAt: Math.floor(Date.now() / 1000),
        orderDescription: `Solaistore order ${id.slice(0, 8)}`,
        redirectUrl: `${shopOrigin()}/?payment_order=${id}`,
        redirectType: "WEB_LINK",
        isAuthorization: false,
      });
      const url = new URL(created.url);
      if (!url.hostname.endsWith(".paypay.ne.jp") || url.protocol !== "https:")
        throw new StoreError(
          409,
          "GATEWAY_ERROR",
          "PayPay returned an unexpected checkout URL.",
        );
      await db.$executeRaw`UPDATE store_payments SET provider_order_id=${id},provider_url=${url.href},provider_code_id=${String(created.codeId)},updated_at=now() WHERE order_id=${id}::uuid AND provider_order_id IS NULL`;
    }
    p = await payment(id, customer);
  }
  return {
    ...(await getOrder(id, customer)),
    gateway: {
      provider: p.provider,
      keyId:
        p.provider === "razorpay" ? process.env.RAZORPAY_KEY_ID : undefined,
      providerOrderId: p.provider_order_id,
      url: p.provider_url,
      currency: p.currency,
      amountMinor: Number(p.amount_minor),
      mode: "test",
    },
  };
}
async function paid(p: Payment, paymentId: string) {
  const completed = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${p.order_id}::uuid FOR UPDATE`;
    const [current] = await tx.$queryRaw<
      Payment[]
    >`SELECT * FROM store_payments WHERE order_id=${p.order_id}::uuid FOR UPDATE`;
    if (current.state === "paid") return true;
    if (row.status === "cancelled" || !current.reserved) return false;
    const now = new Date().toISOString();
    await tx.$executeRaw`UPDATE orders SET status='confirmed',updated_at=now() WHERE id=${p.order_id}::uuid`;
    await tx.$executeRaw`UPDATE store_payments SET state='paid',provider_payment_id=${paymentId},reserved=false,updated_at=now() WHERE order_id=${p.order_id}::uuid`;
    current.state = "paid";
    current.provider_payment_id = paymentId;
    current.reserved = false;
    await writeSnapshot(tx, current);
    await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{confirmedAt}',${JSON.stringify(now)}::jsonb) WHERE order_id=${p.order_id}::uuid`;
    return true;
  });
  if (!completed) {
    await db.$executeRaw`UPDATE store_payments SET provider_payment_id=${paymentId} WHERE order_id=${p.order_id}::uuid`;
    await refundPayment(p.order_id, null);
  }
}
export async function verifyRazorpay(
  id: string,
  customer: string,
  callback: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
) {
  const p = await payment(id, customer);
  if (
    p.provider !== "razorpay" ||
    p.provider_order_id !== callback.razorpay_order_id ||
    !validSignature(
      `${p.provider_order_id}|${callback.razorpay_payment_id}`,
      callback.razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET ?? "",
    )
  )
    throw new StoreError(
      400,
      "INVALID_SIGNATURE",
      "Payment verification failed. No order was confirmed.",
    );
  await reconcileRazorpay(p, callback.razorpay_payment_id);
  return getOrder(id, customer);
}
async function reconcileRazorpay(p: Payment, id: string) {
  let result = await razorpay(`/payments/${encodeURIComponent(id)}`);
  p = await payment(p.order_id, null);
  if (
    result.order_id !== p.provider_order_id ||
    result.amount !== Number(p.amount_minor) ||
    result.currency !== p.currency
  )
    throw new StoreError(
      409,
      "PAYMENT_MISMATCH",
      "Payment amount or order did not match the saved quote.",
    );
  if (result.status === "authorized" && p.state === "pending")
    result = await razorpay(
      `/payments/${encodeURIComponent(id)}/capture`,
      "POST",
      { amount: Number(p.amount_minor), currency: p.currency },
    );
  if (
    result.status === "captured" &&
    ["cancelled", "refund_pending", "refunded"].includes(p.state)
  ) {
    await db.$executeRaw`UPDATE store_payments SET provider_payment_id=${id} WHERE order_id=${p.order_id}::uuid`;
    p.provider_payment_id = id;
    await refundPayment(p.order_id, null);
    return;
  }
  if (result.status === "captured" && result.captured === true)
    await paid(p, id);
  else if (result.status === "failed")
    throw new StoreError(
      409,
      "PAYMENT_FAILED",
      "The payment failed. You can retry this saved order.",
    );
}
export async function syncPayment(id: string, customer: string | null) {
  const p = await payment(id, customer);
  if (p.state === "refund_pending") return refundPayment(id, customer);
  if (!["pending", "cancelled"].includes(p.state))
    return getOrder(id, customer);
  if (p.provider === "razorpay" && p.provider_order_id) {
    const result = await razorpay(
      `/orders/${encodeURIComponent(p.provider_order_id)}/payments`,
    );
    for (const item of result.items ?? [])
      if (["authorized", "captured"].includes(item.status)) {
        await reconcileRazorpay(p, item.id);
        break;
      }
  }
  if (p.provider === "paypay" && p.provider_order_id) {
    let result: any;
    try {
      result = await paypay(`/v2/codes/payments/${id}`);
    } catch (error) {
      if (
        error instanceof StoreError &&
        error.code === "DYNAMIC_QR_PAYMENT_NOT_FOUND"
      ) {
        await release(p);
        return getOrder(id, customer);
      }
      throw error;
    }
    if (
      result.merchantPaymentId !== id ||
      result.amount?.amount !== Number(p.amount_minor) ||
      result.amount?.currency !== "JPY"
    )
      throw new StoreError(
        409,
        "PAYMENT_MISMATCH",
        "PayPay payment did not match this order.",
      );
    if (result.status === "COMPLETED") {
      if (typeof result.paymentId !== "string" || !result.paymentId)
        throw new StoreError(
          409,
          "GATEWAY_ERROR",
          "PayPay did not return a payment reference.",
        );
      await paid(p, result.paymentId);
    } else if (["EXPIRED", "FAILED", "CANCELED"].includes(result.status))
      await release(p);
  }
  return getOrder(id, customer);
}
async function release(p: Payment, reason = "Payment expired") {
  await db.$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${p.order_id}::uuid FOR UPDATE`;
    const [current] = await tx.$queryRaw<
      Payment[]
    >`SELECT * FROM store_payments WHERE order_id=${p.order_id}::uuid FOR UPDATE`;
    if (o.status !== "pending" || !current.reserved) return;
    const items = await tx.order_items.findMany({
      where: { order_id: p.order_id },
    });
    for (const product of await lockedProducts(
      tx,
      items.map((i) => i.product_id),
    ))
      await changeStock(
        tx,
        product,
        items.find((i) => i.product_id === product.id)!.quantity,
        reason,
        "payment-provider",
        p.order_id,
      );
    current.state = "cancelled";
    current.reserved = false;
    await tx.$executeRaw`UPDATE orders SET status='cancelled',updated_at=now() WHERE id=${p.order_id}::uuid`;
    await tx.$executeRaw`UPDATE store_payments SET state='cancelled',reserved=false,updated_at=now() WHERE order_id=${p.order_id}::uuid`;
    await writeSnapshot(tx, current);
  });
}
export async function razorpayWebhook(raw: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !validSignature(raw, signature, secret))
    throw new StoreError(
      400,
      "INVALID_SIGNATURE",
      "Webhook signature was invalid.",
    );
  const event = JSON.parse(raw);
  const entity = event.payload?.payment?.entity;
  if (
    ["payment.authorized", "payment.captured"].includes(event.event) &&
    typeof entity?.order_id === "string" &&
    typeof entity?.id === "string"
  ) {
    const [p] = await db.$queryRaw<
      Payment[]
    >`SELECT * FROM store_payments WHERE provider='razorpay' AND provider_order_id=${entity.order_id}`;
    if (p) await reconcileRazorpay(p, entity.id);
  }
  return { received: true };
}
export async function reconcilePendingPayments() {
  const rows = await db.$queryRaw<
    Array<{ order_id: string }>
  >`SELECT order_id FROM store_payments WHERE (state IN ('pending','refund_pending') OR (state='cancelled' AND created_at>now()-interval '2 days')) AND provider_order_id IS NOT NULL ORDER BY updated_at LIMIT 10`;
  for (const row of rows) {
    try {
      await syncPayment(row.order_id, null);
    } catch {
      console.error(`Payment reconciliation pending for order ${row.order_id}`);
    } finally {
      await db.$executeRaw`UPDATE store_payments SET updated_at=now() WHERE order_id=${row.order_id}::uuid`;
    }
  }
}

async function finishRefund(p: Payment, customerInitiated = false) {
  await db.$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${p.order_id}::uuid FOR UPDATE`;
    const [current] = await tx.$queryRaw<
      Payment[]
    >`SELECT * FROM store_payments WHERE order_id=${p.order_id}::uuid FOR UPDATE`;
    if (current.state === "refunded") return;
    if (customerInitiated) await assertCancellable(tx, p.order_id);
    const [returned] = await tx.$queryRaw<
      Array<{ inventory_processed: boolean }>
    >`SELECT inventory_processed FROM store_returns WHERE order_id=${p.order_id}::uuid`;
    if (
      (o.status === "confirmed" || current.reserved) &&
      !returned?.inventory_processed
    ) {
      const items = await tx.order_items.findMany({
        where: { order_id: p.order_id },
      });
      for (const product of await lockedProducts(
        tx,
        items.map((i) => i.product_id),
      ))
        await changeStock(
          tx,
          product,
          items.find((i) => i.product_id === product.id)!.quantity,
          "Payment refunded",
          "payment-provider",
          p.order_id,
        );
    }
    current.state = "refunded";
    current.reserved = false;
    await tx.$executeRaw`UPDATE orders SET status='cancelled',updated_at=now() WHERE id=${p.order_id}::uuid`;
    await tx.$executeRaw`UPDATE store_payments SET state='refunded',reserved=false,updated_at=now() WHERE order_id=${p.order_id}::uuid`;
    await writeSnapshot(tx, current);
    await tx.$executeRaw`UPDATE store_returns SET status='refunded',refund_amount_jpy=(SELECT (payload->>'total')::bigint FROM store_order_details WHERE order_id=${p.order_id}::uuid),refunded_at=now(),updated_at=now() WHERE order_id=${p.order_id}::uuid AND status IN ('received','refunding')`;
  });
}
export async function completeDemo(id: string, customer: string) {
  const p = await payment(id, customer);
  if (!demoReady() || !p.provider.startsWith("demo_"))
    throw new StoreError(
      409,
      "NOT_DEMO",
      "Only a demo order can be simulated.",
    );
  if (p.state === "paid") return getOrder(id, customer);
  if (p.state !== "pending")
    throw new StoreError(
      409,
      "DEMO_CLOSED",
      "This demo payment is no longer pending.",
    );
  await paid(p, `DEMO-NO-MONEY-${id}`);
  return getOrder(id, customer);
}
const refundLocks = new Map<string, Promise<unknown>>();
export async function refundPayment(
  id: string,
  customer: string | null,
): Promise<Awaited<ReturnType<typeof getOrder>>> {
  const p = await payment(id, customer);
  if (p.provider === "cod")
    throw new StoreError(
      409,
      "COD_ORDER",
      "Cancel this cash-on-delivery order using the normal cancellation action.",
    );
  if (p.state === "refunded") return getOrder(id, customer);
  if (p.provider.startsWith("demo_")) {
    if (p.state !== "paid")
      throw new StoreError(
        409,
        "PAYMENT_PENDING",
        "Complete or cancel this demo payment first.",
      );
    await finishRefund(p, customer !== null);
    return getOrder(id, customer);
  }
  if (!p.provider_payment_id)
    throw new StoreError(
      409,
      "PAYMENT_PENDING",
      "No completed payment is available to refund yet.",
    );
  if (refundLocks.has(id)) {
    await refundLocks.get(id);
    return getOrder(id, customer);
  }
  const task = (async () => {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id=${id}::uuid FOR UPDATE`;
      if (customer !== null) await assertCancellable(tx, id);
      await tx.$executeRaw`UPDATE store_payments SET state='refund_pending',updated_at=now() WHERE order_id=${id}::uuid AND state<>'refunded'`;
      p.state = "refund_pending";
      await writeSnapshot(tx, p);
    });
    if (p.provider === "razorpay") {
      const existing = await razorpay(
        `/payments/${encodeURIComponent(p.provider_payment_id!)}/refunds`,
      );
      const refunds = existing.items ?? [];
      const processed = refunds
        .filter((r: any) => r.status === "processed")
        .reduce((s: number, r: any) => s + r.amount, 0);
      if (processed >= Number(p.amount_minor)) {
        await finishRefund(p);
        return;
      }
      if (refunds.some((r: any) => r.status === "pending")) return;
      const result = await razorpay(
        `/payments/${encodeURIComponent(p.provider_payment_id!)}/refund`,
        "POST",
        {
          amount: Number(p.amount_minor) - processed,
          notes: { training2_order: id },
        },
      );
      if (result.status === "processed") await finishRefund(p);
    } else {
      const refundId = `refund-${id}`;
      let result: any;
      try {
        result = await paypay(
          "/v2/refunds/" +
            refundId +
            "?paymentId=" +
            encodeURIComponent(p.provider_payment_id!),
        );
      } catch (error) {
        if (
          !(error instanceof StoreError) ||
          !["NO_SUCH_REFUND_ORDER", "RESOURCE_NOT_FOUND"].includes(error.code)
        )
          throw error;
        result = await paypay("/v2/refunds", "POST", {
          merchantRefundId: refundId,
          paymentId: p.provider_payment_id,
          amount: { amount: Number(p.amount_minor), currency: "JPY" },
          requestedAt: Math.floor(Date.now() / 1000),
          reason: "Customer cancellation",
        });
      }
      if (result.status === "REFUNDED") await finishRefund(p);
    }
  })();
  refundLocks.set(id, task);
  try {
    await task;
  } finally {
    refundLocks.delete(id);
  }
  return getOrder(id, customer);
}
export async function cancelPayment(id: string, customer: string) {
  let p = await payment(id, customer);
  if (p.provider === "cod")
    throw new StoreError(
      409,
      "COD_ORDER",
      "Use normal cancellation for cash-on-delivery orders.",
    );
  await syncPayment(id, customer);
  p = await payment(id, customer);
  if (p.state === "paid" || p.state === "refund_pending")
    return refundPayment(id, customer);
  if (p.state === "pending") {
    if (p.provider === "paypay" && p.provider_code_id) {
      await paypay(
        `/v2/codes/${encodeURIComponent(p.provider_code_id)}`,
        "DELETE",
      );
    }
    await release(p, "Payment cancelled");
  }
  return getOrder(id, customer);
}
