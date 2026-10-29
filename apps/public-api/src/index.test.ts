import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { db } from "@training2/prisma";
import { app } from "./index.ts";

const createdProductIds: string[] = [];
let buyerToken = "";

const cognitoEndpoint = process.env.COGNITO_LOCAL_ENDPOINT;

if (!cognitoEndpoint) {
  throw new Error("COGNITO_LOCAL_ENDPOINT is required");
}

const { clientId } = JSON.parse(
  await readFile(
    new URL("../../../.local/cognito.json", import.meta.url),
    "utf8",
  ),
) as {
  poolId: string;
  clientId: string;
};

const cognito = new CognitoIdentityProviderClient({
  endpoint: cognitoEndpoint,
  region: "local",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

async function signIn(username: string) {
  const response = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: "Training2-local!",
      },
    }),
  );

  const token = response.AuthenticationResult?.AccessToken;

  if (!token) {
    throw new Error("Cognito did not return an access token");
  }

  return token;
}

async function createProduct(stock: number) {
  const [sequence] = await db.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('product_code_seq') AS n`;
  const product = await db.products.create({
    data: {
      code: `A-${sequence.n.toString().padStart(2, "0")}`,
      product_number: sequence.n,
      name: "Test Product",
      description: "Test",
      price: 1000,
      stock,
    },
  });

  createdProductIds.push(product.id);
  return product;
}

async function createOrder(productId: string, quantity: number) {
  const response = await app.request("/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${buyerToken}`,
    },
    body: JSON.stringify({
      items: [{ productId, quantity }],
    }),
  });

  assert.equal(response.status, 201);

  return response.json();
}

async function confirmOrder(orderId: string) {
  return app.request(`/orders/${orderId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buyerToken}`,
    },
  });
}

async function cancelOrder(orderId: string) {
  return app.request(`/orders/${orderId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buyerToken}`,
    },
  });
}

before(async () => {
  await db.$connect();
  buyerToken = await signIn("buyer@example.test");
});

after(async () => {
  await db.$executeRaw`DELETE FROM store_inventory_events WHERE product_id=ANY(${createdProductIds}::uuid[])`;
  await db.orders.deleteMany({
    where: {
      order_items: {
        some: {
          product_id: {
            in: createdProductIds,
          },
        },
      },
    },
  });

  await db.order_items.deleteMany({
    where: {
      product_id: {
        in: createdProductIds,
      },
    },
  });

  await db.products.deleteMany({
    where: {
      id: {
        in: createdProductIds,
      },
    },
  });

  await db.$disconnect();
});

describe("orders", () => {
  it("creates an order with pending status", async () => {
    const product = await createProduct(10);

    const order = await createOrder(product.id, 2);

    assert.equal(order.status, "pending");
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].productId, product.id);
    assert.equal(order.items[0].quantity, 2);
  });

  it("confirms an order and decrements stock", async () => {
    const product = await createProduct(10);

    const order = await createOrder(product.id, 3);
    const response = await confirmOrder(order.id);

    assert.equal(response.status, 200);

    const confirmed = await response.json();
    assert.equal(confirmed.status, "confirmed");

    const updatedProduct = await db.products.findUnique({
      where: {
        id: product.id,
      },
    });

    assert.equal(updatedProduct?.stock, 7);
  });

  it("rejects confirmation when stock is insufficient", async () => {
    const product = await createProduct(1);

    const order = await createOrder(product.id, 2);
    const response = await confirmOrder(order.id);

    assert.equal(response.status, 409);

    const unchangedProduct = await db.products.findUnique({
      where: {
        id: product.id,
      },
    });

    assert.equal(unchangedProduct?.stock, 1);
  });

  it("cancels a confirmed order and restores stock", async () => {
    const product = await createProduct(10);

    const order = await createOrder(product.id, 4);

    const confirmResponse = await confirmOrder(order.id);
    assert.equal(confirmResponse.status, 200);

    const afterConfirm = await db.products.findUnique({
      where: {
        id: product.id,
      },
    });

    assert.equal(afterConfirm?.stock, 6);

    const cancelResponse = await cancelOrder(order.id);
    assert.equal(cancelResponse.status, 200);

    const cancelled = await cancelResponse.json();
    assert.equal(cancelled.status, "cancelled");

    const afterCancel = await db.products.findUnique({
      where: {
        id: product.id,
      },
    });

    assert.equal(afterCancel?.stock, 10);
  });

  it("cancels a pending order without changing stock", async () => {
    const product = await createProduct(10);

    const order = await createOrder(product.id, 2);
    const response = await cancelOrder(order.id);

    assert.equal(response.status, 200);
    assert.equal((await db.products.findUniqueOrThrow({where:{id:product.id}})).stock,10);
  });

  it("allows only one of two simultaneous confirmations when stock is 1", async () => {
    const product = await createProduct(1);

    const order1 = await createOrder(product.id, 1);
    const order2 = await createOrder(product.id, 1);

    const [response1, response2] = await Promise.all([
      confirmOrder(order1.id),
      confirmOrder(order2.id),
    ]);

    const statuses = [response1.status, response2.status].sort();

    assert.deepEqual(statuses, [200, 409]);

    const updatedProduct = await db.products.findUnique({
      where: {
        id: product.id,
      },
    });

    assert.equal(updatedProduct?.stock, 0);
  });
});
