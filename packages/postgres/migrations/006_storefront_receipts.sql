-- Additive storefront upgrade. No existing product or order is removed.
CREATE TABLE store_order_details (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE store_checkout_keys (
  customer_id text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  PRIMARY KEY (customer_id, key)
);
CREATE TABLE store_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  delta integer NOT NULL,
  stock_after integer NOT NULL CHECK (stock_after >= 0),
  reason text NOT NULL,
  actor_id text NOT NULL,
  order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_inventory_events_created_idx ON store_inventory_events(created_at DESC);
