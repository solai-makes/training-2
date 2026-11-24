export type StaffOperation = {
  name: string;
  kind: "query" | "mutation";
  method: string;
  path: string;
  args: Record<string, string>;
  result: string;
  selection?: string;
  permission: string;
};
const product =
  "id code name description category price stock basePrice discountPercent createdAt updatedAt imageUrl";
const order =
  "id status createdAt updatedAt receipt gateway items { id productId code name quantity unitPrice lineTotal }";
export const staffOperations: StaffOperation[] = [
  {
    name: "createStaffProduct",
    kind: "mutation",
    method: "POST",
    path: "/products",
    args: { input: "StaffProductInput!" },
    result: "StaffProduct",
    selection: product,
    permission: "catalog:write",
  },
  {
    name: "updateStaffProduct",
    kind: "mutation",
    method: "PUT",
    path: "/products/:id",
    args: { id: "ID!", input: "StaffProductInput!" },
    result: "StaffProduct",
    selection: product,
    permission: "catalog:write",
  },
  {
    name: "deleteStaffProduct",
    kind: "mutation",
    method: "DELETE",
    path: "/products/:id",
    args: { id: "ID!" },
    result: "StaffSuccess",
    selection: "ok",
    permission: "catalog:write",
  },
  {
    name: "adjustStaffStock",
    kind: "mutation",
    method: "POST",
    path: "/store/inventory/:id/adjust",
    args: { id: "ID!", input: "StaffStockInput!" },
    result: "JSON",
    permission: "catalog:write",
  },
  {
    name: "staffInventoryEvents",
    kind: "query",
    method: "GET",
    path: "/store/inventory/events",
    args: {},
    result: "JSON",
    permission: "catalog:view",
  },
  {
    name: "staffStockReport",
    kind: "query",
    method: "GET",
    path: "/store/inventory/chart",
    args: { productId: "ID", days: "Int" },
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "staffOverview",
    kind: "query",
    method: "GET",
    path: "/store/overview",
    args: {},
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "staffSalesReport",
    kind: "query",
    method: "GET",
    path: "/store/analytics",
    args: { days: "Int", from: "String", to: "String" },
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "staffOrders",
    kind: "query",
    method: "GET",
    path: "/store/orders",
    args: { page: "Int", pageSize: "Int", search: "String" },
    result: "StaffOrderPage",
    selection: "total page pageSize items { " + order + " }",
    permission: "orders:view",
  },
  {
    name: "staffOrderDelivery",
    kind: "query",
    method: "GET",
    path: "/store/orders/:id/delivery",
    args: { id: "ID!" },
    result: "StaffOrder",
    selection: order,
    permission: "orders:view",
  },
  {
    name: "collectStaffCod",
    kind: "mutation",
    method: "POST",
    path: "/store/orders/:id/cod-collected",
    args: { id: "ID!" },
    result: "StaffOrder",
    selection: order,
    permission: "orders:write",
  },
  {
    name: "updateStaffTracking",
    kind: "mutation",
    method: "POST",
    path: "/store/orders/:id/tracking",
    args: { id: "ID!", input: "StaffTrackingInput!" },
    result: "StaffOrder",
    selection: order,
    permission: "orders:write",
  },
  {
    name: "staffPriceHistory",
    kind: "query",
    method: "GET",
    path: "/store/products/:id/price-history",
    args: { id: "ID!", days: "Int" },
    result: "JSON",
    permission: "catalog:view",
  },
  {
    name: "staffProductVariants",
    kind: "query",
    method: "GET",
    path: "/store/products/:id/variants",
    args: { id: "ID!" },
    result: "JSON",
    permission: "catalog:view",
  },
  {
    name: "createStaffVariant",
    kind: "mutation",
    method: "POST",
    path: "/store/products/:id/variants",
    args: { id: "ID!", input: "StaffVariantInput!" },
    result: "JSON",
    permission: "catalog:write",
  },
  {
    name: "staffReturns",
    kind: "query",
    method: "GET",
    path: "/store/returns",
    args: {},
    result: "JSON",
    permission: "orders:view",
  },
  {
    name: "reviewStaffReturn",
    kind: "mutation",
    method: "POST",
    path: "/store/returns/:id/review",
    args: { id: "ID!", input: "StaffReturnInput!" },
    result: "JSON",
    permission: "orders:write",
  },
  {
    name: "refundStaffReturn",
    kind: "mutation",
    method: "POST",
    path: "/store/returns/:id/refund",
    args: { id: "ID!", input: "StaffRefundInput!" },
    result: "JSON",
    permission: "refunds:write",
  },
  {
    name: "staffRestockDemand",
    kind: "query",
    method: "GET",
    path: "/store/restock",
    args: {},
    result: "JSON",
    permission: "catalog:view",
  },
  {
    name: "staffDeliveryPartners",
    kind: "query",
    method: "GET",
    path: "/store/orders/delivery-people",
    args: {},
    result: "StaffPartnerPage",
    selection:
      "items { id name code sample experienceYears rating onDuty zones dispatchState orderId }",
    permission: "orders:view",
  },
  {
    name: "addStaffDeliveryPartner",
    kind: "mutation",
    method: "POST",
    path: "/store/orders/delivery-people",
    args: { input: "StaffPartnerInput!" },
    result: "JSON",
    permission: "orders:write",
  },
  {
    name: "updateStaffPartnerProfile",
    kind: "mutation",
    method: "POST",
    path: "/store/orders/delivery-people/:id/profile",
    args: { id: "ID!", input: "StaffPartnerProfileInput!" },
    result: "StaffSuccess",
    selection: "ok",
    permission: "orders:write",
  },
  {
    name: "updateStaffPartnerDuty",
    kind: "mutation",
    method: "POST",
    path: "/store/orders/delivery-people/:id/dispatch",
    args: { id: "ID!", input: "StaffPartnerDutyInput!" },
    result: "StaffSuccess",
    selection: "ok",
    permission: "orders:write",
  },
  ...[
    [
      "assignStaffPartner",
      "delivery-person",
      { id: "ID!", input: "StaffAssignmentInput!" },
    ],
    ["assignSuggestedStaffPartner", "assign-suggested", { id: "ID!" }],
    ["dispatchStaffOrder", "dispatch", { id: "ID!" }],
    ["completeStaffDelivery", "delivery-complete", { id: "ID!" }],
    ["returnStaffDeliveryToStore", "return-to-store", { id: "ID!" }],
  ].map(
    ([name, suffix, args]) =>
      ({
        name,
        kind: "mutation",
        method: "POST",
        path: "/store/orders/:id/" + suffix,
        args,
        result: "StaffOrder",
        selection: order,
        permission: "orders:write",
      }) as StaffOperation,
  ),
  {
    name: "staffMe",
    kind: "query",
    method: "GET",
    path: "/store/growth/me",
    args: {},
    result: "JSON",
    permission: "catalog:view",
  },
  {
    name: "staffSettings",
    kind: "query",
    method: "GET",
    path: "/store/growth/settings",
    args: {},
    result: "JSON",
    permission: "settings:write",
  },
  {
    name: "saveStaffSettings",
    kind: "mutation",
    method: "PUT",
    path: "/store/growth/settings",
    args: { input: "StaffSettingsVersionInput!" },
    result: "JSON",
    permission: "settings:write",
  },
  {
    name: "staffRoles",
    kind: "query",
    method: "GET",
    path: "/store/growth/staff",
    args: {},
    result: "JSON",
    permission: "staff:write",
  },
  {
    name: "saveStaffRole",
    kind: "mutation",
    method: "PUT",
    path: "/store/growth/staff",
    args: { input: "StaffRoleInput!" },
    result: "JSON",
    permission: "staff:write",
  },
  {
    name: "staffCartRecovery",
    kind: "query",
    method: "GET",
    path: "/store/growth/recovery",
    args: {},
    result: "JSON",
    permission: "recovery:view",
  },
  {
    name: "staffSupportTickets",
    kind: "query",
    method: "GET",
    path: "/store/growth/support",
    args: {},
    result: "JSON",
    permission: "support:write",
  },
  {
    name: "replyStaffSupportTicket",
    kind: "mutation",
    method: "POST",
    path: "/store/growth/support/:id/reply",
    args: { id: "ID!", input: "StaffReplyInput!" },
    result: "JSON",
    permission: "support:write",
  },
  {
    name: "staffSalesTargets",
    kind: "query",
    method: "GET",
    path: "/store/growth/targets",
    args: {},
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "saveStaffSalesTarget",
    kind: "mutation",
    method: "PUT",
    path: "/store/growth/targets",
    args: { input: "StaffTargetInput!" },
    result: "JSON",
    permission: "targets:write",
  },
  {
    name: "staffProfitReport",
    kind: "query",
    method: "GET",
    path: "/store/profit",
    args: {
      days: "Int",
      from: "String",
      to: "String",
      simulated: "Boolean",
      estimateMissingCosts: "Boolean",
    },
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "staffProductCosts",
    kind: "query",
    method: "GET",
    path: "/store/profit/costs",
    args: { search: "String" },
    result: "JSON",
    permission: "analytics:view",
  },
  {
    name: "saveStaffProductCost",
    kind: "mutation",
    method: "POST",
    path: "/store/profit/costs",
    args: { input: "StaffCostInput!" },
    result: "StaffSaved",
    selection: "saved",
    permission: "analytics:view",
  },
  {
    name: "addStaffExpense",
    kind: "mutation",
    method: "POST",
    path: "/store/profit/expenses",
    args: { input: "StaffExpenseInput!" },
    result: "StaffSaved",
    selection: "saved",
    permission: "analytics:view",
  },
];
export function matchStaffOperation(path: string, method: string) {
  for (const operation of staffOperations) {
    if (operation.method !== method) continue;
    const keys = [...operation.path.matchAll(/:([a-zA-Z]+)/g)].map(
      (match) => match[1],
    );
    const expression = new RegExp(
      "^" + operation.path.replace(/:[a-zA-Z]+/g, "([^/]+)") + "/?$",
    );
    const match = path.match(expression);
    if (match)
      return {
        operation,
        params: Object.fromEntries(
          keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]),
        ),
      };
  }
  return null;
}
export function staffDocument(operation: StaffOperation) {
  const args = Object.entries(operation.args);
  return (
    operation.kind +
    " " +
    operation.name +
    (args.length
      ? "(" + args.map(([key, type]) => "$" + key + ":" + type).join(",") + ")"
      : "") +
    "{result:" +
    operation.name +
    (args.length
      ? "(" + args.map(([key]) => key + ":$" + key).join(",") + ")"
      : "") +
    (operation.selection ? "{" + operation.selection + "}" : "") +
    "}"
  );
}
