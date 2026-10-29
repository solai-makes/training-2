import { growthRoutes } from "./growth-routes.ts";
import { roleFor, demand } from "../../../packages/prisma/src/store-growth.ts";
import { staffPermission, type Role } from "../../../packages/api-contracts/src/store-growth.ts";
import { bodyLimit } from "hono/body-limit";
import { z } from "@hono/zod-openapi";
import { Hono } from "hono";
import {
  ReturnReviewInput,
  VariantInput,
} from "../../../packages/api-contracts/src/shopping-tools.ts";
import { collectCOD } from "../../../packages/prisma/src/cod.ts";
import { salesReport } from "../../../packages/prisma/src/sales-report.ts";
import {
  createVariant,
  enrichVariants,
  prepareReturnRefund,
  priceHistory,
  returnsList,
  reviewReturn,
} from "../../../packages/prisma/src/shopping-tools.ts";
import { stockReport } from "../../../packages/prisma/src/stock-report.ts";
import {
  adjustStock,
  inventoryEvents,
  listOrders,
  overview,
  StoreError,
  updateTracking,
} from "../../../packages/prisma/src/store.ts";
import { refundPayment } from "../../public-api/src/payments.ts";
import { verify } from "./auth.ts";
export const storeRoutes = new Hono<{ Variables: { actor: string; role: Role } }>();
storeRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization");
  if (!token?.startsWith("Bearer "))
    throw new StoreError(401, "UNAUTHENTICATED", "Please sign in.");
  let identity: Awaited<ReturnType<typeof verify>>;
  try {
    identity = await verify(token.slice(7));
  } catch {
    throw new StoreError(
      401,
      "UNAUTHENTICATED",
      "Your session expired. Please sign in again.",
    );
  }
  const role=await roleFor(identity);
  demand(role,staffPermission(c.req.path,c.req.method));
  c.set("role",role as Role);
  c.set("actor", identity.sub);
  await next();
});
storeRoutes.use("/growth/*",bodyLimit({maxSize:32000}));
storeRoutes.route("/growth",growthRoutes);
storeRoutes.post("/inventory/:id/adjust", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const input = z
    .object({
      delta: z
        .number()
        .int()
        .min(-1000000)
        .max(1000000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(1).max(200),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!id.success || !input.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Enter a nonzero stock adjustment and a reason.",
    );
  return c.json(
    await adjustStock(
      id.data,
      input.data.delta,
      input.data.reason,
      c.get("actor"),
    ),
  );
});
storeRoutes.get("/inventory/events", async (c) =>
  c.json({ items: await inventoryEvents() }),
);
storeRoutes.get("/inventory/chart", async (c) => {
  const input = z
    .object({
      productId: z.uuid().optional(),
      days: z.coerce
        .number()
        .refine((n) => n === 7 || n === 30)
        .default(7),
    })
    .safeParse(c.req.query());
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Choose a product and a 7- or 30-day period.",
    );
  return c.json(
    await stockReport(input.data.productId ?? null, input.data.days),
  );
});
storeRoutes.post("/orders/:id/cod-collected", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid order ID.");
  return c.json(await collectCOD(id.data));
});
storeRoutes.post("/orders/:id/tracking", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const input = z
    .object({
      stage: z.enum([
        "confirmed",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
      ]),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!id.success || !input.success)
    throw new StoreError(400, "INVALID_INPUT", "Choose a valid delivery step.");
  return c.json(await updateTracking(id.data, input.data.stage));
});
storeRoutes.get("/analytics", async (c) => {
  const days = Number(c.req.query("days") ?? 7);
  if (![7, 30].includes(days))
    throw new StoreError(400, "INVALID_INPUT", "Choose 7 or 30 days.");
  return c.json(await salesReport(days));
});
storeRoutes.get("/overview", async (c) => c.json(await overview()));
storeRoutes.get("/orders", async (c) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .safeParse(c.req.query());
  if (!query.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid pagination.");
  return c.json(await listOrders(null, query.data.page, query.data.pageSize));
});

const recordId = (value: string) => {
  const id = z.uuid().safeParse(value);
  if (!id.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid record ID.");
  return id.data;
};
storeRoutes.get("/products/:id/price-history", async (c) => {
  const days = Number(c.req.query("days") ?? 30);
  if (![7, 30, 90].includes(days))
    throw new StoreError(400, "INVALID_INPUT", "Choose 7, 30 or 90 days.");
  return c.json(await priceHistory(recordId(c.req.param("id")), days));
});
storeRoutes.get("/products/:id/variants", async (c) => {
  const id = recordId(c.req.param("id"));
  return c.json((await enrichVariants([{ id }]))[0]);
});
storeRoutes.post("/products/:id/variants", async (c) => {
  const input = VariantInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Enter an option label, whole-yen price and nonnegative stock.",
    );
  return c.json(
    await createVariant(
      recordId(c.req.param("id")),
      input.data,
      c.get("actor"),
    ),
    201,
  );
});
storeRoutes.get("/returns", async (c) =>
  c.json({ items: await returnsList(null) }),
);
storeRoutes.post("/returns/:id/review", async (c) => {
  const input = ReturnReviewInput.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!input.success)
    throw new StoreError(400, "INVALID_INPUT", "Choose a valid return action.");
  return c.json(
    await reviewReturn(
      recordId(c.req.param("id")),
      input.data.action,
      input.data.note,
      input.data.restock,
      c.get("actor"),
    ),
  );
});
storeRoutes.post("/returns/:id/refund", async (c) => {
  const id = recordId(c.req.param("id"));
  const input = z
    .object({ cashRefundConfirmed: z.boolean().default(false) })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid refund confirmation.");
  const prepared = await prepareReturnRefund(
    id,
    input.data.cashRefundConfirmed,
  );
  if (!prepared.done) await refundPayment(prepared.orderId, null);
  return c.json((await returnsList(null)).find((row) => row.id === id));
});
storeRoutes.onError((failure, c) => {
  if (failure instanceof StoreError)
    return c.json(
      {
        code: failure.code,
        message: failure.message,
        requestId: crypto.randomUUID(),
      },
      failure.status,
    );
  console.error(failure);
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId: crypto.randomUUID(),
    },
    500,
  );
});
