import { z } from "zod";
import { db } from "../../../packages/prisma/src/index.ts";
import {
  StoreError,
  adjustStock,
  inventoryEvents,
  listOrders,
  overview,
  updateTracking,
  getOrder,
} from "../../../packages/prisma/src/store.ts";
import { salesReport } from "../../../packages/prisma/src/sales-report.ts";
import { stockReport } from "../../../packages/prisma/src/stock-report.ts";
import { collectCOD } from "../../../packages/prisma/src/cod.ts";
import {
  priceHistory,
  enrichVariants,
  createVariant,
  returnsList,
  reviewReturn,
  prepareReturnRefund,
} from "../../../packages/prisma/src/shopping-tools.ts";
import { refundPayment } from "../../public-api/src/payments.ts";
import { restockDemand } from "../../../packages/prisma/src/restock.ts";
import * as fleet from "../../../packages/prisma/src/delivery-fleet.ts";
import * as growth from "../../../packages/prisma/src/store-growth.ts";
import * as profit from "../../../packages/prisma/src/profit-report.ts";
import {
  VariantInput,
  ReturnReviewInput,
} from "../../../packages/api-contracts/src/shopping-tools.ts";
import {
  StoreSettings,
  StaffRole,
  TicketReply,
  type Role,
} from "../../../packages/api-contracts/src/store-growth.ts";
import { reportRange } from "../../../packages/api-contracts/src/report-range.ts";
import { staffOperations } from "../../../packages/api-contracts/src/staff-graphql.ts";
import { saveStaffProduct, deleteStaffProduct } from "./product-service.ts";
export type StaffContext = { actor: string; role: Role };
type Args = {
  id?: unknown;
  input?: unknown;
  productId?: unknown;
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  days?: unknown;
  from?: unknown;
  to?: unknown;
  simulated?: unknown;
  estimateMissingCosts?: unknown;
};
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Check the supplied fields.",
    );
  return parsed.data;
};
const id = (value: unknown) => parse(z.uuid(), value);
const day = (value: string) => {
  try {
    reportRange(
      { from: value, to: value },
      new Date().toISOString().slice(0, 10),
    );
  } catch (error) {
    throw new StoreError(400, "INVALID_INPUT", (error as Error).message);
  }
};
const range = (args: Args, defaultDays: number, valid: number[]) => {
  const days = parse(
    z
      .number()
      .int()
      .refine((n) => valid.includes(n)),
    args.days ?? defaultDays,
  );
  if ((args.from == null) !== (args.to == null))
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Choose both start and end dates.",
    );
  return {
    days,
    custom:
      args.from != null && args.to != null
        ? { from: parse(z.string(), args.from), to: parse(z.string(), args.to) }
        : undefined,
  };
};
/** GraphQL calls domain services directly; no internal HTTP requests or REST proxying. */
export async function executeStaffOperation(
  name: string,
  args: Args,
  context: StaffContext,
): Promise<unknown> {
  const operation = staffOperations.find((item) => item.name === name);
  if (!operation)
    throw new StoreError(404, "NOT_FOUND", "Unknown staff operation.");
  growth.demand(context.role, operation.permission);
  try {
    switch (name) {
      case "createStaffProduct":
        return saveStaffProduct(null, args.input, context.actor);
      case "updateStaffProduct":
        return saveStaffProduct(id(args.id), args.input, context.actor);
      case "deleteStaffProduct":
        return deleteStaffProduct(id(args.id));
      case "adjustStaffStock": {
        const input = parse(
          z
            .object({
              delta: z
                .number()
                .int()
                .min(-1000000)
                .max(1000000)
                .refine((n) => n !== 0),
              reason: z.string().trim().min(1).max(200),
            })
            .strict(),
          args.input,
        );
        return adjustStock(
          id(args.id),
          input.delta,
          input.reason,
          context.actor,
        );
      }
      case "staffInventoryEvents":
        return { items: await inventoryEvents() };
      case "staffStockReport": {
        const r = range(args, 7, [7, 30]);
        return stockReport(args.productId ? id(args.productId) : null, r.days);
      }
      case "staffOverview":
        return overview();
      case "staffSalesReport": {
        const r = range(args, 7, [7, 15, 30]);
        return salesReport(r.days, r.custom);
      }
      case "staffOrders": {
        const input = parse(
          z.object({
            page: z.number().int().min(1).max(100000).default(1),
            pageSize: z.number().int().min(1).max(100).default(20),
            search: z.string().max(120).default(""),
          }),
          args,
        );
        return listOrders(null, input.page, input.pageSize, input.search);
      }
      case "staffOrderDelivery":
        return getOrder(id(args.id), null);
      case "collectStaffCod":
        return collectCOD(id(args.id));
      case "updateStaffTracking": {
        const input = parse(
          z
            .object({
              stage: z.enum([
                "confirmed",
                "packed",
                "shipped",
                "out_for_delivery",
                "delivered",
              ]),
            })
            .strict(),
          args.input,
        );
        const key = id(args.id);
        if (input.stage === "out_for_delivery")
          await fleet.dispatchFleetDelivery(key);
        else if (input.stage === "delivered")
          await fleet.completeFleetDelivery(key);
        else return updateTracking(key, input.stage);
        return getOrder(key, null);
      }
      case "staffPriceHistory":
        return priceHistory(
          id(args.id),
          parse(
            z
              .number()
              .int()
              .refine((n) => [7, 30, 90].includes(n)),
            args.days ?? 30,
          ),
        );
      case "staffProductVariants":
        return (await enrichVariants([{ id: id(args.id) }]))[0];
      case "createStaffVariant":
        return createVariant(
          id(args.id),
          parse(VariantInput, args.input),
          context.actor,
        );
      case "staffReturns":
        return { items: await returnsList(null) };
      case "reviewStaffReturn": {
        const input = parse(ReturnReviewInput, args.input);
        return reviewReturn(
          id(args.id),
          input.action,
          input.note,
          input.restock,
          context.actor,
        );
      }
      case "refundStaffReturn": {
        const input = parse(
          z
            .object({ cashRefundConfirmed: z.boolean().default(false) })
            .strict(),
          args.input,
        );
        const key = id(args.id),
          prepared = await prepareReturnRefund(key, input.cashRefundConfirmed);
        if (!prepared.done) await refundPayment(prepared.orderId, null);
        return (await returnsList(null)).find((row) => row.id === key);
      }
      case "staffRestockDemand":
        return { items: await restockDemand() };
      case "staffDeliveryPartners":
        return { items: await fleet.deliveryPeople() };
      case "addStaffDeliveryPartner": {
        const input = parse(
          z.object({ name: z.string().trim().min(1).max(100) }).strict(),
          args.input,
        );
        return { items: await fleet.addDeliveryPerson(input.name) };
      }
      case "updateStaffPartnerProfile": {
        const input = parse(
          z
            .object({
              experienceYears: z.number().int().min(0).max(60).nullable(),
              rating: z.number().int().min(1).max(5).nullable(),
            })
            .strict(),
          args.input,
        );
        await fleet.updateDeliveryProfile(
          id(args.id),
          input.experienceYears,
          input.rating,
        );
        return { ok: true };
      }
      case "updateStaffPartnerDuty": {
        const input = parse(
          z
            .object({
              onDuty: z.boolean(),
              zones: z.array(z.string().trim().min(1).max(60)).max(20),
            })
            .strict(),
          args.input,
        );
        await fleet.updateDispatchSettings(
          id(args.id),
          input.onDuty,
          input.zones,
        );
        return { ok: true };
      }
      case "assignStaffPartner": {
        const input = parse(
          z.object({ personId: z.uuid() }).strict(),
          args.input,
        );
        await fleet.assignDeliveryPerson(id(args.id), input.personId);
        return getOrder(id(args.id), null);
      }
      case "assignSuggestedStaffPartner": {
        const key = id(args.id),
          person = await fleet.suggestedDeliveryPerson(key);
        await fleet.assignDeliveryPerson(key, person.id);
        return getOrder(key, null);
      }
      case "dispatchStaffOrder":
        await fleet.dispatchFleetDelivery(id(args.id));
        return getOrder(id(args.id), null);
      case "completeStaffDelivery":
        await fleet.completeFleetDelivery(id(args.id));
        return getOrder(id(args.id), null);
      case "returnStaffDeliveryToStore":
        await fleet.cancelFleetDispatch(id(args.id));
        return getOrder(id(args.id), null);
      case "staffMe":
        return {
          role: context.role,
          settings: (await growth.settings()).settings,
        };
      case "staffSettings":
        return growth.settings();
      case "saveStaffSettings": {
        const input = parse(
          z
            .object({
              settings: StoreSettings,
              version: z.number().int().positive(),
            })
            .strict(),
          args.input,
        );
        return growth.updateSettings(
          context.actor,
          input.settings,
          input.version,
        );
      }
      case "staffRoles":
        return {
          items: await growth.staffList(),
          activity:
            await db.$queryRaw`SELECT actor,action,details,created_at AS "createdAt" FROM store_admin_activity ORDER BY created_at DESC LIMIT 30`,
        };
      case "saveStaffRole": {
        const input = parse(
          z
            .object({
              principal: z.string().trim().min(3).max(254),
              role: StaffRole,
            })
            .strict(),
          args.input,
        );
        await growth.setStaffRole(
          context.actor,
          input.principal.toLowerCase(),
          input.role,
        );
        return { items: await growth.staffList() };
      }
      case "staffCartRecovery":
        return growth.recoverySummary();
      case "staffSupportTickets":
        return { items: await growth.tickets(null) };
      case "replyStaffSupportTicket": {
        const input = parse(TicketReply, args.input);
        return {
          items: await growth.replyTicket(
            id(args.id),
            null,
            input.message,
            input.status,
            context.actor,
          ),
        };
      }
      case "staffSalesTargets":
        return growth.targets();
      case "saveStaffSalesTarget": {
        const input = parse(
          z
            .object({
              period: z.enum(["week", "month"]),
              amount: z.number().int().positive().max(1000000000000),
              version: z.number().int().nonnegative(),
            })
            .strict(),
          args.input,
        );
        return growth.saveTarget(
          context.actor,
          input.period,
          input.amount,
          input.version,
        );
      }
      case "staffProfitReport": {
        const r = range(args, 30, [7, 15, 30, 90]);
        return profit.profitReport(
          r.days,
          r.custom,
          parse(z.boolean(), args.simulated ?? false),
          parse(z.boolean(), args.estimateMissingCosts ?? true),
        );
      }
      case "staffProductCosts":
        return {
          items: await profit.productCosts(
            parse(z.string().max(100), args.search ?? ""),
          ),
        };
      case "saveStaffProductCost": {
        const input = parse(
          z
            .object({
              productId: z.uuid(),
              unitCost: z.number().int().min(0).max(100000000),
              effectiveOn: z.string(),
            })
            .strict(),
          args.input,
        );
        day(input.effectiveOn);
        await profit.saveProductCost(
          input.productId,
          input.unitCost,
          input.effectiveOn,
          context.actor,
        );
        return { saved: true };
      }
      case "addStaffExpense": {
        const input = parse(
          z
            .object({
              id: z.uuid(),
              day: z.string(),
              amount: z.number().int().min(1).max(100000000),
              label: z.string().trim().min(1).max(120),
            })
            .strict(),
          args.input,
        );
        day(input.day);
        await profit.addProfitExpense(
          input.id,
          input.day,
          input.amount,
          input.label,
          context.actor,
        );
        return { saved: true };
      }
      default:
        throw new StoreError(404, "NOT_FOUND", "Unknown staff operation.");
    }
  } catch (error) {
    if (error instanceof RangeError)
      throw new StoreError(400, "INVALID_INPUT", error.message);
    throw error;
  }
}
