# Store growth features

Apply `node apps/private-api/src/setup-store-growth.ts` inside the Dev Container. Migration 012 is additive and preserves existing products, customer orders and image data.

## Saved cart recovery

Signed-in non-guest customers save their cart to PostgreSQL after edits. Signing in again restores a saved cart if the local cart is empty; otherwise the customer can restore, merge, or keep the current basket. Restoration uses current prices and clamps quantities to current stock. Saved baskets never reserve stock. Conflicting browser sessions produce a reload prompt rather than silently overwriting each other. Checkout clears the saved basket atomically. Staff → Cart recovery shows up to 100 nonempty saved carts with a pseudonymous customer reference; 30 minutes without changes marks a basket abandoned. No reminder emails or SMS are sent by this feature.

## Loyalty

Default: one point per JPY 100 of paid product value after coupon and loyalty discounts, excluding tax; one point redeems JPY 1, capped at 10% of product value after coupons. Staff → Store settings can change these rules for new orders. Unpaid COD earns no points. Demo payments earn demonstration points. Guest accounts cannot earn or redeem points. Existing purchases are not retroactively awarded points.

Checkout validates and reserves points inside the order transaction. Idempotent checkout retries cannot spend twice. Balances are synchronized against saved payment/order/return state on rewards reads and before redemption. Cancelled/refunded orders return spent points and reverse earned points; a return received by staff removes earned points while redeemed points remain reserved until the order/refund closes. Refund reversals can make a balance negative if points were already spent; available points stay at zero until future earnings cover that adjustment. Cash refund records do not transfer money. Discounts are reflected in the saved receipt and PDF. Tiers: Member, Silver at 1,000 earned points, Gold at 5,000, Platinum at 10,000; refunded earnings do not count toward a tier.

## Staff roles

Identity-provider administrator group members retain administrator access. Only administrators can assign roles or edit store settings. Assign a role to an existing Cognito username/email; this does not create credentials or change the identity provider. Manager: catalog, orders, refunds, analytics, support, targets and saved cart reporting. Inventory: products and stock. Orders: order handling, returns and support, excluding refunds. Support: tickets and read-only orders. Disabled: no staff access. Permission checks run on every API request, not only in the browser menu. Verified customer OTP sessions cannot access the staff API. Assigned staff accounts cannot use customer checkout routes.

## Support

Customers use Customer support to create a ticket, optionally linked to one of their own orders, and read/reply to the conversation. Staff with support permission reply and mark tickets open, in progress or resolved. Customer replies reopen resolved tickets. Access is owner-bound; customers cannot read other customers' tickets. Limits: 10 new tickets per customer per day and 100 messages per ticket. Replies are in-app; no email notifications are sent automatically. Guest conversations expire from reach when their guest session expires; a verified account is recommended for lasting access.

## Sales targets and settings

Staff → Sales targets uses Monday-based calendar weeks and calendar months in Asia/Tokyo. Progress measures confirmed order receipt totals in JPY, includes demo orders and unpaid COD, and excludes closed cancelled/refunded orders. It is not profit or cash collected. Target and settings edits use version checks to prevent unnoticed concurrent overwrites. Administration changes are recorded in a history table.

Store settings changes the public name, tagline, announcement, support contact information, business hours, return-policy text and loyalty rules. Payment/OTP secrets, tax rates and currencies are deliberately not editable here. A policy text edit does not change the existing return eligibility logic; keep it consistent with the 30-day workflow. Back up PostgreSQL to preserve carts, points, support history, targets, settings and roles.
