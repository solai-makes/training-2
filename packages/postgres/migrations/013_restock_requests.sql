CREATE TABLE store_restock_requests (
 customer_id text NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 requested_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(customer_id,product_id)
);
CREATE INDEX store_restock_product_idx ON store_restock_requests(product_id,requested_at);
