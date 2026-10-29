import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { StoreError } from "../../../packages/prisma/src/store.ts";
export const demoReady = () => process.env.NODE_ENV !== 'production' && process.env.SHOP_DEMO_PAYMENTS !== '0';
export const demoFx = () => ({rate:0.55,date:new Date().toISOString().slice(0,10),source:'Demo rate only — not a live currency quote'});
export type Fx = { rate: number; date: string; source: string };
let cached: Fx | null = null,
  cacheUntil = 0;
export async function exchangeRate(): Promise<Fx> {
  const configured = Number(process.env.SHOP_JPY_TO_INR);
  if (Number.isFinite(configured) && configured > 0)
    return {
      rate: configured,
      date: process.env.SHOP_FX_DATE ?? new Date().toISOString().slice(0, 10),
      source: "Merchant-configured reference rate",
    };
  if (cached && Date.now() < cacheUntil) return cached;
  const response = await fetch(
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("Exchange rate unavailable");
  const xml = await response.text(),
    jpy = Number(xml.match(/currency=['"]JPY['"]\s+rate=['"]([\d.]+)/)?.[1]),
    inr = Number(xml.match(/currency=['"]INR['"]\s+rate=['"]([\d.]+)/)?.[1]),
    date = xml.match(/time=['"]([\d-]+)['"]/)?.[1];
  if (!date || !jpy || !inr || Date.now() - Date.parse(date) > 7 * 86400000)
    throw new Error("No recent exchange-rate quote available");
  cached = { rate: inr / jpy, date, source: "ECB reference rate" };
  cacheUntil = Date.now() + 3600000;
  return cached;
}
export function razorpayReady() {
  return (
    /^rzp_test_/.test(process.env.RAZORPAY_KEY_ID ?? "") &&
    !!process.env.RAZORPAY_KEY_SECRET
  );
}
export function paypayReady() {
  return !!(
    process.env.PAYPAY_API_KEY &&
    process.env.PAYPAY_API_SECRET &&
    process.env.PAYPAY_MERCHANT_ID
  );
}
export async function paymentConfig() {
  let fx: Fx | null = null;
  try {
    fx = await exchangeRate();
  } catch {}
  return {
    mode: "test",
    demo: demoReady(),
    demoFx: demoReady() ? demoFx() : null,
    baseCurrency: "JPY",
    currencies: ["JPY", "INR"],
    fx,
    razorpay: razorpayReady(),
    paypay: paypayReady(),
    cod: true,
  };
}
export async function razorpay(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  if (!razorpayReady())
    throw new StoreError(
      409,
      "GATEWAY_NOT_CONFIGURED",
      "Configure Razorpay test keys locally to use cards or UPI QR.",
    );
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new StoreError(
      409,
      "GATEWAY_ERROR",
      "Razorpay could not complete the request. Your order is saved; retry from Your orders.",
    );
  return result;
}
export function paypayHeaders(
  path: string,
  method: string,
  body: string | undefined,
  now = Math.floor(Date.now() / 1000),
  nonce = randomBytes(8).toString("hex"),
) {
  const contentType =
      body === undefined ? "empty" : "application/json;charset=UTF-8;",
    hash =
      body === undefined
        ? "empty"
        : createHash("md5")
            .update(contentType + body)
            .digest("base64");
  const signature = createHmac("sha256", process.env.PAYPAY_API_SECRET ?? "")
    .update(
      [path.split("?")[0], method, nonce, String(now), contentType, hash].join(
        "\n",
      ),
    )
    .digest("base64");
  return {
    Authorization: `hmac OPA-Auth:${process.env.PAYPAY_API_KEY}:${signature}:${nonce}:${now}:${hash}`,
    "X-ASSUME-MERCHANT": process.env.PAYPAY_MERCHANT_ID ?? "",
    ...(body === undefined ? {} : { "Content-Type": contentType }),
  };
}
export async function paypay(
  path: string,
  method = "GET",
  payload?: unknown,
): Promise<any> {
  if (!paypayReady())
    throw new StoreError(
      409,
      "GATEWAY_NOT_CONFIGURED",
      "Configure PayPay sandbox merchant credentials locally to use PayPay QR.",
    );
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const response = await fetch("https://apigw.sandbox.paypay.ne.jp" + path, {
    method,
    headers: paypayHeaders(path, method, body),
    body,
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (
    !response.ok ||
    !["SUCCESS", "REQUEST_ACCEPTED"].includes(result?.resultInfo?.code)
  )
    throw new StoreError(
      409,
      result?.resultInfo?.code ?? "GATEWAY_ERROR",
      "PayPay could not complete the request. Retry the saved payment from Your orders.",
    );
  return result.data;
}
export function validSignature(
  message: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function shopOrigin() {
  const url = new URL(process.env.SHOP_ORIGIN ?? "http://localhost:5173");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("SHOP_ORIGIN must be HTTPS or localhost");
  return url.origin;
}
