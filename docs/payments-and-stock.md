# More products, payments, and stock charts

## Install

Stop the running development command with Ctrl+C. In the training2 Dev Container:

```bash
cd /workspaces/training2
node expand-store.cjs
```

The installer backs up the changed files, applies only additive migration 007,
adds up to 48 new products (12 in each category), generates Prisma from PostgreSQL,
runs type checks/tests/builds, and starts the four apps. Repeating it does not
duplicate the sample products. Existing products, prices and orders are preserved.
Deleted example products are not silently recreated on a later run.

Cash on Delivery works immediately. For a later normal start:

```bash
pnpm -r --parallel --filter './apps/*' run dev
```

## Cards, UPI QR and PayPay QR

This build integrates **test/sandbox payments only**. Cash on Delivery is a real
order workflow with an unpaid amount; it does not simulate a successful online charge.
Razorpay supports INR checkout through its Standard Checkout UI. Cards, UPI QR,
UPI intent, netbanking and other methods depend on the merchant's enabled methods
and provider availability. No card number, CVV, UPI PIN or wallet credential is
handled or stored by this application. Japan's PayPay QR uses a separate PayPay
sandbox merchant account; a Razorpay account alone cannot enable PayPay.

After obtaining your own merchant sandbox accounts, stop the current app command
and run:

```bash
bash start-payments.sh
```

Choose 1 for Razorpay, 2 for PayPay, or 3 for both. Enter the keys in that terminal;
secrets are hidden and kept in the child process environment. No .env file is read
or written. Do not paste credentials into chat or put them in frontend source.
The application explicitly rejects Razorpay live keys and sends PayPay requests
only to PayPay's sandbox host. Merchant activation/KYC and production rollout are
separate from this local training update.

Razorpay callback signatures are checked server-side against the saved provider
order ID. The backend retrieves the payment and verifies amount, currency and
capture status before marking an order paid. Configure the Razorpay test webhook
at a reachable HTTPS endpoint forwarding to `/payments/razorpay/webhook`; use your
chosen webhook secret in the launcher. Events `payment.authorized` and
`payment.captured` are handled. Webhooks validate the untouched request body.
For local development without incoming public webhooks, callback verification and
the reconciliation worker recover successful payments by querying the provider.

PayPay uses signed OPA requests to create a real sandbox QR checkout page. The
customer follows the PayPay page and returns to the saved order. The backend
checks the authenticated payment API; the return URL is never proof of payment.
The worker also checks saved payments while the app is running. PayPay merchant
onboarding, permitted client IP addresses and sandbox-app access must be configured
with PayPay. Public return URLs can be set using the `SHOP_ORIGIN` process variable;
the default is `http://localhost:5173`.

## JPY and INR

The existing catalog and historical receipts remain priced in JPY. New product
cards show a reference INR price when a current quote is available. At checkout,
the customer explicitly chooses the payment method and currency: Razorpay uses
INR; PayPay uses JPY; Cash on Delivery can use either. The exact amount and currency
are saved with the order. INR uses paise (100 paise per rupee), while JPY uses whole yen.

The server derives JPY-to-INR from the ECB's daily EUR reference rates and caches
the quote for one hour. It rejects stale or unavailable quotes instead of silently
inventing an exchange rate. An optional merchant-configured reference quote may
be supplied using `SHOP_JPY_TO_INR` and `SHOP_FX_DATE` process variables. Conversion
and expected totals are rechecked before creating a payment. The saved PDF shows
the original JPY order total, selected payment amount/currency, FX date/rate, and
whether it is paid or due on delivery. The existing estimated 10% training charge
is retained; this document is an order receipt, not a tax invoice.

## Stock and payment states

Cash-on-delivery confirmation reduces available stock once and records `due`.
Staff use **Orders → Record cash collected** after actually collecting it. That
action records collection without changing stock again. A collected cash order
requires a manual cash-refund arrangement with staff; the customer cannot silently
cancel it as if no money had been collected.

Online checkout reserves stock before opening the provider. Payment confirmation
does not subtract it a second time. Failed or closed payment windows leave a saved
pending order that can be resumed or cancelled from Your orders. PayPay expiry
returns reserved stock. Online cancellations request provider refunds after a
captured payment; stock returns only after the refund is confirmed. A late payment
on a cancelled reservation is refunded instead of fulfilling an unreserved order.
Razorpay cancelled attempts are also recovered by signed webhooks; the worker
rechecks recent cancelled attempts. Refunds may remain pending with the provider.
Do not shut down the server while expecting background reconciliation to run.

The reconciliation worker runs every minute, at most ten saved attempts per pass.
The UI checks stock every four seconds while visible; **Check payment** queries
the provider immediately. Payment-specific APIs enforce customer ownership. The
old order-confirmation endpoint cannot bypass payment verification for online orders.

## Stock charts

Staff Overview, Inventory and Stock activity include:

- Current available stock and units added/removed in the selected period.
- Daily stock-in and stock-out bars for 7 or 30 days.
- Closing-stock trend reconstructed from recorded events.
- Current stock by product, with a product selector.

Purchases, online reservations, cancellations, confirmed refunds, staff adjustments,
new product stock and the catalog expansion write inventory events. Past activity
that predates event recording cannot be reconstructed accurately; the chart says so.
The chart uses database day boundaries. No historical sales or stock movements are
fabricated in the installed project.

## Verification and limits

Local TypeScript checks, native Node syntax checks, frontend production builds,
database-backed isolated checks and browser layout checks were performed. Gateway
responses were mocked for automated tests. No real charge was sent and no merchant
key was available for a full provider sandbox transaction. The installer runs the
project's integration tests against the configured Dev Container services.

Official integration references:

- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- https://razorpay.com/docs/payments/payment-methods/upi/
- https://razorpay.com/docs/webhooks/validate-test/
- https://www.paypay.ne.jp/opa/doc/v1.0/dynamicqrcode
- https://www.paypay.ne.jp/opa/doc/v1.0/api_authorization.html
- https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
