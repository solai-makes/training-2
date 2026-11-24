import { extendSchema } from "postgraphile/utils";
import { GraphQLError } from "postgraphile/graphql";
import { staffOperations } from "../../../packages/api-contracts/src/staff-graphql.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
import {
  executeStaffOperation,
  type StaffContext,
} from "./staff-operations.ts";
const definitions = `
 type StaffSuccess {ok:Boolean!}
 type StaffSaved {saved:Boolean!}
 type StaffProduct {id:ID! code:String! name:String! description:String! category:String price:Float! stock:Int! basePrice:Float discountPercent:Int createdAt:String! updatedAt:String! imageUrl:String}
 type StaffReceiptItem {id:ID productId:ID code:String name:String quantity:Int unitPrice:Float lineTotal:Float}
 type StaffOrder {id:ID! status:String! createdAt:String! updatedAt:String! receipt:JSON gateway:JSON items:[StaffReceiptItem!]!}
 type StaffOrderPage {items:[StaffOrder!]! total:Int! page:Int pageSize:Int}
 type StaffPartner {id:ID! name:String! code:String! sample:Boolean! experienceYears:Int rating:Int onDuty:Boolean zones:[String!] dispatchState:String orderId:ID}
 type StaffPartnerPage {items:[StaffPartner!]!}
 input StaffProductInput {name:String! description:String category:String discountPercent:Int offerStartsAt:String offerEndsAt:String price:Int! stock:Int! imageData:String expectedUpdatedAt:String}
 input StaffStockInput {delta:Int! reason:String!}
 input StaffTrackingInput {stage:String!}
 input StaffVariantInput {label:String! color:String size:String price:Int! stock:Int!}
 input StaffReturnInput {action:String! note:String restock:Boolean}
 input StaffRefundInput {cashRefundConfirmed:Boolean}
 input StaffPartnerInput {name:String!}
 input StaffPartnerProfileInput {experienceYears:Int rating:Int}
 input StaffPartnerDutyInput {onDuty:Boolean! zones:[String!]!}
 input StaffAssignmentInput {personId:ID!}
 input StaffSettingsInput {name:String tagline:String supportEmail:String supportPhone:String businessHours:String announcement:String returnPolicy:String loyaltyEnabled:Boolean loyaltyEarnEvery:Int loyaltyYenPerPoint:Int loyaltyMaxPercent:Int}
 input StaffSettingsVersionInput {settings:StaffSettingsInput! version:Int!}
 input StaffRoleInput {principal:String! role:String!}
 input StaffReplyInput {message:String! status:String}
 input StaffTargetInput {period:String! amount:Float! version:Int!}
 input StaffCostInput {productId:ID! unitCost:Int! effectiveOn:String!}
 input StaffExpenseInput {id:ID! day:String! amount:Int! label:String!}
`;
function fields(kind: "query" | "mutation") {
  return staffOperations
    .filter((op) => op.kind === kind)
    .map(
      (op) =>
        op.name +
        (Object.keys(op.args).length
          ? "(" +
            Object.entries(op.args)
              .map(([key, type]) => key + ":" + type)
              .join(",") +
            ")"
          : "") +
        ":" +
        op.result,
    )
    .join("\n");
}
function resolvers(kind: "query" | "mutation") {
  return Object.fromEntries(
    staffOperations
      .filter((op) => op.kind === kind)
      .map((op) => [
        op.name,
        async (
          _source: unknown,
          args: Record<string, unknown>,
          context: { staff?: StaffContext },
        ) => {
          if (!context.staff)
            throw new GraphQLError("Please sign in.", {
              extensions: { code: "UNAUTHENTICATED", status: 401 },
            });
          try {
            const result = await executeStaffOperation(
              op.name,
              args,
              context.staff,
            );
            return result === undefined
              ? null
              : JSON.parse(JSON.stringify(result));
          } catch (error) {
            if (error instanceof StoreError)
              throw new GraphQLError(error.message, {
                extensions: { code: error.code, status: error.status },
              });
            if (error instanceof RangeError)
              throw new GraphQLError(error.message, {
                extensions: { code: "INVALID_INPUT", status: 400 },
              });
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "P2003"
            )
              throw new GraphQLError(
                "This record is referenced by another record.",
                { extensions: { code: "CONFLICT", status: 409 } },
              );
            throw new GraphQLError("The request could not be completed.", {
              extensions: { code: "INTERNAL_ERROR", status: 500 },
            });
          }
        },
      ]),
  );
}
export const StaffOperationsPlugin = extendSchema(() => ({
  typeDefs:
    definitions +
    "\nextend type Query {\n" +
    fields("query") +
    "\n}\nextend type Mutation {\n" +
    fields("mutation") +
    "\n}",
  resolvers: { Query: resolvers("query"), Mutation: resolvers("mutation") },
}));
