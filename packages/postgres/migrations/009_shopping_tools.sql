-- Additive foundations for price history, independent variant SKUs,
-- customer-owned addresses and whole-order returns.
CREATE TABLE store_product_price_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  price integer NOT NULL CHECK(price >= 0),
  description text NOT NULL,
  reason text NOT NULL
);
CREATE INDEX store_price_history_product_time ON store_product_price_history(product_id,recorded_at,id);
INSERT INTO store_product_price_history(product_id,price,description,reason)
SELECT id,price,description,'Price tracking started' FROM products;
CREATE FUNCTION store_record_product_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO store_product_price_history(product_id,price,description,reason)
    VALUES(NEW.id,NEW.price,NEW.description,'Product created');
  ELSIF NEW.price IS DISTINCT FROM OLD.price OR NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO store_product_price_history(product_id,price,description,reason)
    VALUES(NEW.id,NEW.price,NEW.description,'Price or offer configuration changed');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_product_price_audit AFTER INSERT OR UPDATE OF price,description ON products
FOR EACH ROW EXECUTE FUNCTION store_record_product_price();

CREATE TABLE store_product_variants (
  variant_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT '' CHECK(length(color)<=40),
  size text NOT NULL DEFAULT '' CHECK(length(size)<=40),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(variant_id <> parent_id)
);
CREATE UNIQUE INDEX store_variant_label_unique ON store_product_variants(parent_id,lower(btrim(label)));

CREATE TABLE store_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 40),
  recipient jsonb NOT NULL CHECK(jsonb_typeof(recipient)='object'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX store_addresses_owner ON store_customer_addresses(customer_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX store_addresses_one_default ON store_customer_addresses(customer_id)
WHERE is_default AND deleted_at IS NULL;

CREATE TABLE store_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id text NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 80),
  details text NOT NULL DEFAULT '' CHECK(length(details)<=1000),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','received','refunding','refunded','completed')),
  staff_note text NOT NULL DEFAULT '' CHECK(length(staff_note)<=1000),
  inventory_processed boolean NOT NULL DEFAULT false,
  stock_restocked boolean NOT NULL DEFAULT false,
  refund_amount_jpy bigint NOT NULL DEFAULT 0 CHECK(refund_amount_jpy>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  refunded_at timestamptz,
  CHECK(NOT stock_restocked OR inventory_processed)
);
CREATE INDEX store_returns_owner ON store_returns(customer_id,created_at DESC);
