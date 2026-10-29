import { findOrderByTrackingReference } from "../../../packages/prisma/src/shopping-tools.ts";
import { z } from "@hono/zod-openapi";
import { Hono } from "hono";
import {
  AddressInput,
  ReturnInput,
} from "../../../packages/api-contracts/src/shopping-tools.ts";
import {
  addresses,
  removeAddress,
  requestReturn,
  returnableOrders,
  returnsList,
  saveAddress,
} from "../../../packages/prisma/src/shopping-tools.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
export const shoppingRoutes = new Hono<{ Variables: { customerId: string } }>();
const uuid = (value: string) => {
  const id = z.uuid().safeParse(value);
  if (!id.success)
    throw new StoreError(400, "INVALID_ID", "Invalid record ID.");
  return id.data;
};
shoppingRoutes.get("/addresses", async (c) =>
  c.json({ items: await addresses(c.get("customerId")) }),
);
shoppingRoutes.post("/addresses", async (c) => {
  const input = AddressInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_ADDRESS",
      "Complete all address fields and use a short label.",
    );
  return c.json(await saveAddress(c.get("customerId"), input.data), 201);
});
shoppingRoutes.put("/addresses/:id", async (c) => {
  const input = AddressInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_ADDRESS",
      "Complete all address fields and use a short label.",
    );
  return c.json(
    await saveAddress(c.get("customerId"), input.data, uuid(c.req.param("id"))),
  );
});
shoppingRoutes.delete("/addresses/:id", async (c) => {
  await removeAddress(c.get("customerId"), uuid(c.req.param("id")));
  return c.body(null, 204);
});
shoppingRoutes.get("/returns", async (c) =>
  c.json({ items: await returnsList(c.get("customerId")) }),
);
shoppingRoutes.get("/returnable-orders", async (c) =>
  c.json({ items: await returnableOrders(c.get("customerId")) }),
);
shoppingRoutes.post("/returns", async (c) => {
  const input = ReturnInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_RETURN",
      "Choose an order and a return reason.",
    );
  return c.json(await requestReturn(c.get("customerId"), input.data), 201);
});
shoppingRoutes.onError((failure, c) =>
  failure instanceof StoreError
    ? c.json({ code: failure.code, message: failure.message }, failure.status)
    : c.json(
        {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed. Please retry.",
        },
        500,
      ),
);

shoppingRoutes.get("/track-reference", async c => c.json(await findOrderByTrackingReference(c.req.query("reference") ?? "", c.get("customerId"))));
