export type Role =
  | "admin"
  | "manager"
  | "inventory"
  | "orders"
  | "support"
  | "disabled";
export type Settings = {
  name: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  businessHours: string;
  announcement: string;
  returnPolicy: string;
  loyaltyEnabled: boolean;
  loyaltyEarnEvery: number;
  loyaltyYenPerPoint: number;
  loyaltyMaxPercent: number;
};
export const DEFAULT_SETTINGS: Settings = {
  name: "Solaistore",
  tagline: "Good finds. Better everyday.",
  supportEmail: "",
  supportPhone: "",
  businessHours: "Monday–Friday, 09:00–18:00 JST",
  announcement: "",
  returnPolicy:
    "Contact support about returns within 30 days of delivery. Staff will review your request.",
  loyaltyEnabled: true,
  loyaltyEarnEvery: 100,
  loyaltyYenPerPoint: 1,
  loyaltyMaxPercent: 10,
};
const grants: Record<Role, string[]> = {
  admin: ["*"],
  manager: [
    "catalog:view",
    "catalog:write",
    "orders:view",
    "orders:write",
    "refunds:write",
    "analytics:view",
    "support:write",
    "targets:write",
    "recovery:view",
  ],
  inventory: ["catalog:view", "catalog:write"],
  orders: ["catalog:view", "orders:view", "orders:write", "support:write"],
  support: ["catalog:view", "orders:view", "support:write"],
  disabled: [],
};
export function allowed(role: Role | null, permission: string) {
  return (
    !!role && (grants[role].includes("*") || grants[role].includes(permission))
  );
}
export function staffPermission(path: string, method: string) {
  const write = !["GET", "HEAD"].includes(method);
  if (/\/profit(?:\/|$)/.test(path)) return "analytics:view";
  if (path.includes("/growth/me")) return "catalog:view";
  if (path.includes("/growth/staff")) return "staff:write";
  if (path.includes("/growth/settings")) return "settings:write";
  if (path.includes("/growth/targets"))
    return write ? "targets:write" : "analytics:view";
  if (path.includes("/growth/support")) return "support:write";
  if (path.includes("/growth/recovery")) return "recovery:view";
  if (path.includes("/refund")) return "refunds:write";
  if (path.includes("/returns")) return write ? "orders:write" : "orders:view";
  if (path.includes("/orders")) return write ? "orders:write" : "orders:view";
  if (/\/(analytics|overview|inventory\/chart)$/.test(path))
    return "analytics:view";
  return write ? "catalog:write" : "catalog:view";
}
export function loyaltyDiscount(
  points: number,
  balance: number,
  subtotalAfterCoupon: number,
  settings: Settings,
) {
  if (!Number.isInteger(points) || points < 0 || points > Math.max(0, balance))
    return {
      error: "Choose points within your available balance.",
      discount: 0,
      maxPoints: 0,
    };
  const maxPoints = settings.loyaltyEnabled
    ? Math.floor(
        Math.floor((subtotalAfterCoupon * settings.loyaltyMaxPercent) / 100) /
          settings.loyaltyYenPerPoint,
      )
    : 0;
  if (points > maxPoints)
    return {
      error:
        "The selected points exceed the loyalty discount limit for this order.",
      discount: 0,
      maxPoints,
    };
  return {
    error: "",
    discount: points * settings.loyaltyYenPerPoint,
    maxPoints,
  };
}
