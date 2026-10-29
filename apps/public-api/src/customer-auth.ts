import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { z } from "@hono/zod-openapi";
import { getConnInfo } from "@hono/node-server/conninfo";
import { db } from "../../../packages/prisma/src/index.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
import {
  checkVerification,
  otpConfiguration,
  sendVerification,
} from "./otp-provider.ts";
export const customerAuth = new Hono();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function customerSession(token: string) {
  if (!/^ss_[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db.$queryRaw<
    Array<{ sub: string; name: string; guest: boolean }>
  >`SELECT customer_id AS sub,name,guest FROM store_customer_sessions WHERE token_hash=${hash(token)} AND expires_at>now()`;
  return rows[0] ?? null;
}
async function limit(bucket: string, max: number, seconds: number) {
  const rows = await db.$queryRaw<
    Array<{ count: number }>
  >`INSERT INTO store_auth_rate_limits(bucket,count,expires_at) VALUES(${bucket},1,now()+${seconds}*interval '1 second') ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN store_auth_rate_limits.expires_at<=now() THEN 1 ELSE store_auth_rate_limits.count+1 END,expires_at=CASE WHEN store_auth_rate_limits.expires_at<=now() THEN now()+${seconds}*interval '1 second' ELSE store_auth_rate_limits.expires_at END RETURNING count`;
  if (rows[0].count > max)
    throw new StoreError(
      429,
      "AUTH_RATE_LIMIT",
      "Too many attempts. Please wait before trying again.",
    );
}
async function session(customerId: string, name: string, guest: boolean) {
  const token = "ss_" + randomBytes(32).toString("hex");
  await db.$executeRaw`INSERT INTO store_customer_sessions(token_hash,customer_id,name,guest,expires_at) VALUES(${hash(token)},${customerId},${name},${guest},now()+${guest ? 24 : 168}*interval '1 hour')`;
  return { token, name, guest };
}
customerAuth.get("/config", async (c) => c.json(await otpConfiguration()));
customerAuth.post("/otp/request", async (c) => {
  const input = z
    .object({
      channel: z.enum(["email", "sms"]),
      identifier: z.string().trim().min(3).max(254),
      name: z.string().trim().min(1).max(100),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      "Enter your name and a valid email address or international phone number.",
    );
  const { channel, name } = input.data;
  const identifier =
    channel === "email"
      ? input.data.identifier.toLowerCase()
      : input.data.identifier.replace(/[\s()-]/g, "");
  if (
    channel === "email"
      ? !z.email().safeParse(identifier).success
      : !/^\+[1-9]\d{7,14}$/.test(identifier)
  )
    throw new StoreError(
      400,
      "INVALID_DESTINATION",
      "Use a valid email address or a phone number with country code, such as +919876543210.",
    );
  let ip = "local";
  try {
    ip = getConnInfo(c).remote.address ?? "local";
  } catch {}
  await limit("send-global", 60, 3600);
  await limit("send-ip-" + hash(ip), 20, 3600);
  await limit("send-minute-" + hash(channel + identifier), 1, 60);
  await limit("send-hour-" + hash(channel + identifier), 5, 3600);
  const rows = await db.$queryRaw<
    Array<{ id: string }>
  >`INSERT INTO store_otp_challenges(channel,identifier,name) VALUES(${channel},${identifier},${name}) RETURNING id`;
  const challenge = rows[0].id;
  try {
    const sid = await sendVerification(identifier, channel);
    await db.$executeRaw`UPDATE store_otp_challenges SET provider_sid=${sid} WHERE id=${challenge}::uuid`;
  } catch (failure) {
    await db.$executeRaw`UPDATE store_otp_challenges SET consumed=true WHERE id=${challenge}::uuid`;
    throw failure;
  }
  return c.json({
    challengeId: challenge,
    expiresIn: 600,
    resendAfter: 60,
    message: "Verification code sent. Check your email or phone.",
  });
});
customerAuth.post("/otp/verify", async (c) => {
  const input = z
    .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{4,10}$/) })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    throw new StoreError(
      400,
      "INVALID_CODE",
      "Enter the verification code you received.",
    );
  const { challengeId, code } = input.data;
  // Claim an attempt atomically. A provider-approved challenge is consumed only once below.
  const rows = await db.$queryRaw<
    Array<{
      provider_sid: string;
      channel: string;
      identifier: string;
      name: string;
    }>
  >`UPDATE store_otp_challenges SET attempts=attempts+1 WHERE id=${challengeId}::uuid AND consumed=false AND expires_at>now() AND attempts<5 AND provider_sid IS NOT NULL RETURNING provider_sid,channel,identifier,name`;
  if (!rows.length)
    throw new StoreError(
      400,
      "OTP_EXPIRED",
      "This code expired or has too many attempts. Request a new code.",
    );
  const row = rows[0];
  if (!(await checkVerification(row.provider_sid, code)))
    throw new StoreError(
      400,
      "OTP_INCORRECT",
      "Incorrect or expired code. Please check it and try again.",
    );
  const profile = await db.$transaction(async (tx) => {
    const claimed =
      await tx.$executeRaw`UPDATE store_otp_challenges SET consumed=true WHERE id=${challengeId}::uuid AND consumed=false AND expires_at>now()`;
    if (!claimed)
      throw new StoreError(
        409,
        "OTP_USED",
        "This code was already used. Request a new code.",
      );
    const profiles = await tx.$queryRaw<
      Array<{ id: string; name: string }>
    >`INSERT INTO store_customer_profiles(channel,identifier,name) VALUES(${row.channel},${row.identifier},${row.name}) ON CONFLICT(channel,identifier) DO UPDATE SET verified_at=now() RETURNING id,name`;
    return profiles[0];
  });
  return c.json(await session(profile.id, profile.name, false));
});
customerAuth.post("/guest", async (c) => {
  let ip = "local";
  try {
    ip = getConnInfo(c).remote.address ?? "local";
  } catch {}
  await limit("guest-" + hash(ip), 20, 3600);
  return c.json(
    await session("guest-" + randomBytes(16).toString("hex"), "Guest", true),
  );
});
customerAuth.post("/logout", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.startsWith("ss_"))
    await db.$executeRaw`DELETE FROM store_customer_sessions WHERE token_hash=${hash(token)}`;
  return c.json({ ok: true });
});
customerAuth.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
  const identity = await customerSession(token);
  if (!identity)
    throw new StoreError(401, "UNAUTHENTICATED", "Please sign in.");
  const profiles = await db.$queryRaw<
    Array<{ channel: string; identifier: string }>
  >`SELECT channel,identifier FROM store_customer_profiles WHERE id::text=${identity.sub}`;
  return c.json({
    id: identity.sub,
    name: identity.name,
    guest: identity.guest,
    contact: profiles[0] ?? null,
  });
});

