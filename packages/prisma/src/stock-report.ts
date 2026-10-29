import { db } from "./index.ts";
export async function stockReport(productId: string | null, days: number) {
  return db.$transaction(
    async (tx) => {
      const [counts] = await tx.$queryRaw<
        Array<{ current: bigint }>
      >`SELECT COALESCE(sum(stock),0) AS current FROM products WHERE (${productId}::uuid IS NULL OR id=${productId}::uuid)`;
      const movement = await tx.$queryRaw<
        Array<{ day: string; incoming: bigint; outgoing: bigint }>
      >`
   SELECT to_char(d.day,'YYYY-MM-DD') AS day,COALESCE(sum(GREATEST(e.delta,0)),0) AS incoming,COALESCE(sum(GREATEST(-e.delta,0)),0) AS outgoing
   FROM generate_series(current_date-(${days}::int-1),current_date,interval '1 day') d(day)
   LEFT JOIN store_inventory_events e ON e.created_at>=d.day AND e.created_at<d.day+interval '1 day' AND (${productId}::uuid IS NULL OR e.product_id=${productId}::uuid)
   GROUP BY d.day ORDER BY d.day`;
      let balance = Number(counts.current);
      const daily = movement.map((d) => ({
        day: d.day,
        incoming: Number(d.incoming),
        outgoing: Number(d.outgoing),
        closing: 0,
      }));
      for (let i = daily.length - 1; i >= 0; i--) {
        daily[i].closing = balance;
        balance -= daily[i].incoming - daily[i].outgoing;
      }
      const byProduct = await tx.$queryRaw<
        Array<{ id: string; name: string; stock: number }>
      >`SELECT id,name,stock FROM products WHERE (${productId}::uuid IS NULL OR id=${productId}::uuid) ORDER BY stock DESC,name LIMIT 12`;
      return {
        days,
        productId,
        current: Number(counts.current),
        incoming: daily.reduce((s, d) => s + d.incoming, 0),
        outgoing: daily.reduce((s, d) => s + d.outgoing, 0),
        daily,
        byProduct,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
