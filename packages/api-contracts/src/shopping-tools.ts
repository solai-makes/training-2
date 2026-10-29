import { z } from "@hono/zod-openapi";
export const AddressInput = z
  .object({
    label: z.string().trim().min(1).max(40),
    recipient: z
      .object({
        name: z.string().trim().min(1).max(100),
        address: z.string().trim().min(1).max(200),
        city: z.string().trim().min(1).max(100),
        postalCode: z.string().trim().min(1).max(30),
      })
      .strict(),
    isDefault: z.boolean().default(false),
  })
  .strict();
export const VariantInput = z
  .object({
    label: z.string().trim().min(1).max(80),
    color: z.string().trim().max(40).default(""),
    size: z.string().trim().max(40).default(""),
    price: z.number().int().min(0).max(9999999),
    stock: z.number().int().min(0).max(1000000),
  })
  .strict();
export const ReturnInput = z
  .object({
    orderId: z.uuid(),
    reason: z.enum([
      "Damaged or defective",
      "Wrong item",
      "Not as described",
      "Changed my mind",
      "Other",
    ]),
    details: z.string().trim().max(1000).default(""),
  })
  .strict();
export const ReturnReviewInput = z
  .object({
    action: z.enum(["approve", "reject", "receive"]),
    note: z.string().trim().max(1000).default(""),
    restock: z.boolean().default(false),
  })
  .strict();
