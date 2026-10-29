import { serve } from "@hono/node-server";
import { app } from "./index.ts";
import { reconcilePendingPayments } from "./payments.ts";
let reconciling = false;
const paymentTimer = setInterval(async () => {
  if (reconciling) return;
  reconciling = true;
  try {
    await reconcilePendingPayments();
  } catch {
    console.error("Payment reconciliation is temporarily unavailable.");
  } finally {
    reconciling = false;
  }
}, 60000);
paymentTimer.unref();

const port = Number(process.env.PUBLIC_API_PORT ?? "3000");

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  },
  () => {
    console.log("public-api listening on port", port);
  },
);
