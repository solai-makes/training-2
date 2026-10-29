CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text COLLATE "C" NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer NOT NULL CHECK (price BETWEEN 0 AND 9999999),
  stock integer NOT NULL CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_code_trimmed CHECK (code = btrim(code) AND length(code) > 0),
  CONSTRAINT product_name_trimmed CHECK (name = btrim(name) AND length(name) > 0)
);
