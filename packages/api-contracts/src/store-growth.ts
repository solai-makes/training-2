import { z } from "@hono/zod-openapi";
export const StaffRole = z.enum([
  "manager",
  "inventory",
  "orders",
  "support",
  "disabled",
]);
export type Role = z.infer<typeof StaffRole> | "admin";
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
export const StoreSettings = z
  .object({
    name: z.string().trim().min(1).max(60).default("Solaistore"),
    tagline: z.string().trim().max(180).default("Good finds. Better everyday."),
    supportEmail: z.union([z.email(), z.literal("")]).default(""),
    supportPhone: z.string().trim().max(40).default(""),
    businessHours: z
      .string()
      .trim()
      .max(160)
      .default("Monday–Friday, 09:00–18:00 JST"),
    announcement: z.string().trim().max(240).default(""),
    returnPolicy: z
      .string()
      .trim()
      .max(1000)
      .default(
        "Contact support about returns within 30 days of delivery. Staff will review your request.",
      ),
    loyaltyEnabled: z.boolean().default(true),
    loyaltyEarnEvery: z.number().int().min(10).max(100000).default(100),
    loyaltyYenPerPoint: z.number().int().min(1).max(10).default(1),
    loyaltyMaxPercent: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export type Settings = z.infer<typeof StoreSettings>;
export const DEFAULT_SETTINGS = StoreSettings.parse({});
export const SavedCart = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.uuid(),
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((i) => i.productId)).size === v.items.length,
  );
export const TicketInput = z
  .object({
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(3).max(2000),
    orderId: z.uuid().optional(),
  })
  .strict();
export const TicketReply = z
  .object({
    message: z.string().trim().min(1).max(2000),
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
  })
  .strict();
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
