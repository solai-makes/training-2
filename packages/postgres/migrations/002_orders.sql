CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'cancelled'))
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL,

  CONSTRAINT order_items_quantity_check
    CHECK (quantity > 0),

  CONSTRAINT order_items_order_product_unique
    UNIQUE (order_id, product_id)
);

CREATE INDEX order_items_order_id_idx
  ON order_items(order_id);

CREATE INDEX order_items_product_id_idx
  ON order_items(product_id);