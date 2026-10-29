import { db } from "./index.ts";
import { StoreError, getOrder } from "./store.ts";
export async function collectCOD(id: string) {
  await db.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM orders WHERE id=${id}::uuid FOR UPDATE`;
    if (!order || order.status !== "confirmed")
      throw new StoreError(
        409,
        "INVALID_ORDER",
        "Only confirmed cash-on-delivery orders can be marked collected.",
      );
    const [p] = await tx.$queryRaw<
      Array<{ provider: string; state: string }>
    >`SELECT provider,state FROM store_payments WHERE order_id=${id}::uuid FOR UPDATE`;
    if (!p || p.provider !== "cod" || !["due", "paid"].includes(p.state))
      throw new StoreError(
        409,
        "INVALID_PAYMENT",
        "This order is not payable by Cash on Delivery.",
      );
    await tx.$executeRaw`UPDATE store_payments SET state='paid',updated_at=now() WHERE order_id=${id}::uuid`;
    await tx.$executeRaw`UPDATE store_order_details SET payload=jsonb_set(payload,'{payment,state}','"paid"'::jsonb) WHERE order_id=${id}::uuid`;
  });
  return getOrder(id, null);
}
