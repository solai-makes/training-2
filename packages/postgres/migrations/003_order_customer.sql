ALTER TABLE orders
ADD COLUMN customer_id text;

CREATE INDEX orders_customer_id_idx
  ON orders(customer_id);