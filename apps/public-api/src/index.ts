import { customerGrowthRoutes } from "./growth-routes.ts";
import { settings as publicStoreSettings } from "../../../packages/prisma/src/store-growth.ts";
import { bodyLimit } from "hono/body-limit";
import { readProductImage } from "../../../packages/prisma/src/product-images.ts";
import { customerAuth } from "./customer-auth.ts";
import { createHash } from "node:crypto";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import {
  cancelOrderRoute,
  checkoutRoute,
  confirmOrderRoute,
  createOrderRoute,
  listOrdersRoute,
  Pagination,
  receiptRoute,
} from "@training2/api-contracts";
import type { Context, Next } from "hono";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  products,
  StoreError,
} from "../../../packages/prisma/src/store.ts";
import { verifyCustomerToken } from "./auth.ts";
import { paymentConfig } from "./payment-providers.ts";
import {
  cancelPayment,
  completeDemo,
  razorpayWebhook,
  refundPayment,
  resumePayment,
  startPayment,
  syncPayment,
  verifyRazorpay,
} from "./payments.ts";
import { shoppingRoutes } from "./shopping-routes.ts";
import { CartInput, CheckoutInput } from "./store-contracts.ts";

type Env = { Variables: { customerId: string } };
export const app = new OpenAPIHono<Env>();
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
app.get("/product-images/:id/:hash", async (c) => {
  const photo = await readProductImage(c.req.param("id"),c.req.param("hash"));
  if (!photo) return c.body(null,404);
  c.header("Content-Type",photo.mime);
  c.header("X-Content-Type-Options","nosniff");
  c.header("Content-Security-Policy","default-src 'none'; sandbox");
  c.header("Cache-Control","public, max-age=31536000, immutable");
  return c.body(new Uint8Array(photo.content));
});
app.route("/auth", customerAuth);
app.get("/health", (c) => c.json({ status: "ok", service: "public-api" }));
app.get("/catalog", async (c) => {
  const result = await products(1, 5000);
  const etag =
    '"' +
    createHash("sha256").update(JSON.stringify(result)).digest("hex") +
    '"';
  c.header("ETag", etag);
  c.header("Cache-Control", "private, no-cache");
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  return c.json(result);
});
app.get("/products", async (c) => {
  const query = Pagination.safeParse({
    page: c.req.query("page"),
    pageSize: c.req.query("pageSize"),
  });
  if (!query.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid pagination.");
  return c.json(
    await products(
      query.data.page,
      query.data.pageSize,
      (c.req.query("q") ?? "").slice(0, 200),
    ),
  );
});
async function requireCustomer(c: Context<Env>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer "))
    throw new StoreError(401, "UNAUTHENTICATED", "Please sign in.");
  let identity: { sub: string };
  try {
    identity = await verifyCustomerToken(header.slice(7));
  } catch {
    throw new StoreError(
      401,
      "UNAUTHENTICATED",
      "Your session expired. Please sign in again.",
    );
  }
  c.set("customerId", identity.sub);
  await next();
}
app.use("/account/*", requireCustomer);
app.use("/account/growth/*",bodyLimit({maxSize:32000}));
app.route("/account/growth",customerGrowthRoutes);
app.get("/store/settings",async c=>c.json(await publicStoreSettings()));
app.route("/account", shoppingRoutes);
app.use("/orders", requireCustomer);
app.use("/orders/*", requireCustomer);
app.use("/checkout", requireCustomer);
app.get("/payments/config", async (c) => c.json(await paymentConfig()));
app.post("/payments/razorpay/webhook", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > 1000000)
    throw new StoreError(400, "INVALID_INPUT", "Webhook too large.");
  return c.json(
    await razorpayWebhook(
      await c.req.text(),
      c.req.header("X-Razorpay-Signature") ?? "",
    ),
  );
});
app.use("/payments/*", requireCustomer);
const paymentId = (value: string) => {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid payment order.");
  return parsed.data;
};
app.post("/payments/:id/resume", async (c) =>
  c.json(
    await resumePayment(paymentId(c.req.param("id")), c.get("customerId")),
  ),
);
app.post("/payments/:id/status", async (c) =>
  c.json(await syncPayment(paymentId(c.req.param("id")), c.get("customerId"))),
);
app.post("/payments/:id/cancel", async (c) =>
  c.json(
    await cancelPayment(paymentId(c.req.param("id")), c.get("customerId")),
  ),
);
app.post("/payments/:id/refund", async (c) =>
  c.json(
    await refundPayment(paymentId(c.req.param("id")), c.get("customerId")),
  ),
);
app.post("/payments/:id/demo-complete", async (c) =>
  c.json(await completeDemo(paymentId(c.req.param("id")), c.get("customerId"))),
);
app.post("/payments/:id/verify", async (c) => {
  const input = z
    .object({
      razorpay_order_id: z.string().min(1).max(100),
      razorpay_payment_id: z.string().min(1).max(100),
      razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid payment verification.");
  return c.json(
    await verifyRazorpay(
      paymentId(c.req.param("id")),
      c.get("customerId"),
      input.data,
    ),
  );
});
app.get("/orders/:id/tracking", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid order ID.");
  return c.json(await getOrder(id.data, c.get("customerId")));
});
app.openapi(listOrdersRoute, async (c) => {
  const { page, pageSize } = c.req.valid("query");
  return c.json(await listOrders(c.get("customerId"), page, pageSize), 200);
});
app.openapi(createOrderRoute, async (c) => {
  const parsed = CartInput.safeParse(c.req.valid("json"));
  if (!parsed.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Use unique products and quantities from 1 to 1,000.",
    );
  return c.json(await createOrder(c.get("customerId"), parsed.data.items), 201);
});
app.openapi(confirmOrderRoute, async (c) =>
  c.json(await confirmOrder(c.req.valid("param").id, c.get("customerId")), 200),
);
app.openapi(cancelOrderRoute, async (c) =>
  c.json(await cancelOrder(c.req.valid("param").id, c.get("customerId")), 200),
);
app.openapi(checkoutRoute, async (c) => {
  const parsed = CheckoutInput.safeParse(await c.req.json().catch(() => null));
  const key = z.uuid().safeParse(c.req.header("Idempotency-Key"));
  if (!parsed.success || !key.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Check your delivery details and cart quantities.",
    );
  return c.json(
    await startPayment(c.get("customerId"), key.data, parsed.data),
    201,
  );
});
app.openapi(receiptRoute, async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success)
    throw new StoreError(400, "INVALID_INPUT", "Invalid order ID.");
  const order = await getOrder(id.data, c.get("customerId"));
  if (order.status !== "confirmed")
    throw new StoreError(
      409,
      "RECEIPT_UNAVAILABLE",
      "Receipts are available for confirmed orders.",
    );
  if (!order.receipt?.confirmedAt)
    throw new StoreError(
      409,
      "RECEIPT_UNAVAILABLE",
      "A saved receipt is unavailable for this earlier order.",
    );
  return c.json(
    { orderId: order.id, status: order.status, ...order.receipt },
    200,
  );
});
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { title: "Solaistore customer API", version: "0.2.0" },
});
app.notFound((c) =>
  c.json(
    {
      code: "NOT_FOUND",
      message: "Route not found.",
      requestId: crypto.randomUUID(),
    },
    404,
  ),
);
app.onError((failure, c) => {
  if (failure instanceof StoreError)
    return c.json(
      {
        code: failure.code,
        message: failure.message,
        requestId: crypto.randomUUID(),
      },
      failure.status,
    );
  if (failure instanceof SyntaxError)
    return c.json(
      {
        code: "INVALID_INPUT",
        message: "Invalid JSON.",
        requestId: crypto.randomUUID(),
      },
      400,
    );
  console.error(failure);
  return c.json(
    {
      code: "INTERNAL_ERROR",
      message: "Unable to complete the request. Please try again.",
      requestId: crypto.randomUUID(),
    },
    500,
  );
});
