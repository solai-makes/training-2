# Solaistore update

Inside the VS Code Dev Container, stop the running development servers with Ctrl+C, then run:

```bash
cd /workspaces/training2
node upgrade-solaistore.cjs
```

The installer backs up replaced files under `.local/solaistore-backup-<timestamp>`, installs complete source files, applies additive migration 008, expands the current catalog to five times its initial size once, generates the Prisma client, checks types, runs tests, builds both frontends, and starts the four apps. No `.env` file is read or changed by this update.

Customer shop: http://localhost:5173/ . Staff workspace: http://localhost:5174/ . Existing local customer and staff credentials are unchanged.

Start on another day with:

```bash
cd /workspaces/training2
bash start-solaistore.sh
```

## Demo checkout

Choose **Demo card payment** or **Demo QR payment**, fill in delivery information, and continue to demo payment. Click **Complete demo payment** to simulate success. The card illustration supplies fictional details: 4242 4242 4242 4242, expiry 12/30, CVV 123. These are display-only; there is no real-card input. The QR is a clearly labeled, non-scannable illustration with no payment destination. No gateway account or key is needed for either simulation.

Stock is reserved once when a demo payment order is created. Completion confirms the existing reservation. Cancelling an unpaid order or refunding a completed demo order restores stock once. A closed dialog leaves the order available to resume or cancel from Your orders. Receipts explicitly identify demo payments as **DEMO ONLY - NO MONEY CHARGED**. No bank, card or wallet is charged.

Demo providers have separate identities (`demo_card` / `demo_qr`); a real Razorpay or PayPay order cannot be confirmed through the demo endpoint. Demo mode is unavailable when NODE_ENV=production or SHOP_DEMO_PAYMENTS=0. Real gateway integrations retain their existing sandbox credential requirements. Existing COD remains available.

Demo INR checkout uses a fixed, explicitly fictional rate of 0.55 INR per JPY. It is not a live quote. Gateway INR checkout continues to use the existing reference-rate implementation. Catalog prices and analytics totals remain JPY.

## Language and readability

The language selector offers English, Tamil, Japanese and Simplified Chinese and remembers the selection in each site's browser storage. Core shopping labels, navigation, delivery fields, demo payment dialogs and the new dashboard controls are translated. Product names, customer-entered details, provider errors and some legacy staff explanations remain in English. Product descriptions supplied by this update use translated standard descriptions. Translation does not change prices, identifiers, saved addresses or historical order snapshots.

Small type is increased throughout both apps, controls are larger, layout wraps on smaller screens, and animation honors reduced-motion preferences. The moving banner pauses on hover. Selected **new sample products** have actual half-price catalog values, with their sample reference price crossed out. The existing catalog's prices are unchanged; there is no fabricated countdown or deadline.

## Fivefold catalog expansion

Migration 008 records a single expansion batch. With 60 existing products it adds 240 and produces 300 total, distributed across four categories. Designs include tech/audio, home/living, everyday carry and wellness, in Essential, Signature, Studio and Premium variants. Running the installer again does not multiply the catalog again or restore deleted products. Existing products, stock balances, prices and orders are preserved; only new-product starting stock is added and recorded in inventory events.

## Sales and inventory dashboard

Open **Overview** or **Inventory** in the staff workspace. The new section has a 7-/30-day selector, sales revenue, order count, units sold, current stock, retail stock value, daily revenue line, demo/other sales mix, best sellers, slow movers, and low-stock alerts. Data refreshes every four seconds while the page is active. Existing stock movement charts remain below it.

Sales revenue means JPY value of currently confirmed orders with saved receipt snapshots, including tax. It includes unpaid COD (shown separately) and demo orders (shown separately); it is not bank receipts or profit. Cancelled/refunded orders are excluded. Product ranking values exclude tax. Historical orders without immutable snapshots are excluded. Period comparisons use the previous equal-length period, and the current day is partial. Dates follow the database timezone. A percentage is not invented when the prior period had no sales.

Slow movers are in-stock products with the lowest units sold during the selected period, then the highest stock. This highlights products to review; it does not claim a cause for poor sales. Low stock means five units or fewer. There is no purchase-cost data, so purchase cost, margin and profit are not fabricated. Stock value is current quantity multiplied by retail price.

Click **Download stats PDF** for an A4 PDF with the current selected report's totals, daily revenue chart, best/slow sellers, low-stock alerts, daily figures and metric definitions. It includes its generation time and period. Like the receipt exporter, the PDF uses browser-rendered raster text for Unicode support; text is not selectable. Large catalogs do not cause unlimited PDF rows: product lists show the same top 8 / low-stock top 12 as the screen.

The update does **not** seed historical sales, fabricated purchase costs or fake customer transactions. The screenshots and sample PDF delivered separately used an isolated QA database. Your charts start from your saved orders and respond as you test checkout.

## Startup messages

If Vite reports a proxy connection refusal before the APIs say they are listening, wait for both listening messages. The updated shop retries catalog and payment configuration automatically. A Node deprecation warning is separate from a startup failure. If a port is already in use, stop the existing servers with Ctrl+C before launching another copy.
