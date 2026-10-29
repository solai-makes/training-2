import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { db } from "@training2/prisma";
import { app } from "./app.ts";

const ids: string[] = [];
const code = `TEST-${randomUUID()}`;
let adminToken = "";
let buyerToken = "";

const input = {
  name: "Test product",
  description: "Integration test",
  price: 1200,
  stock: 3,
};

async function signIn(username: string) {
  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: "Training2-local!",
    }),
  });

  assert.equal(response.status, 200);
  return (await response.json()).token as string;
}

function request(path: string, token: string, body?: unknown) {
  return app.request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

after(async () => {
  await db.$executeRaw`DELETE FROM store_inventory_events WHERE product_id=ANY(${ids}::uuid[])`;
  await db.products.deleteMany({
    where: { id: { in: ids } },
  });

  await db.$disconnect();
});

test("local sign-in verifies credentials", async () => {
  adminToken = await signIn("admin@example.test");
  buyerToken = await signIn("buyer@example.test");

  const response = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin@example.test",
      password: "wrong",
    }),
  });

  assert.equal(response.status, 401);
});

test("product routes reject unauthenticated, forged, and buyer tokens", async () => {
  assert.equal((await app.request("/products")).status, 401);
  assert.equal((await request("/products", "forged")).status, 401);
  assert.equal((await request("/products", buyerToken)).status, 403);
  assert.equal((await request("/products", buyerToken, input)).status, 403);
});

test("admin creates a product and reads the persisted values", async () => {
  const response = await request("/products", adminToken, {
    ...input,
    name: " Test product ",
  });

  assert.equal(response.status, 201);

  const product = await response.json();
  ids.push(product.id);

  assert.match(product.code, /^A-\d+$/);
  assert.equal(product.name, "Test product");

  const saved = await db.products.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(saved.price, 1200);
  assert.equal(saved.stock, 3);
  assert.equal(saved.code, product.code);

  const responseList = await request("/products?pageSize=100", adminToken);

  assert.equal(responseList.status, 200);

  const list = await responseList.json();

  let found = list.items.some((item: { id: string }) => item.id === product.id);
  for (let page = 2; !found && page <= Math.ceil(list.total / 100); page++) {
    const next = await request(`/products?page=${page}&pageSize=100`, adminToken);
    assert.equal(next.status, 200);
    found = (await next.json()).items.some((item: { id: string }) => item.id === product.id);
  }
  assert.ok(found);
  assert.equal(list.items.length, Math.min(100, list.total));
});

test("product codes are generated server-side", async () => {
  const firstResponse = await request("/products", adminToken, {
    ...input,
    name: "First generated code product",
  });

  assert.equal(firstResponse.status, 201);

  const firstProduct = await firstResponse.json();
  ids.push(firstProduct.id);

  const secondResponse = await request("/products", adminToken, {
    ...input,
    name: "Second generated code product",
  });

  assert.equal(secondResponse.status, 201);

  const secondProduct = await secondResponse.json();
  ids.push(secondProduct.id);

  assert.match(firstProduct.code, /^A-\d+$/);
  assert.match(secondProduct.code, /^A-\d+$/);
  assert.notEqual(firstProduct.code, secondProduct.code);
});

test("invalid product values and pagination are rejected", async () => {
  for (const change of [
    { code: " " },
    { name: "" },
    { price: -1 },
    { price: 10000000 },
    { price: 1.5 },
    { stock: -1 },
    { stock: 1.5 },
    { stock: 2147483648 },
    { extra: true },
  ]) {
    assert.equal(
      (
        await request("/products", adminToken, {
          ...input,
          ...change,
        })
      ).status,
      400,
    );
  }

  for (const query of ["page=0", "pageSize=101", "page=no"]) {
    assert.equal((await request(`/products?${query}`, adminToken)).status, 400);
  }
});

test("zero price and stock are accepted and pagination works", async () => {
  const response = await request("/products", adminToken, {
    ...input,
    name: "Zero product",
    price: 0,
    stock: 0,
  });

  assert.equal(response.status, 201);

  const product = await response.json();
  ids.push(product.id);

  assert.match(product.code, /^A-\d+$/);
  assert.equal(product.price, 0);
  assert.equal(product.stock, 0);

  const list = await (
    await request("/products?page=1&pageSize=1", adminToken)
  ).json();

  assert.equal(list.items.length, 1);
  assert.ok(list.total >= 2);
});

test("PostgreSQL rejects invalid values without API validation", async () => {
  for (const sql of [
    "INSERT INTO products(code,name,price,stock) VALUES ('" +
      code +
      "-BAD-1', 'Bad', -1, 0)",
    "INSERT INTO products(code,name,price,stock) VALUES ('" +
      code +
      "-BAD-2', 'Bad', 10000000, 0)",
    "INSERT INTO products(code,name,price,stock) VALUES ('" +
      code +
      "-BAD-3', 'Bad', 0, -1)",
    "INSERT INTO products(code,name,price,stock) VALUES (' ', 'Bad', 0, 0)",
  ]) {
    await assert.rejects(db.$executeRawUnsafe(sql));
  }
});

test("malformed JSON returns a safe validation error", async () => {
  const response = await app.request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: "{",
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "VALIDATION_ERROR");
});

test("OpenAPI includes product requests and authentication", async () => {
  const document = await (await app.request("/openapi.json")).json();

  assert.ok(document.paths["/products"].post);
  assert.ok(document.paths["/products"].get);
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, "bearer");
});
