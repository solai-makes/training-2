# Product photos

Staff → Inventory → Add product or Edit → Product photo. Upload a JPEG, PNG or WebP (up to 10 MB), preview, rotate, replace or remove it, then save. Cancel discards photo changes. Existing products keep their illustrations until staff adds a photo.

Images are resized locally to at most 1200 pixels and saved as JPEG (transparency becomes white, metadata is removed). Each product/variant can have one photo. The database stores photos atomically with product changes; photos survive development server and container restarts when the existing database volume is retained. Back up the database to preserve them. Public image URLs contain a content hash and update when the image changes. Never upload private documents or customer information as a product photo.

Initial setup in the Dev Container: node apps/private-api/src/setup-product-images.ts. This additive migration preserves all existing products, stock and orders.
