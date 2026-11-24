import { db } from "./index.ts";
import { StoreError } from "./store.ts";
import { reportRange } from "../../api-contracts/src/report-range.ts";
import {
  calculateProfit,
  type ProfitOrder,
} from "../../api-contracts/src/profit-calculation.ts";
export async function profitReport(
  days: number,
  custom?: { from: string; to: string },
  includeSimulated = false,
  estimateMissingCosts = true,
) {
  return db.$transaction(
    async (tx) => {
      const [clock] = await tx.$queryRaw<
        Array<{ today: string }>
      >`SELECT to_char(current_date,'YYYY-MM-DD') today`;
      const range = reportRange(custom ?? { days }, clock.today);
      type Payload = {
        confirmedAt: string;
        subtotal: number;
        discount?: number;
        loyalty?: { discount?: number };
        payment?: { provider?: string; state?: string };
        items: Array<{
          productId: string;
          name: string;
          quantity: number;
          lineTotal: number;
        }>;
      };
      const rows = await tx.$queryRaw<
        Array<{ day: string; payload: Payload; restocked: boolean }>
      >`SELECT to_char((d.payload->>'confirmedAt')::timestamptz,'YYYY-MM-DD') AS day,d.payload,COALESCE(r.stock_restocked,false) restocked FROM orders o JOIN store_order_details d ON d.order_id=o.id LEFT JOIN store_returns r ON r.order_id=o.id WHERE o.status='confirmed' AND (d.payload->>'confirmedAt')::timestamptz>=${range.from}::date AND (d.payload->>'confirmedAt')::timestamptz<${range.to}::date+interval '1 day'`;
      const costs = await tx.$queryRaw<
        Array<{ product_id: string; unit_cost: number; effective_on: string }>
      >`SELECT product_id,unit_cost,to_char(effective_on,'YYYY-MM-DD') effective_on FROM store_product_costs WHERE effective_on<=${range.to}::date ORDER BY effective_on DESC,id DESC`;
      const expenses = await tx.$queryRaw<
        Array<{ id: string; day: string; label: string; amount: number }>
      >`SELECT id,to_char(spent_on,'YYYY-MM-DD') AS day,label,amount FROM store_profit_expenses WHERE spent_on BETWEEN ${range.from}::date AND ${range.to}::date ORDER BY spent_on DESC,recorded_at DESC`;
      const orders: ProfitOrder[] = rows.map((r) => ({
        day: r.day,
        subtotal: Number(r.payload.subtotal ?? 0),
        discount: Number(r.payload.discount ?? 0),
        loyaltyDiscount: Number(r.payload.loyalty?.discount ?? 0),
        provider: r.payload.payment?.provider ?? "unknown",
        state: r.payload.payment?.state ?? "unknown",
        restocked: r.restocked,
        items: (r.payload.items ?? []).map((i) => ({
          ...i,
          unitCost:
            costs.find(
              (c) => c.product_id === i.productId && c.effective_on <= r.day,
            )?.unit_cost ?? null,
        })),
      }));
      return {
        from: range.from,
        to: range.to,
        includeSimulated,
        ...calculateProfit(
          orders,
          expenses,
          range.from,
          range.to,
          includeSimulated,
          estimateMissingCosts,
        ),
        expensesList: expenses,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function productCosts(search: string) {
  return db.$queryRaw<
    Array<{
      id: string;
      name: string;
      code: string;
      unitCost: number | null;
      effectiveOn: string | null;
    }>
  >`SELECT p.id,p.name,p.code,c.unit_cost AS "unitCost",to_char(c.effective_on,'YYYY-MM-DD') AS "effectiveOn" FROM products p LEFT JOIN LATERAL (SELECT unit_cost,effective_on FROM store_product_costs WHERE product_id=p.id AND effective_on<=current_date ORDER BY effective_on DESC,id DESC LIMIT 1)c ON true WHERE p.name ILIKE ${"%" + search + "%"} OR p.code ILIKE ${"%" + search + "%"} ORDER BY p.name,p.id LIMIT 40`;
}
export async function saveProductCost(
  id: string,
  unitCost: number,
  effectiveOn: string,
  actor: string,
) {
  const count =
    await db.$executeRaw`INSERT INTO store_product_costs(product_id,unit_cost,effective_on,actor) SELECT id,${unitCost},${effectiveOn}::date,${actor} FROM products WHERE id=${id}::uuid`;
  if (!count)
    throw new StoreError(404, "NOT_FOUND", "Product no longer exists.");
}
export async function addProfitExpense(
  id: string,
  day: string,
  amount: number,
  label: string,
  actor: string,
) {
  await db.$executeRaw`INSERT INTO store_profit_expenses(id,spent_on,amount,label,actor) VALUES(${id}::uuid,${day}::date,${amount},${label},${actor}) ON CONFLICT(id) DO NOTHING`;
  const [saved] = await db.$queryRaw<
    Array<{ day: string; amount: number; label: string }>
  >`SELECT to_char(spent_on,'YYYY-MM-DD') AS day,amount,label FROM store_profit_expenses WHERE id=${id}::uuid`;
  if (saved.day !== day || saved.amount !== amount || saved.label !== label)
    throw new StoreError(
      409,
      "EXPENSE_ALREADY_RECORDED",
      "This expense was already recorded with different details. Refresh before entering another expense.",
    );
}
