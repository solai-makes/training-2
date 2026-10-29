import { pricedProduct } from "../../api-contracts/src/scheduled-price.ts";
import { db } from "./index.ts";

type Sale = {
  day: string;
  total: number;
  demo: boolean;
  due: boolean;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    lineTotal: number;
  }>;
};
export async function salesReport(days: number) {
  return db.$transaction(
    async (tx) => {
      const [movement] = await tx.$queryRaw<
        Array<{ incoming: bigint; outgoing: bigint }>
      >`SELECT COALESCE(sum(GREATEST(delta,0)),0) AS incoming,COALESCE(sum(GREATEST(-delta,0)),0) AS outgoing FROM store_inventory_events WHERE created_at>=current_date-(${days}::int-1)`;
      const [clock] = await tx.$queryRaw<
        Array<{ today: string }>
      >`SELECT to_char(current_date,'YYYY-MM-DD') AS today`;
      const rows = await tx.$queryRaw<
        Array<{ day: string; payload: any }>
      >`SELECT to_char(COALESCE((d.payload->>'confirmedAt')::timestamptz,o.created_at),'YYYY-MM-DD') AS day,d.payload FROM orders o JOIN store_order_details d ON d.order_id=o.id WHERE o.status='confirmed' AND COALESCE((d.payload->>'confirmedAt')::timestamptz,o.created_at)>=current_date-(${days * 2}::int-1) AND d.payload->>'confirmedAt' IS NOT NULL`;
      const rawProducts = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          description: string;
          stock: number;
          price: number;
        }>
      >`SELECT id,name,description,stock,price FROM products ORDER BY name`;
      const products = rawProducts.map((p) => pricedProduct(p));
      const currentStart = new Date(`${clock.today}T00:00:00Z`);
      currentStart.setUTCDate(currentStart.getUTCDate() - days + 1);
      const from = currentStart.toISOString().slice(0, 10);
      const sales: Sale[] = rows.map((r) => ({
        day: r.day,
        total: Number(r.payload.total),
        demo: String(r.payload.payment?.provider ?? "").startsWith("demo_"),
        due: r.payload.payment?.state === "due",
        items: r.payload.items ?? [],
      }));
      const current = sales.filter((r) => r.day >= from),
        previous = sales.filter((r) => r.day < from),
        revenue = current.reduce((s, r) => s + r.total, 0),
        previousRevenue = previous.reduce((s, r) => s + r.total, 0);
      const daily = Array.from({ length: days }, (_, i) => {
        const d = new Date(currentStart);
        d.setUTCDate(d.getUTCDate() + i);
        const day = d.toISOString().slice(0, 10),
          matches = current.filter((r) => r.day === day);
        return {
          day,
          revenue: matches.reduce((s, r) => s + r.total, 0),
          orders: matches.length,
        };
      });
      const sold = new Map<
        string,
        { id: string; name: string; units: number; revenue: number }
      >();
      for (const sale of current)
        for (const item of sale.items) {
          const row = sold.get(item.productId) ?? {
            id: item.productId,
            name: item.name,
            units: 0,
            revenue: 0,
          };
          row.units += Number(item.quantity);
          row.revenue += Number(item.lineTotal);
          sold.set(row.id, row);
        }
      return {
        stockIncoming: Number(movement.incoming),
        stockOutgoing: Number(movement.outgoing),
        days,
        from,
        to: clock.today,
        generatedAt: new Date().toISOString(),
        revenue,
        previousRevenue,
        changePercent:
          previousRevenue === 0
            ? null
            : Math.round(
                ((revenue - previousRevenue) / previousRevenue) * 1000,
              ) / 10,
        orders: current.length,
        unitsSold: [...sold.values()].reduce((s, r) => s + r.units, 0),
        demoRevenue: current
          .filter((r) => r.demo)
          .reduce((s, r) => s + r.total, 0),
        dueRevenue: current
          .filter((r) => r.due)
          .reduce((s, r) => s + r.total, 0),
        productCount: products.length,
        currentStock: products.reduce((s, p) => s + p.stock, 0),
        retailValue: products.reduce((s, p) => s + p.price * p.stock, 0),
        daily,
        best: [...sold.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8),
        slow: products
          .filter((p) => p.stock > 0)
          .map((p) => ({ ...p, units: sold.get(p.id)?.units ?? 0 }))
          .sort((a, b) => a.units - b.units || b.stock - a.stock)
          .slice(0, 8),
        low: products
          .filter((p) => p.stock <= 5)
          .sort((a, b) => a.stock - b.stock)
          .slice(0, 12),
        notes:
          "JPY order value of currently confirmed orders with saved receipt snapshots. Includes COD due and clearly identified demo orders; excludes cancelled orders. Comparison uses the preceding equal-length period. Product rankings use item value before tax; order revenue includes tax. Current day is partial. Dates use the database timezone. Purchase costs and profit are unavailable; stock value is retail value.",
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
