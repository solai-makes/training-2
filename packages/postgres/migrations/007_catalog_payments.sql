-- Additive catalog and sandbox payment support. Existing prices remain in JPY.
CREATE TABLE store_catalog_seeds (
  seed_key text PRIMARY KEY,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL
);
CREATE TABLE store_payments (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  provider text NOT NULL CHECK(provider IN ('cod','razorpay','paypay')),
  state text NOT NULL CHECK(state IN ('pending','paid','due','cancelled','refund_pending','refunded')),
  currency text NOT NULL CHECK(currency IN ('JPY','INR')),
  amount_minor bigint NOT NULL CHECK(amount_minor>=0),
  fx_rate numeric NOT NULL,
  fx_date text NOT NULL,
  provider_order_id text UNIQUE,
  provider_payment_id text UNIQUE,
  provider_url text,
  provider_code_id text,
  reserved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_payments_state_idx ON store_payments(state,updated_at);
