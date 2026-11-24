CREATE TABLE store_product_costs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 unit_cost integer NOT NULL CHECK(unit_cost>=0),
 effective_on date NOT NULL,
 actor text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_product_cost_lookup ON store_product_costs(product_id,effective_on DESC,id DESC);
CREATE TABLE store_profit_expenses (
 id uuid PRIMARY KEY,
 spent_on date NOT NULL,
 amount integer NOT NULL CHECK(amount>0),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 120),
 actor text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
