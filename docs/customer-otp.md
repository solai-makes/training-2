# Customer email and phone OTP

The customer login supports real SMS and email OTP through Twilio Verify. It does not generate fake codes or display codes in the app. Existing staff/password sign-in remains available under **Password / staff login**.

## Configure delivery locally

1. Create a Twilio account and a Verify Service. Enable SMS for the destination countries you need. Trial accounts may restrict recipient numbers.
2. For email, configure a verified SendGrid sender and a dynamic email template containing `{{twilio_code}}`. Connect the SendGrid Email Integration to the same Verify Service.
3. In your project create `.local/otp-provider.json` locally. This directory is ignored by Git. Never put these secrets in frontend files or send them in chat.

```json
{
  "accountSid": "AC_your_account_sid",
  "authToken": "your_auth_token",
  "serviceSid": "VA_your_verify_service_sid",
  "smsEnabled": true,
  "emailEnabled": true
}
```

Use the actual Twilio SID strings without underscores or placeholder text. Enable only the channels you have configured. Restrict file access (`chmod 600 .local/otp-provider.json` inside the container). Restart is unnecessary for this file: the backend loads it at request time.

Alternatively inject TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID and OTP_EMAIL_ENABLED=1 / OTP_SMS_ENABLED=1 through your own runtime configuration. No `.env` file is read or edited by this feature.

Official documentation: https://www.twilio.com/docs/verify/email and https://www.twilio.com/docs/verify/api/verification-check

## Behaviour

- Enter name and email or international phone number (for example +91…, +81…). Verification is required before creating or accessing an account.
- Each verified email/phone identity is a separate customer account. Email and phone are not automatically linked to one another or to older password accounts. Never merge accounts without verifying both identities.
- Returning with the same verified identity keeps the same account ID, orders and saved addresses. Manage addresses using **Saved addresses**; logout clears browser identity, not database addresses.
- Guest checkout gets its own random identity and a 24-hour session. It never reuses a registered account. Guest history cannot be recovered after logout; use a registered account for lasting history.
- Verified sessions last seven days. Session tokens are random and only their hashes are stored. Logout revokes the current session.
- Challenges expire in ten minutes, allow five attempts, and are consumed once. Request limits: one per destination per minute, five per hour, 20 per peer IP per hour, 60 overall per hour. Limits also apply before sending paid messages. Reverse proxies share the peer limit unless a trusted deployment-specific proxy policy is added.
- Provider delivery may have SMS/email charges. Real sending remains unavailable until your own provider settings are configured. No live message is sent by automated tests.

## Install schema

From the existing Dev Container:

```bash
cd /workspaces/training2
node apps/private-api/src/setup-customer-otp.ts
bash start-solaistore.sh
```

This adds customer-account tables without modifying existing orders, stock, staff accounts, or saved addresses. Do not run the destructive initial database setup.
