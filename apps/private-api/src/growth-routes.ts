import { Hono } from "hono";
import { z } from "@hono/zod-openapi";
import {
  StaffRole,
  StoreSettings,
  TicketReply,
  type Role,
} from "../../../packages/api-contracts/src/store-growth.ts";
import {
  audit,
  settings,
  staffList,
  setStaffRole,
  updateSettings,
  recoverySummary,
  tickets,
  replyTicket,
  targets,
  saveTarget,
} from "../../../packages/prisma/src/store-growth.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
import { db } from "../../../packages/prisma/src/index.ts";
export const growthRoutes = new Hono<{
  Variables: { actor: string; role: Role };
}>();
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
growthRoutes.get("/me", async (c) =>
  c.json({ role: c.get("role"), settings: (await settings()).settings }),
);
growthRoutes.get("/settings", async (c) => c.json(await settings()));
growthRoutes.put("/settings", async (c) => {
  const input = parse(
    z
      .object({ settings: StoreSettings, version: z.number().int().positive() })
      .strict(),
    await c.req.json(),
  );
  return c.json(
    await updateSettings(c.get("actor"), input.settings, input.version),
  );
});
growthRoutes.get("/staff", async (c) =>
  c.json({
    items: await staffList(),
    activity:
      await db.$queryRaw`SELECT actor,action,details,created_at AS "createdAt" FROM store_admin_activity ORDER BY created_at DESC LIMIT 30`,
  }),
);
growthRoutes.put("/staff", async (c) => {
  const input = parse(
    z
      .object({ principal: z.string().trim().min(3).max(254), role: StaffRole })
      .strict(),
    await c.req.json(),
  );
  await setStaffRole(c.get("actor"), input.principal.toLowerCase(), input.role);
  return c.json({ items: await staffList() });
});
growthRoutes.get("/recovery", async (c) => c.json(await recoverySummary()));
growthRoutes.get("/support", async (c) =>
  c.json({ items: await tickets(null) }),
);
growthRoutes.post("/support/:id/reply", async (c) => {
  const id = parse(z.uuid(), c.req.param("id"));
  const input = parse(TicketReply, await c.req.json());
  return c.json({
    items: await replyTicket(
      id,
      null,
      input.message,
      input.status,
      c.get("actor"),
    ),
  });
});
growthRoutes.get("/targets", async (c) => c.json(await targets()));
growthRoutes.put("/targets", async (c) => {
  const input = parse(
    z
      .object({
        period: z.enum(["week", "month"]),
        amount: z.number().int().positive().max(1000000000000),
        version: z.number().int().nonnegative(),
      })
      .strict(),
    await c.req.json(),
  );
  return c.json(
    await saveTarget(c.get("actor"), input.period, input.amount, input.version),
  );
});
