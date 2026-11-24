import {profitRoutes} from "./profit-routes.ts";
import {deliveryPeople,addDeliveryPerson,assignDeliveryPerson,completeFleetDelivery,updateDeliveryProfile,updateDispatchSettings,suggestedDeliveryPerson,dispatchFleetDelivery,cancelFleetDispatch} from "../../../packages/prisma/src/delivery-fleet.ts";
import {getOrder} from "../../../packages/prisma/src/store.ts";
import {restockDemand} from "../../../packages/prisma/src/restock.ts";
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
storeRoutes.use("/profit/*",bodyLimit({maxSize:16000}));
storeRoutes.route("/profit",profitRoutes);
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
  if(input.data.stage==='out_for_delivery'){await dispatchFleetDelivery(id.data);return c.json(await getOrder(id.data,null));}if(input.data.stage==='delivered'){await completeFleetDelivery(id.data);return c.json(await getOrder(id.data,null));}return c.json(await updateTracking(id.data, input.data.stage));
});
storeRoutes.get('/analytics',async c=>{
 const from=c.req.query('from'),to=c.req.query('to'),days=Number(c.req.query('days')??7);
 if((from===undefined)!==(to===undefined)||(!from&&!to&&![7,15,30].includes(days)))throw new StoreError(400,'INVALID_INPUT','Choose 7, 15, 30 days or custom dates.');
 try{return c.json(await salesReport(days,from!==undefined&&to!==undefined?{from,to}:undefined));}catch(error){if(error instanceof RangeError)throw new StoreError(400,'INVALID_INPUT',error.message);throw error;}
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
  return c.json(await listOrders(null, query.data.page, query.data.pageSize,(c.req.query("search")??"").slice(0,120)));
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

storeRoutes.get("/restock",async c=>c.json({items:await restockDemand()}));

storeRoutes.get('/orders/delivery-people',async c=>c.json({items:await deliveryPeople()}));
storeRoutes.post('/orders/delivery-people',async c=>{const input=z.object({name:z.string().trim().min(1).max(100)}).strict().safeParse(await c.req.json().catch(()=>null));if(!input.success)throw new StoreError(400,'INVALID_INPUT','Enter a delivery person name.');return c.json({items:await addDeliveryPerson(input.data.name)},201);});
storeRoutes.get('/orders/:id/delivery',async c=>{const id=z.uuid().safeParse(c.req.param('id'));if(!id.success)throw new StoreError(400,'INVALID_INPUT','Invalid order.');return c.json(await getOrder(id.data,null));});
storeRoutes.post('/orders/:id/delivery-person',async c=>{const id=z.uuid().safeParse(c.req.param('id')),input=z.object({personId:z.uuid()}).strict().safeParse(await c.req.json().catch(()=>null));if(!id.success||!input.success)throw new StoreError(400,'INVALID_INPUT','Choose an order and delivery person.');await assignDeliveryPerson(id.data,input.data.personId);return c.json(await getOrder(id.data,null));});

storeRoutes.post('/orders/:id/delivery-complete',async c=>{const id=z.uuid().safeParse(c.req.param('id'));if(!id.success)throw new StoreError(400,'INVALID_INPUT','Invalid order.');await completeFleetDelivery(id.data);return c.json(await getOrder(id.data,null));});

storeRoutes.post('/orders/delivery-people/:id/profile',async c=>{const id=z.uuid().safeParse(c.req.param('id')),input=z.object({experienceYears:z.number().int().min(0).max(60).nullable(),rating:z.number().int().min(1).max(5).nullable()}).strict().safeParse(await c.req.json().catch(()=>null));if(!id.success||!input.success)throw new StoreError(400,'INVALID_PROFILE','Use 0–60 years and a rating from 1 to 5.');await updateDeliveryProfile(id.data,input.data.experienceYears,input.data.rating);return c.json({ok:true});});

storeRoutes.post('/orders/delivery-people/:id/dispatch',async c=>{const id=z.uuid().safeParse(c.req.param('id')),input=z.object({onDuty:z.boolean(),zones:z.array(z.string().trim().min(1).max(60)).max(20)}).strict().safeParse(await c.req.json().catch(()=>null));if(!id.success||!input.success)throw new StoreError(400,'INVALID_ZONES','Enter up to 20 delivery cities.');await updateDispatchSettings(id.data,input.data.onDuty,input.data.zones);return c.json({ok:true});});
storeRoutes.post('/orders/:id/assign-suggested',async c=>{const id=z.uuid().safeParse(c.req.param('id'));if(!id.success)throw new StoreError(400,'INVALID_ORDER','Invalid order.');const person=await suggestedDeliveryPerson(id.data);await assignDeliveryPerson(id.data,person.id);return c.json(await getOrder(id.data,null));});

storeRoutes.post('/orders/:id/dispatch',async c=>{const id=z.uuid().safeParse(c.req.param('id'));if(!id.success)throw new StoreError(400,'INVALID_ORDER','Invalid order.');await dispatchFleetDelivery(id.data);return c.json(await getOrder(id.data,null));});

storeRoutes.post('/orders/:id/return-to-store',async c=>{const id=z.uuid().safeParse(c.req.param('id'));if(!id.success)throw new StoreError(400,'INVALID_ORDER','Invalid order.');await cancelFleetDispatch(id.data);return c.json(await getOrder(id.data,null));});
