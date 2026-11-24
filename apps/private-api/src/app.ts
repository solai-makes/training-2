import {saveStaffProduct,deleteStaffProduct,productDto as dto} from './product-service.ts';
import {graphqlHandler} from './graphql.ts';
import { roleFor, demand } from "../../../packages/prisma/src/store-growth.ts";
import { staffPermission } from "../../../packages/api-contracts/src/store-growth.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
import { bodyLimit } from "hono/body-limit";
import { decodeProductImage, saveProductImage, readProductImage, withProductImages } from "../../../packages/prisma/src/product-images.ts";
import { randomUUID } from "node:crypto";
import { OpenAPIHono, z } from "@hono/zod-openapi";
import {
  ApiError,
  createProductRoute,
  deleteProductRoute,
  listProductsRoute,
  Product,
  ProductList,
  updateProductRoute,
} from "@training2/api-contracts";
import { db } from "@training2/prisma";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  prepareProduct,
  productDetails,
} from "../../../packages/api-contracts/src/product-details.ts";
import { pricedProduct } from "../../../packages/api-contracts/src/scheduled-price.ts";
import { enrichVariants } from "../../../packages/prisma/src/shopping-tools.ts";
import { login, verify } from "./auth.ts";
import { storeRoutes } from "./store-routes.ts";

type Env = { Variables: { requestId: string; adminSub: string } };

function error<S extends 400 | 401 | 403 | 404 | 409 | 500 | 503>(
  c: Context<Env>,
  status: S,
  code: string,
  message: string,
) {
  return c.json(
    ApiError.parse({
      code,
      message,
      requestId: c.get("requestId") ?? randomUUID(),
    }),
    status,
  );
}

export const app = new OpenAPIHono<Env>({
  defaultHook: (result, c) => {
    if (!result.success)
      return error(c, 400, "VALIDATION_ERROR", "Check the supplied fields.");
  },
});

app.use("*", async (c, next) => {
  c.set("requestId", randomUUID());
  c.header("Cache-Control", "no-store");
  await next();
});

app.use("/graphql",bodyLimit({maxSize:1250000}));
app.post("/graphql",graphqlHandler);
app.get("/health", (c) => c.json({ status: "ok", service: "private-api" }));

app.post("/auth/login", async (c) => {
  const input = z
    .object({
      username: z.string().min(1).max(254),
      password: z.string().min(1).max(256),
    })
    .safeParse(await c.req.json().catch(() => null));

  if (!input.success)
    return error(c, 400, "VALIDATION_ERROR", "Enter your email and password.");

  try {
    return c.json({
      ...(await (async()=>{const token=await login(input.data.username,input.data.password);const identity=await verify(token);return {token,role:await roleFor(identity)};})()),
    });
  } catch (failure) {
    if (
      failure instanceof Error &&
      [
        "NotAuthorizedException",
        "UserNotFoundException",
        "InvalidPasswordException",
      ].includes(failure.name)
    ) {
      return error(
        c,
        401,
        "UNAUTHENTICATED",
        "Email or password is incorrect.",
      );
    }

    if (failure instanceof Error && failure.name === "LocalSignInIncomplete") {
      return error(c, 409, "SIGN_IN_INCOMPLETE", failure.message);
    }
    if (
      failure instanceof Error &&
      failure.name === "UserNotConfirmedException"
    ) {
      return error(
        c,
        409,
        "ACCOUNT_NOT_CONFIRMED",
        "Run pnpm setup:local in the Dev Container to prepare the local accounts.",
      );
    }
    if (
      failure instanceof Error &&
      failure.name === "TooManyRequestsException"
    ) {
      return error(
        c,
        503,
        "AUTH_BUSY",
        "Sign-in is busy. Wait a moment and try again.",
      );
    }
    // Do not include credentials or tokens in diagnostic logs.
    console.error(
      JSON.stringify({
        requestId: c.get("requestId"),
        operation: "POST /auth/login",
        errorName: failure instanceof Error ? failure.name : "UnknownError",
      }),
    );
    return error(
      c,
      503,
      "AUTH_UNAVAILABLE",
      "Local sign-in is unavailable. Check that Cognito Local is running and run pnpm setup:local in the Dev Container.",
    );
  }
});

const requireAdmin: import("hono").MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("Authorization");

  if (!header?.startsWith("Bearer "))
    return error(c, 401, "UNAUTHENTICATED", "Please sign in.");

  let identity: Awaited<ReturnType<typeof verify>>;

  try {
    identity = await verify(header.slice(7));
  } catch {
    return error(
      c,
      401,
      "UNAUTHENTICATED",
      "Your session has expired. Please sign in again.",
    );
  }

  demand(await roleFor(identity),staffPermission(c.req.path,c.req.method));
  c.set("adminSub", identity.sub);

  await next();
};
app.use("/products", requireAdmin);
app.use("/products", bodyLimit({maxSize:1250000}));
app.use("/products/*", bodyLimit({maxSize:1250000}));
app.get("/product-images/:id/:hash", async (c) => {
  const photo = await readProductImage(c.req.param("id"),c.req.param("hash"));
  if (!photo) return c.body(null,404);
  c.header("Content-Type",photo.mime);
  c.header("X-Content-Type-Options","nosniff");
  c.header("Content-Security-Policy","default-src 'none'; sandbox");
  c.header("Cache-Control","public, max-age=31536000, immutable");
  return c.body(new Uint8Array(photo.content));
});

app.use("/products/*", requireAdmin);
app.route("/store", storeRoutes);

app.openapi(createProductRoute,async c=>c.json(await saveStaffProduct(null,c.req.valid('json'),c.get('adminSub')),201));
app.openapi(updateProductRoute,async c=>c.json(await saveStaffProduct(c.req.valid('param').id,c.req.valid('json'),c.get('adminSub')),200));
app.openapi(deleteProductRoute,async c=>{await deleteStaffProduct(c.req.valid('param').id);return c.body(null,204);});

app.openapi(listProductsRoute, async (c) => {
  const { page, pageSize } = c.req.valid("query");

  const [total, rows] = await db.$transaction(
    [
      db.products.count(),
      db.products.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ product_number: "asc" }, { id: "asc" }],
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );

  return c.json(
    ProductList.parse({
      items: await enrichVariants(rows.map(dto)),
      total,
      page,
      pageSize,
    }),
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
  info: {
    title: "Training2 Admin API",
    version: "0.1.0",
  },
});

app.notFound((c) => error(c, 404, "NOT_FOUND", "Route not found."));

app.onError((failure, c) => {
  if(failure instanceof StoreError) return c.json({code:failure.code,message:failure.message,requestId:c.get("requestId")},failure.status);
  if ("code" in failure && failure.code === "P2002")
    return error(
      c,
      409,
      "CONFLICT",
      "A product with this number already exists.",
    );

  if ("code" in failure && failure.code === "P2003")
    return error(c, 409, "CONFLICT", "This product is referenced by an order.");

  if (
    failure instanceof SyntaxError ||
    (failure instanceof HTTPException && failure.status === 400)
  )
    return error(c, 400, "VALIDATION_ERROR", "Invalid JSON.");

  console.error(
    JSON.stringify({
      requestId: c.get("requestId"),
      operation: `${c.req.method} ${c.req.path}`,
      result: "error",
    }),
  );

  return error(
    c,
    500,
    "INTERNAL_ERROR",
    "Something went wrong. Please try again.",
  );
});
