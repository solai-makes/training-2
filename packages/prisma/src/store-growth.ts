import type { Prisma } from "../generated/index.js";
import { db } from "./index.ts";
import { StoreError, type Receipt } from "./store.ts";
import {
  allowed,
  StoreSettings,
  loyaltyDiscount,
  type Role,
  type Settings,
} from "../../api-contracts/src/store-growth.ts";
type Tx = Prisma.TransactionClient;
export async function settings(tx: Pick<Tx, "$queryRaw"> = db) {
  const rows = await tx.$queryRaw<
    Array<{ payload: unknown; version: number }>
  >`SELECT payload,version FROM store_settings WHERE id=true`;
  return {
    settings: StoreSettings.parse(rows[0]?.payload ?? {}),
    version: rows[0]?.version ?? 0,
  };
}
export async function audit(
  actor: string,
  action: string,
  details: Record<string, unknown>,
  tx: Pick<Tx, "$executeRaw"> = db,
) {
  await tx.$executeRaw`INSERT INTO store_admin_activity(actor,action,details) VALUES(${actor},${action},${JSON.stringify(details)}::jsonb)`;
}
export async function roleFor(identity: {
  sub: string;
  admin: boolean;
  username?: string;
}): Promise<Role | null> {
  if (identity.admin) return "admin";
  const principal = (identity.username ?? identity.sub).trim().toLowerCase();
  const rows = await db.$queryRaw<
    Array<{ role: Role }>
  >`SELECT role FROM store_staff_roles WHERE principal=${principal}`;
  return rows[0]?.role ?? null;
}
export function demand(role: Role | null, permission: string) {
  if (!allowed(role, permission))
    throw new StoreError(
      403,
      "FORBIDDEN",
      "Your staff role does not allow this action.",
    );
}
export async function staffList() {
  return db.$queryRaw`SELECT principal,role,updated_at AS "updatedAt" FROM store_staff_roles ORDER BY principal`;
}
export async function setStaffRole(
  actor: string,
  principal: string,
  role: Role,
) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO store_staff_roles(principal,role,updated_by) VALUES(${principal},${role},${actor}) ON CONFLICT(principal) DO UPDATE SET role=excluded.role,updated_by=excluded.updated_by,updated_at=now()`;
    await audit(actor, "staff_role_changed", { principal, role }, tx);
  });
}
export async function updateSettings(
  actor: string,
  input: Settings,
  version: number,
) {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ version: number }>
    >`UPDATE store_settings SET payload=${JSON.stringify(input)}::jsonb,version=version+1,updated_at=now() WHERE id=true AND version=${version} RETURNING version`;
    if (!rows.length)
      throw new StoreError(
        409,
        "SETTINGS_CHANGED",
        "Settings changed. Reload them before saving again.",
      );
    await audit(
      actor,
      "store_settings_updated",
      { version: rows[0].version },
      tx,
    );
  });
  return settings();
}
export function verifiedAccount(customer: string) {
  if (customer.startsWith("guest-"))
    throw new StoreError(
      403,
      "ACCOUNT_REQUIRED",
      "Use a verified account for saved carts and loyalty points.",
    );
}
export async function savedCart(customer: string) {
  verifiedAccount(customer);
  const rows = await db.$queryRaw<
    Array<{
      items: Array<{ productId: string; quantity: number }>;
      version: number;
      updatedAt: Date;
    }>
  >`SELECT items,version,updated_at AS "updatedAt" FROM store_saved_carts WHERE customer_id=${customer}`;
  return rows[0] ?? { items: [], version: 0, updatedAt: null };
}
export async function saveCart(
  customer: string,
  items: Array<{ productId: string; quantity: number }>,
  version: number,
) {
  verifiedAccount(customer);
  await db.$transaction(async (tx) => {
    if (items.length) {
      const ids = items.map((i) => i.productId);
      const found = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM products WHERE id=ANY(${ids}::uuid[])`;
      if (found.length !== ids.length)
        throw new StoreError(
          409,
          "CART_CHANGED",
          "Some products are no longer available. Review your cart.",
        );
    }
    const rows = await tx.$queryRaw<
      Array<{ version: number }>
    >`INSERT INTO store_saved_carts(customer_id,items) SELECT ${customer},${JSON.stringify(items)}::jsonb WHERE ${version}=0 ON CONFLICT(customer_id) DO NOTHING RETURNING version`;
    if (!rows.length) {
      const changed =
        await tx.$executeRaw`UPDATE store_saved_carts SET items=${JSON.stringify(items)}::jsonb,version=version+1,updated_at=now() WHERE customer_id=${customer} AND version=${version}`;
      if (!changed)
        throw new StoreError(
          409,
          "CART_CHANGED",
          "Your saved cart changed in another session. Reload it before replacing it.",
        );
    }
  });
  return savedCart(customer);
}
export async function recoverySummary() {
  const rows = await db.$queryRaw<
    Array<{
      customer: string;
      updatedAt: Date;
      quantity: bigint;
      value: bigint;
      abandoned: boolean;
    }>
  >`SELECT left(md5(c.customer_id),10) AS customer,c.updated_at AS "updatedAt",COALESCE(sum((item->>'quantity')::int),0) AS quantity,COALESCE(sum(p.price::bigint*(item->>'quantity')::int),0) AS value,c.updated_at < now()-interval '30 minutes' AS abandoned FROM store_saved_carts c CROSS JOIN LATERAL jsonb_array_elements(c.items) item LEFT JOIN products p ON p.id=(item->>'productId')::uuid WHERE jsonb_array_length(c.items)>0 GROUP BY c.customer_id,c.updated_at ORDER BY c.updated_at DESC LIMIT 100`;
  return {
    items: rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      value: Number(r.value),
    })),
    note: "Saved baskets are not reservations. Abandoned means inactive for at least 30 minutes. Recovery is available on sign-in; no reminder emails are sent.",
  };
}
async function loyaltyLock(tx: Tx, customer: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"loyalty:" + customer},0))`;
}
async function syncLoyalty(tx: Tx, customer: string) {
  const rows = await tx.$queryRaw<
    Array<{
      order_id: string;
      points_spent: number;
      points_earned: number;
      restored: boolean;
      earn_every: number;
      status: string;
      paymentState: string | null;
      payload: Receipt;
      received: boolean;
    }>
  >`SELECT l.*,o.status,p.state AS "paymentState",d.payload,EXISTS(SELECT 1 FROM store_returns r WHERE r.order_id=o.id AND r.inventory_processed=true) AS received FROM store_loyalty_orders l JOIN orders o ON o.id=l.order_id JOIN store_order_details d ON d.order_id=o.id LEFT JOIN store_payments p ON p.order_id=o.id WHERE l.customer_id=${customer}`;
  for (const row of rows) {
    const closed =
      row.status === "cancelled" ||
      ["cancelled", "failed", "refunded"].includes(row.paymentState ?? "");
    const earned =
      row.status === "confirmed" && row.paymentState === "paid" && !row.received
        ? Math.floor(
            Math.max(
              0,
              row.payload.subtotal -
                (row.payload.discount ?? 0) -
                (row.payload.loyalty?.discount ?? 0),
            ) / row.earn_every,
          )
        : 0;
    const restore = closed && !row.restored;
    const delta = earned - row.points_earned + (restore ? row.points_spent : 0);
    if (delta || earned !== row.points_earned || restore) {
      await tx.$executeRaw`UPDATE store_loyalty_orders SET points_earned=${earned},restored=${row.restored || restore} WHERE order_id=${row.order_id}::uuid`;
      if (delta)
        await tx.$executeRaw`INSERT INTO store_loyalty_events(customer_id,order_id,delta,reason) VALUES(${customer},${row.order_id}::uuid,${delta},${restore ? "Cancelled/refunded order adjustment" : earned > row.points_earned ? "Paid purchase points" : "Return/refund points adjustment"})`;
    }
  }
}
async function loyaltyBalance(tx: Pick<Tx, "$queryRaw">, customer: string) {
  const rows = await tx.$queryRaw<
    Array<{ balance: bigint; earned: bigint }>
  >`SELECT COALESCE(sum(points_earned-CASE WHEN restored THEN 0 ELSE points_spent END),0) AS balance,COALESCE(sum(points_earned),0) AS earned FROM store_loyalty_orders WHERE customer_id=${customer}`;
  return { balance: Number(rows[0].balance), earned: Number(rows[0].earned) };
}
export async function loyalty(customer: string) {
  verifiedAccount(customer);
  return db.$transaction(async (tx) => {
    await loyaltyLock(tx, customer);
    await tx.$executeRaw`INSERT INTO store_loyalty_accounts(customer_id) VALUES(${customer}) ON CONFLICT DO NOTHING`;
    await syncLoyalty(tx, customer);
    const balance = await loyaltyBalance(tx, customer);
    const rules = (await settings(tx)).settings;
    const history =
      await tx.$queryRaw`SELECT id,order_id AS "orderId",delta,reason,created_at AS "createdAt" FROM store_loyalty_events WHERE customer_id=${customer} ORDER BY created_at DESC,id LIMIT 40`;
    return {
      ...balance,
      available: Math.max(0, balance.balance),
      tier:
        balance.earned >= 10000
          ? "Platinum"
          : balance.earned >= 5000
            ? "Gold"
            : balance.earned >= 1000
              ? "Silver"
              : "Member",
      rules,
      history,
    };
  });
}
export async function reserveLoyalty(
  tx: Tx,
  customer: string,
  id: string,
  receipt: Receipt,
  points: number,
) {
  const rules = (await settings(tx)).settings;
  receipt.storeName = rules.name;
  if (customer.startsWith("guest-")) {
    if (points) verifiedAccount(customer);
    return;
  }
  await loyaltyLock(tx, customer);
  await syncLoyalty(tx, customer);
  const balance = await loyaltyBalance(tx, customer);
  const quote = loyaltyDiscount(
    points,
    balance.balance,
    receipt.subtotal - (receipt.discount ?? 0),
    rules,
  );
  if (quote.error) throw new StoreError(409, "LOYALTY_CHANGED", quote.error);
  receipt.loyalty = {
    pointsRedeemed: points,
    discount: quote.discount,
    earnEvery: rules.loyaltyEarnEvery,
  };
  const net = receipt.subtotal - (receipt.discount ?? 0) - quote.discount;
  receipt.tax = Math.floor(net * 0.1);
  receipt.total = net + receipt.tax + receipt.shipping;
  if (rules.loyaltyEnabled || points) {
    await tx.$executeRaw`INSERT INTO store_loyalty_accounts(customer_id) VALUES(${customer}) ON CONFLICT DO NOTHING`;
    await tx.$executeRaw`INSERT INTO store_loyalty_orders(order_id,customer_id,points_spent,earn_every) VALUES(${id}::uuid,${customer},${points},${rules.loyaltyEarnEvery})`;
    if (points)
      await tx.$executeRaw`INSERT INTO store_loyalty_events(customer_id,order_id,delta,reason) VALUES(${customer},${id}::uuid,${-points},'Points reserved at checkout')`;
  }
  await tx.$executeRaw`UPDATE store_saved_carts SET items='[]'::jsonb,version=version+1,updated_at=now() WHERE customer_id=${customer}`;
}
export async function tickets(customer: string | null) {
  const rows = await db.$queryRaw<
    Array<Record<string, unknown> & { id: string }>
  >`SELECT id,subject,status,version,order_id AS "orderId",created_at AS "createdAt",updated_at AS "updatedAt" FROM store_support_tickets WHERE (${customer}::text IS NULL OR customer_id=${customer}) ORDER BY updated_at DESC,id LIMIT 50`;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const messages = await db.$queryRaw<
    Array<{
      ticketId: string;
      sender: string;
      message: string;
      createdAt: Date;
    }>
  >`SELECT ticket_id AS "ticketId",sender,message,created_at AS "createdAt" FROM store_support_messages WHERE ticket_id=ANY(${ids}::uuid[]) ORDER BY created_at,id`;
  return rows.map((r) => ({
    ...r,
    messages: messages.filter((m) => m.ticketId === r.id),
  }));
}
export async function createTicket(
  customer: string,
  input: { subject: string; message: string; orderId?: string },
) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"support:" + customer},0))`;
    const count = await tx.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT count(*) AS n FROM store_support_tickets WHERE customer_id=${customer} AND created_at>now()-interval '1 day'`;
    if (Number(count[0].n) >= 10)
      throw new StoreError(
        429,
        "SUPPORT_LIMIT",
        "You can open up to 10 support requests a day.",
      );
    if (input.orderId) {
      const own =
        await tx.$queryRaw`SELECT id FROM orders WHERE id=${input.orderId}::uuid AND customer_id=${customer}`;
      if (!(own as unknown[]).length)
        throw new StoreError(404, "ORDER_NOT_FOUND", "Order not found.");
    }
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`INSERT INTO store_support_tickets(customer_id,subject,order_id) VALUES(${customer},${input.subject},${input.orderId ?? null}::uuid) RETURNING id`;
    await tx.$executeRaw`INSERT INTO store_support_messages(ticket_id,sender,message) VALUES(${rows[0].id}::uuid,'customer',${input.message})`;
  });
  return tickets(customer);
}
export async function replyTicket(
  id: string,
  customer: string | null,
  message: string,
  status?: string,
  actor?: string,
) {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ status: string }>
    >`SELECT status FROM store_support_tickets WHERE id=${id}::uuid AND (${customer}::text IS NULL OR customer_id=${customer}) FOR UPDATE`;
    if (!rows.length)
      throw new StoreError(
        404,
        "TICKET_NOT_FOUND",
        "Support request not found.",
      );
    const count = await tx.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT count(*) AS n FROM store_support_messages WHERE ticket_id=${id}::uuid`;
    if (Number(count[0].n) >= 100)
      throw new StoreError(
        409,
        "THREAD_LIMIT",
        "This conversation is full. Open a new request.",
      );
    await tx.$executeRaw`INSERT INTO store_support_messages(ticket_id,sender,message) VALUES(${id}::uuid,${customer ? "customer" : "staff"},${message})`;
    await tx.$executeRaw`UPDATE store_support_tickets SET status=${customer ? "open" : (status ?? "in_progress")},version=version+1,updated_at=now() WHERE id=${id}::uuid`;
    if (actor)
      await audit(
        actor,
        "support_reply",
        { ticket: id, status: status ?? "in_progress" },
        tx,
      );
  });
  return tickets(customer);
}
export async function targets() {
  const ranges = await db.$queryRaw<
    Array<{
      period: string;
      startsOn: string;
      endsOn: string;
      amount: bigint | null;
      version: number | null;
      actual: bigint;
    }>
  >`WITH periods AS (SELECT 'week'::text AS period,date_trunc('week',now() AT TIME ZONE 'Asia/Tokyo')::date AS start,interval '1 week' AS span UNION ALL SELECT 'month',date_trunc('month',now() AT TIME ZONE 'Asia/Tokyo')::date,interval '1 month') SELECT p.period,to_char(p.start,'YYYY-MM-DD') AS "startsOn",to_char(p.start+p.span,'YYYY-MM-DD') AS "endsOn",t.amount,t.version,COALESCE((SELECT sum((d.payload->>'total')::bigint) FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.status='confirmed' AND o.created_at>=p.start::timestamp AT TIME ZONE 'Asia/Tokyo' AND o.created_at<(p.start+p.span)::timestamp AT TIME ZONE 'Asia/Tokyo'),0) AS actual FROM periods p LEFT JOIN store_sales_targets t ON t.period=p.period AND t.starts_on=p.start`;
  return {
    timezone: "Asia/Tokyo",
    items: ranges.map((r) => ({
      ...r,
      amount: r.amount === null ? null : Number(r.amount),
      actual: Number(r.actual),
      version: r.version ?? 0,
    })),
    note: "Confirmed order value in JPY, including demo orders and unpaid COD. Refunded/cancelled orders are excluded once their order status closes. Week starts Monday; month starts on day 1. This is order revenue, not cash collected.",
  };
}
export async function saveTarget(
  actor: string,
  period: string,
  amount: number,
  version: number,
) {
  const current = (await targets()).items.find((r) => r.period === period);
  if (!current)
    throw new StoreError(400, "INVALID_PERIOD", "Choose week or month.");
  await db.$transaction(async (tx) => {
    const rows =
      await tx.$queryRaw`INSERT INTO store_sales_targets(period,starts_on,amount,updated_by) SELECT ${period},${current.startsOn}::date,${amount},${actor} WHERE ${version}=0 ON CONFLICT(period,starts_on) DO NOTHING RETURNING version`;
    if (!(rows as unknown[]).length) {
      const changed =
        await tx.$executeRaw`UPDATE store_sales_targets SET amount=${amount},updated_by=${actor},updated_at=now(),version=version+1 WHERE period=${period} AND starts_on=${current.startsOn}::date AND version=${version}`;
      if (!changed)
        throw new StoreError(
          409,
          "TARGET_CHANGED",
          "This target changed. Reload before saving.",
        );
    }
    await audit(
      actor,
      "sales_target_updated",
      { period, amount, startsOn: current.startsOn },
      tx,
    );
  });
  return targets();
}
