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

function dto(product: {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    ...productDetails(product),
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    price: pricedProduct(product).price,
    stock: product.stock,
    createdAt: product.created_at.toISOString(),
    updatedAt: product.updated_at.toISOString(),
  };
}

app.openapi(createProductRoute, async (c) => {
  const input = c.req.valid("json");
  if (input.imageData) { try { decodeProductImage(input.imageData); } catch (failure) { return error(c,400,"INVALID_IMAGE",(failure as Error).message); } }

  const product = await db.$transaction(async (tx) => {
    const sequenceResult = await tx.$queryRaw<Array<{ next_number: bigint }>>`
      SELECT nextval('product_code_seq') AS next_number
    `;

    const nextNumber = sequenceResult[0]?.next_number;

    if (nextNumber === undefined) {
      throw new Error("PRODUCT_CODE_SEQUENCE_UNAVAILABLE");
    }

    const code = `A-${nextNumber.toString().padStart(2, "0")}`;

    const created = await tx.products.create({
      data: {
        code,
        name: input.name,
        ...prepareProduct(input),
        stock: input.stock,
        product_number: nextNumber,
      },
    });
    if (created.stock > 0)
      await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) VALUES(${created.id}::uuid,${created.code},${created.name},${created.stock},${created.stock},'Initial product stock',${c.get("adminSub")})`;
    await saveProductImage(tx,created.id,input.imageData);
    return created;
  });

  return c.json(Product.parse((await withProductImages([dto(product)]))[0]), 201);
});

app.openapi(updateProductRoute, async (c) => {
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  if (input.imageData) { try { decodeProductImage(input.imageData); } catch (failure) { return error(c,400,"INVALID_IMAGE",(failure as Error).message); } }

  const existing = await db.products.findUnique({
    where: { id },
  });

  if (!existing) return error(c, 404, "NOT_FOUND", "Product not found.");

  const product = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ updated_at: Date; stock: number }>
    >`SELECT updated_at, stock FROM products WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows[0]) return null;
    if (
      input.expectedUpdatedAt &&
      rows[0].updated_at.getTime() !==
        new Date(input.expectedUpdatedAt).getTime()
    )
      return false;
    const saved = await tx.products.update({
      where: { id },
      data: {
        name: input.name,
        ...prepareProduct(input),
        stock: input.stock,
        updated_at: new Date(),
      },
    });
    const delta = input.stock - rows[0].stock;
    if (delta)
      await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) VALUES(${id}::uuid,${saved.code},${saved.name},${delta},${saved.stock},'Product edit','staff')`;
    await saveProductImage(tx,saved.id,input.imageData);
    return saved;
  });
  if (product === null) return error(c, 404, "NOT_FOUND", "Product not found.");
  if (product === false)
    return error(
      c,
      409,
      "CONFLICT",
      "This product changed while you were editing. Close this dialog, refresh, and try again.",
    );

  return c.json(Product.parse((await withProductImages([dto(product)]))[0]), 200);
});

app.openapi(deleteProductRoute, async (c) => {
  const { id } = c.req.valid("param");

  const existing = await db.products.findUnique({
    where: { id },
  });

  if (!existing) return error(c, 404, "NOT_FOUND", "Product not found.");

  try {
    await db.products.delete({
      where: { id },
    });
  } catch (failure) {
    if (
      failure &&
      typeof failure === "object" &&
      "code" in failure &&
      failure.code === "P2003"
    ) {
      return error(
        c,
        409,
        "CONFLICT",
        "This product is used by an order or has variants. Remove unused variants first.",
      );
    }

    throw failure;
  }

  return c.body(null, 204);
});

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
