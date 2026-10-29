# Mini Shop storefront upgrade

This extends the local training project. It does not connect a payment service or
arrange shipping. Checkout records an order and delivery details; no payment is collected.

## Install on the existing project

Stop the running development command with Ctrl+C. From the Dev Container terminal
in `/workspaces/training2`, run the supplied `upgrade-store.cjs` once. It checks the
four app ports, backs up replacement files, installs the existing workspace dependencies,
applies only migration 006, generates Prisma from PostgreSQL, runs type checks and production builds, and
starts the four servers. Do not open a second copy of the development command.

Existing products and orders remain in place. A catalog with no products gets twelve
sample products, including low-stock and out-of-stock examples. An existing catalog
is never replaced or filled with duplicates. Migration 005 is not run by the upgrade.

If the installation stops after replacing files, fix the reported problem and run
the same installer again. It recognizes files it already installed. Backups live
under `.local/store-upgrade-backup-*`. The installer keeps a manifest of newly
created files so code can be restored accurately. Its database migration is additive;
do not drop receipt or audit tables after creating real orders.

To start again after a successful upgrade:

```bash
pnpm -r --parallel --filter './apps/*' run dev
```

Customer shop: http://localhost:5173/ . Staff workspace: http://localhost:5174/ .
Existing local Cognito credentials are unchanged.

## Customer flow

- Browse without signing in; search by name, code or description, filter by category,
  filter available items and sort by name or price. Categories and illustrations are
  inferred from the product name/description. They are not stored product attributes.
- Add items, change quantities or remove them in the cart. Availability is checked
  again on the server during confirmation. Quantity is limited to 1,000 per product
  and 50 different products per order.
- Sign in, enter delivery details, review the estimated 10% training tax and free
  delivery, and confirm. Price and receipt totals come from the server.
- Download a PDF on the confirmation screen or from order history. The PDF is
  rendered locally in the browser from the authenticated, saved receipt. Unicode
  text uses installed system fonts. Pages contain raster text, so PDF text is not
  searchable or selectable. No third-party receipt service receives order details.
- Cancel a pending or confirmed order. A confirmed cancellation returns stock once.
  Cancelled orders do not offer a new receipt download. PDFs already downloaded
  remain historical confirmation documents.

## Staff flow

Overview shows real catalog totals, confirmed order value from saved receipts,
recent orders, a seven-day order chart and stock alerts. The chart uses the database
day boundary. Earlier orders without saved snapshots are excluded from receipt totals.
Inventory supports search, stock filters, pagination, add/edit/delete, and positive
or negative adjustments with reasons. Products referenced by an order cannot be deleted.
An edit checks the last saved timestamp, so a concurrent purchase cannot be silently
overwritten. Stock activity records purchases, confirmed cancellations, adjustments,
and stock changes made in the product editor. Historical stock events before this
upgrade cannot be reconstructed.

Both screens refresh while visible every four seconds and immediately on focus.
Successful local actions refresh immediately. The status indicator reports a failure
instead of pretending old stock is current. Background polling is not a reservation;
the transactional stock check at checkout is authoritative.

## Data and consistency

Migration 006 adds immutable order-detail snapshots, checkout idempotency keys, and
an inventory event log. It does not edit existing migrations or Prisma schema by hand.
Product rows are locked in sorted ID order. Checkout writes an order, its snapshot,
stock changes and its idempotency key in one transaction. Retrying the same key and
payload returns the original order. Reusing that key for a different payload is rejected.
Confirmation/cancellation lock the order row to avoid applying a transition twice.
Customer ownership and staff permissions are checked on the server.

Earlier confirmed orders cannot acquire historically accurate receipts because the
old database did not retain purchase prices. Their receipt button is omitted. Earlier
pending orders receive a saved snapshot when confirmed after this upgrade.

Added routes: customer `POST /checkout`, `GET /orders/:id/receipt`; staff
`GET /store/overview`, `GET /store/orders`, `GET /store/inventory/events`, and
`POST /store/inventory/:id/adjust`. Existing product and order routes remain.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

Run database-backed tests only in the configured Dev Container with Cognito running.
The new tests create temporary records and remove only those records. They verify
checkout retry behavior, saved receipt prices, ownership, exactly-once cancellation,
and two concurrent checkouts competing for the last unit.
