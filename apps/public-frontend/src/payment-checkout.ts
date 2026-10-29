import { showDemoPayment } from './demo-payment.ts';
import type { Order } from "../../../packages/ui/src/storefront.ts";
type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (error: unknown) => void) => void;
    };
  }
}
let script: Promise<void> | null = null;
async function loadRazorpay() {
  if (window.Razorpay) return;
  if (!script)
    script = new Promise<void>((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = "https://checkout.razorpay.com/v1/checkout.js";
      tag.onload = () => resolve();
      tag.onerror = () => {
        script = null;
        reject(
          new Error(
            "Razorpay could not load. Your saved order is available in Your orders.",
          ),
        );
      };
      document.head.append(tag);
    });
  await script;
  if (!window.Razorpay) throw new Error("Razorpay is unavailable.");
}
export async function launchPayment(
  order: Order,
  verify: (result: RazorpayResult) => Promise<Order>,
): Promise<Order | null> {
  const gateway = order.gateway;
  if (!gateway) return order;
  if(gateway.mode==='demo'){await showDemoPayment(order);return verify({razorpay_order_id:'',razorpay_payment_id:'',razorpay_signature:''});}
  if (gateway.provider === "paypay") {
    if (!gateway.url) throw new Error("PayPay QR is not ready yet.");
    const url = new URL(gateway.url);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".paypay.ne.jp"))
      throw new Error("Invalid PayPay checkout destination.");
    window.location.assign(url.href);
    return null;
  }
  await loadRazorpay();
  return new Promise<Order>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: gateway.keyId,
      amount: gateway.amountMinor,
      currency: gateway.currency,
      name: "Solaistore",
      description: "Solaistore order " + order.id.slice(0, 8),
      order_id: gateway.providerOrderId,
      theme: { color: "#214e3d" },
      handler: (result: RazorpayResult) => {
        void verify(result).then(resolve, reject);
      },
      modal: {
        ondismiss: () =>
          reject(
            new Error(
              "Payment window closed. Resume the saved payment or cancel its stock reservation from Your orders.",
            ),
          ),
      },
    });
    checkout.on("payment.failed", () =>
      reject(
        new Error(
          "The test payment failed. Your saved order can be retried from Your orders.",
        ),
      ),
    );
    checkout.open();
  });
}
