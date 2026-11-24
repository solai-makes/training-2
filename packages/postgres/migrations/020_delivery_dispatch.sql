ALTER TABLE store_delivery_people ADD COLUMN on_duty boolean NOT NULL DEFAULT true, ADD COLUMN zones text[] NOT NULL DEFAULT '{}';
ALTER TABLE store_delivery_people ADD CONSTRAINT delivery_zones_limit CHECK(cardinality(zones)<=20);
