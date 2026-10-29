import { emailConfigured, sendEmailOtp, checkEmailOtp } from "./email-otp.ts";
import { readFile } from "node:fs/promises";
import { StoreError } from "../../../packages/prisma/src/store.ts";
type Settings = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
};
async function settings(): Promise<Settings> {
  let local: Partial<Settings> = {};
  try {
    local = JSON.parse(
      await readFile(
        new URL("../../../.local/otp-provider.json", import.meta.url),
        "utf8",
      ),
    );
  } catch {}
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? local.accountSid ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? local.authToken ?? "",
    serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID ?? local.serviceSid ?? "",
    emailEnabled:
      process.env.OTP_EMAIL_ENABLED === "1" || local.emailEnabled === true,
    smsEnabled:
      process.env.OTP_SMS_ENABLED === "1" || local.smsEnabled === true,
  };
}
export async function otpConfiguration() {
  const s = await settings();
  const configured =
    /^AC[0-9a-f]{32}$/i.test(s.accountSid) &&
    /^VA[0-9a-f]{32}$/i.test(s.serviceSid) &&
    !!s.authToken;
  return {
    email: await emailConfigured() || configured && s.emailEnabled,
    sms: configured && s.smsEnabled,
  };
}
async function provider(path: string, body: Record<string, string>) {
  const s = await settings();
  let response: Response;
  try {
    response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(s.serviceSid)}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(s.accountSid + ":" + s.authToken).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new StoreError(
      503,
      "OTP_PROVIDER_UNAVAILABLE",
      "The verification service could not be reached. Please try again later.",
    );
  }
  const result = (await response.json().catch(() => null)) as {
    sid?: string;
    status?: string;
  } | null;
  if (!response.ok) {
    if (response.status === 404 && path === "VerificationCheck")
      return { status: "expired" };
    throw new StoreError(
      response.status === 429 ? 429 : 503,
      "OTP_PROVIDER_ERROR",
      "The verification service could not complete this request. Check your destination or try later.",
    );
  }
  return result ?? {};
}
export async function sendVerification(
  identifier: string,
  channel: "email" | "sms",
) {
  if (!(await otpConfiguration())[channel])
    throw new StoreError(
      503,
      "OTP_NOT_CONFIGURED",
      "Real OTP delivery is not configured for this channel yet. Please contact the store owner.",
    );
  if (channel === "email" && await emailConfigured()) return sendEmailOtp(identifier);
  const result = await provider("Verifications", {
    To: identifier,
    Channel: channel,
  });
  if (!result.sid || !/^VE[0-9a-f]{32}$/i.test(result.sid))
    throw new StoreError(
      503,
      "OTP_PROVIDER_ERROR",
      "The verification service did not accept the request.",
    );
  return result.sid;
}
export async function checkVerification(sid: string, code: string) {
  if (sid.startsWith("em1:")) return checkEmailOtp(sid,code);
  return (
    (await provider("VerificationCheck", { VerificationSid: sid, Code: code }))
      .status === "approved"
  );
}
