import type { Product, Receipt, Recipient } from "./storefront.ts";
import { money } from "./storefront.ts";
export type Requester = (
  path: string,
  options?: RequestInit,
) => Promise<unknown>;
export type SavedAddress = {
  id: string;
  label: string;
  recipient: Recipient;
  isDefault: boolean;
};
export type ReturnRecord = {
  id: string;
  orderId: string;
  reason: string;
  details: string;
  status: string;
  staffNote: string;
  inventoryProcessed: boolean;
  stockRestocked: boolean;
  refundAmountJPY: number;
  createdAt: string;
  updatedAt: string;
  receipt: Omit<Receipt, "orderId" | "status">;
  paymentState: string | null;
  provider: string | null;
};
export type ReturnableOrder = {
  id: string;
  receipt: Omit<Receipt, "orderId" | "status">;
};
export type PricePoint = {
  at: string;
  regular: number;
  selling: number;
  reason: string;
};
export type PriceReport = {
  product: Product;
  days: number;
  trackingStartedAt: string | null;
  generatedAt: string;
  points: PricePoint[];
};
export const returnLabel = (status: string) =>
  ({
    requested: "Awaiting review",
    approved: "Approved — send items back",
    rejected: "Request declined",
    received: "Items received",
    refunding: "Refund processing",
    refunded: "Refund completed",
    completed: "Completed — no payment collected",
  })[status] ?? status;

export const refundAmountLabel = (item: ReturnRecord) =>
  item.receipt.payment
    ? money(
        item.receipt.payment.amountMinor /
          (item.receipt.payment.currency === "INR" ? 100 : 1),
        item.receipt.payment.currency,
      )
    : money(item.refundAmountJPY);
