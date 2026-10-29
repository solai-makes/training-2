import { Hono } from "hono";
import { z } from "@hono/zod-openapi";
import {
  SavedCart,
  TicketInput,
  TicketReply,
} from "../../../packages/api-contracts/src/store-growth.ts";
import {
  savedCart,
  saveCart,
  loyalty,
  tickets,
  createTicket,
  replyTicket,
} from "../../../packages/prisma/src/store-growth.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
export const customerGrowthRoutes = new Hono<{
  Variables: { customerId: string };
}>();
customerGrowthRoutes.get("/profile", (c) =>
  c.json({ eligible: !c.get("customerId").startsWith("guest-") }),
);
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Check the supplied fields.",
    );
  return result.data;
};
customerGrowthRoutes.get("/cart", async (c) =>
  c.json(await savedCart(c.get("customerId"))),
);
customerGrowthRoutes.put("/cart", async (c) => {
  const input = parse(
    z
      .object({
        items: SavedCart.shape.items,
        version: z.number().int().nonnegative(),
      })
      .strict()
      .refine(
        (v) => new Set(v.items.map((i) => i.productId)).size === v.items.length,
      ),
    await c.req.json(),
  );
  return c.json(
    await saveCart(c.get("customerId"), input.items, input.version),
  );
});
customerGrowthRoutes.get("/loyalty", async (c) =>
  c.json(await loyalty(c.get("customerId"))),
);
customerGrowthRoutes.get("/support", async (c) =>
  c.json({ items: await tickets(c.get("customerId")) }),
);
customerGrowthRoutes.post("/support", async (c) => {
  const input = parse(TicketInput, await c.req.json());
  return c.json({ items: await createTicket(c.get("customerId"), input) }, 201);
});
customerGrowthRoutes.post("/support/:id/reply", async (c) => {
  const id = parse(z.uuid(), c.req.param("id"));
  const input = parse(TicketReply.omit({ status: true }), await c.req.json());
  return c.json({
    items: await replyTicket(id, c.get("customerId"), input.message),
  });
});
