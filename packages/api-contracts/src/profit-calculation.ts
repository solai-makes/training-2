export type ProfitItem = {
  productId: string;
  name: string;
  quantity: number;
  lineTotal: number;
  unitCost: number | null;
};
export type ProfitOrder = {
  day: string;
  state: string;
  provider: string;
  restocked: boolean;
  subtotal: number;
  discount: number;
  loyaltyDiscount: number;
  items: ProfitItem[];
};
export function calculateProfit(
  orders: ProfitOrder[],
  expenses: Array<{ day: string; amount: number }>,
  from: string,
  to: string,
  includeSimulated = false,
  estimateMissingCosts = false,
) {
  const daily = new Map<
    string,
    {
      day: string;
      revenue: number;
      cost: number;
      expenses: number;
      missingUnits: number;
      estimatedUnits: number;
      estimatedCost: number;
      profit: number | null;
    }
  >();
  for (
    let d = Date.parse(from + "T00:00:00Z");
    d <= Date.parse(to + "T00:00:00Z");
    d += 86400000
  ) {
    const day = new Date(d).toISOString().slice(0, 10);
    daily.set(day, {
      day,
      revenue: 0,
      cost: 0,
      expenses: 0,
      missingUnits: 0,
      estimatedUnits: 0,
      estimatedCost: 0,
      profit: null,
    });
  }
  const products = new Map<
    string,
    {
      id: string;
      name: string;
      units: number;
      revenue: number;
      cost: number;
      missingUnits: number;
      estimatedUnits: number;
      estimatedCost: number;
      profit: number | null;
    }
  >();
  let paidOrders = 0,
    refundedOrders = 0,
    pendingOrders = 0,
    excludedSimulated = 0;
  for (const order of orders) {
    const day = daily.get(order.day);
    if (!day) continue;
    if (order.provider.startsWith("demo_") && !includeSimulated) {
      excludedSimulated++;
      continue;
    }
    if (!["paid", "refunded"].includes(order.state)) {
      pendingOrders++;
      continue;
    }
    const refunded = order.state === "refunded";
    if (refunded) refundedOrders++;
    else paidOrders++;
    const lines = order.items.reduce((s, i) => s + i.lineTotal, 0),
      saleNet = Math.max(
        0,
        order.subtotal - order.discount - order.loyaltyDiscount,
      );
    let allocated = 0;
    order.items.forEach((item, index) => {
      const saleRevenue =
        index === order.items.length - 1
          ? saleNet - allocated
          : lines > 0
            ? Math.floor((saleNet * item.lineTotal) / lines)
            : 0;
      allocated += saleRevenue;
      const revenue = refunded ? 0 : saleRevenue;
      const row = products.get(item.productId) ?? {
        id: item.productId,
        name: item.name,
        units: 0,
        revenue: 0,
        cost: 0,
        missingUnits: 0,
        estimatedUnits: 0,
        estimatedCost: 0,
        profit: null,
      };
      row.units += refunded ? 0 : item.quantity;
      row.revenue += revenue;
      day.revenue += revenue;
      if (!refunded || !order.restocked) {
        if (item.unitCost === null && !estimateMissingCosts) {
          row.missingUnits += item.quantity;
          day.missingUnits += item.quantity;
        } else {
          const estimated = item.unitCost === null;
          const cost = estimated
            ? saleRevenue - Math.round(saleRevenue * 0.25)
            : item.unitCost! * item.quantity;
          row.cost += cost;
          day.cost += cost;
          if (estimated) {
            row.estimatedUnits += item.quantity;
            day.estimatedUnits += item.quantity;
            row.estimatedCost += cost;
            day.estimatedCost += cost;
          }
        }
      }
      products.set(item.productId, row);
    });
  }
  for (const e of expenses) {
    const day = daily.get(e.day);
    if (day) day.expenses += e.amount;
  }
  const totals = {
    revenue: 0,
    cost: 0,
    expenses: 0,
    missingUnits: 0,
    estimatedUnits: 0,
    estimatedCost: 0,
    grossProfit: null as number | null,
    netProfit: null as number | null,
    margin: null as number | null,
  };
  for (const day of daily.values()) {
    day.profit = day.missingUnits
      ? null
      : day.revenue - day.cost - day.expenses;
    totals.revenue += day.revenue;
    totals.cost += day.cost;
    totals.expenses += day.expenses;
    totals.missingUnits += day.missingUnits;
    totals.estimatedUnits += day.estimatedUnits;
    totals.estimatedCost += day.estimatedCost;
  }
  if (!totals.missingUnits) {
    totals.grossProfit = totals.revenue - totals.cost;
    totals.netProfit = totals.grossProfit - totals.expenses;
    totals.margin = totals.revenue
      ? Math.round((totals.grossProfit / totals.revenue) * 1000) / 10
      : null;
  }
  for (const row of products.values())
    row.profit = row.missingUnits ? null : row.revenue - row.cost;
  return {
    ...totals,
    estimateMissingCosts,
    defaultMarginPercent: 25,
    paidOrders,
    refundedOrders,
    pendingOrders,
    excludedSimulated,
    daily: [...daily.values()],
    products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
