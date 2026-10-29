# Staff product categories and offers

Open the staff workspace at http://localhost:5174/, go to Inventory, and use Add product or Edit.

* Product category: choose Tech & audio, Home & living, Everyday carry, or Wellness. The saved choice takes priority over category guesses from the product name.
* Regular price (JPY): enter the price before the offer and before checkout tax.
* Offer discount (%): enter a whole number from 0 to 100. Zero removes the offer. The customer unit-price preview updates as you type.
* Example: regular price JPY 10,000 with a 20% offer becomes JPY 8,000 before checkout tax. Yen amounts are rounded to the nearest whole yen.

Saving applies the selected category and selling price to the shop and future purchases. The product card and details show the percentage badge and crossed-out regular price when an offer is active. Existing confirmed-order receipts retain their original prices.

When reopening an existing offer, the form shows its regular price and percentage, so editing it does not compound the discount. Existing sample launch offers are recognized. Setting the percentage to zero restores the regular price.

The API validates category, price and percentage and calculates the selling price server-side. Staff authorization and stale-edit protection remain in place. A 100% offer creates a free item; a completely zero-value cart can be confirmed using Cash on Delivery without collecting money. Online providers do not accept a zero-value charge.

This update uses the existing category/offer metadata format and needs no database migration, catalog expansion or reset. Descriptions shown in the customer shop and staff editor hide those metadata tags.
