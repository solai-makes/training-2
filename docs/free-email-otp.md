# Free-tier email OTP setup

Email OTP can now be sent directly through Resend, without Twilio verification fees. Resend's own free-plan limits still apply. Phone SMS remains optional and uses the existing Twilio setup.

## First test: only your own inbox, no domain needed

1. Sign up at https://resend.com/signup using the email address you want to test receiving codes on. Complete Resend's email confirmation.
2. Open https://resend.com/api-keys and create an API key with Sending access. Keep this secret locally.
3. In VS Code create `.local/email-otp.json` under the training2 folder. Use:

```json
{
  "apiKey": "PASTE_YOUR_RESEND_KEY_HERE",
  "from": "Solaistore <onboarding@resend.dev>",
  "testRecipient": "YOUR_RESEND_ACCOUNT_EMAIL"
}
```

Replace both placeholders. The actual API key begins with `re_`. The testRecipient must be the exact email associated with your Resend account. Save the file. Do not paste keys into chat, screenshots, frontend source or version control. The `.local` directory is already ignored by Git.

4. In the VS Code Dev Container terminal run:

```bash
cd /workspaces/training2
chmod 600 .local/email-otp.json
curl -s http://localhost:3000/auth/config
```

The email field should be true. This checks local configuration; it does not prove delivery. SMS can remain false.

5. Refresh http://localhost:5173, open Sign in, select Email OTP, enter your name and the same Resend account email, and click Send verification code. Check your inbox and spam folder. Enter the six-digit code. No server restart is needed after saving this config.

## Allow other customers' email addresses

The shared resend.dev sender only permits sending to the email associated with your Resend account. To send to other people:

1. Open https://resend.com/domains and add a domain you control.
2. Add the DNS records Resend specifies through your domain's DNS provider. Wait until Resend marks the domain verified.
3. Change from in the local config to an address on that verified domain, for example `Solaistore <login@yourdomain.com>`. Remove testRecipient or set it to an empty string.

A newly purchased domain may cost money; the email provider's free quota does not include domain registration. No Twilio account is needed for direct Resend emails.

## Troubleshooting

- Button disabled: save valid JSON with the actual key and the from address. With resend.dev, testRecipient is also required. Close and reopen the login dialog or refresh the page.
- Email true but delivery fails: check Resend's email/log dashboard for API-key permissions, verified sender/domain, account approval, quota or recipient restrictions. The app never returns codes in API responses.
- Another person cannot receive a code with onboarding@resend.dev: this is a provider restriction, not an app error. Verify your domain first.
- Wait 60 seconds between requests; codes expire after 10 minutes and allow five attempts. Codes cannot be replayed after a successful sign-in.
- Never enable paid overages merely to test the free allowance.

Official references: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain and https://resend.com/docs/api-reference/emails/send-email
