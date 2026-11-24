import { z } from "@hono/zod-openapi";
export const StaffRole = z.enum([
  "manager",
  "inventory",
  "orders",
  "support",
  "disabled",
]);
export type { Role, Settings } from "./growth-policy.ts";
export {
  allowed,
  staffPermission,
  DEFAULT_SETTINGS,
  loyaltyDiscount,
} from "./growth-policy.ts";
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
