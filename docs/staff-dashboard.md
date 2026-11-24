# Staff dashboard updates

- Revenue charts reserve a measured gutter for full JPY axis labels. Data points and currency labels occupy separate columns. The hover readout stays above the plot so it cannot cover the graph. Formatting is cached for longer ranges.
- Donut segments and legend dots share the same blue/slate CSS colours in both themes.
- Review opens the selected product editor. Restock opens that product's stock-adjustment form. Stock changes still require submitting the form and catalog editing permission.
- Profit reports default to a 25% estimated margin only when a purchase cost is missing. For example, net product revenue of JPY 1,000 uses an estimated cost of JPY 750 and gross profit of JPY 250. Discounts and loyalty are included before this estimate, and recorded operating expenses are deducted afterwards. Estimates round to whole yen.
- Saved costs, including an explicit zero cost, take priority. Cost effective dates, refund/restock behavior, expense idempotency and payment-status filters remain active. Estimated rows are labelled.
- Uncheck the 25% estimate option and select Apply to restore saved-costs-only reporting. Missing costs then leave profit incomplete as before. No purchase costs or product prices are overwritten.

Validation: 61 unit tests, isolated profit integration checks, TypeScript checks and builds. Browser automation was unavailable in this session; layout geometry, palette consistency and action callbacks were checked programmatically.
