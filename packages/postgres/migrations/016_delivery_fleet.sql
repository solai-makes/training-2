CREATE TABLE store_delivery_people(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),code text NOT NULL UNIQUE,sample boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE store_delivery_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),person_id uuid NOT NULL REFERENCES store_delivery_people(id),order_id uuid NOT NULL REFERENCES orders(id),assigned_at timestamptz NOT NULL DEFAULT now(),released_at timestamptz);
CREATE UNIQUE INDEX delivery_person_active ON store_delivery_assignments(person_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX delivery_order_active ON store_delivery_assignments(order_id) WHERE released_at IS NULL;
INSERT INTO store_delivery_people(name,code,sample) SELECT 'Sample courier '||lpad(n::text,2,'0'),'SAMPLE-'||lpad(n::text,2,'0'),true FROM generate_series(1,30) n;
