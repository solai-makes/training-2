CREATE SEQUENCE product_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE products
ADD COLUMN product_number bigint;

UPDATE products
SET product_number =
  CASE
    WHEN code ~ '^A-[0-9]+$'
      THEN substring(code FROM 3)::bigint
    ELSE nextval('product_code_seq')
  END;

SELECT setval(
  'product_code_seq',
  GREATEST(
    COALESCE((SELECT MAX(product_number) FROM products), 0),
    1
  ),
  true
);

ALTER TABLE products
ALTER COLUMN product_number SET NOT NULL;

ALTER TABLE products
ADD CONSTRAINT products_product_number_unique
UNIQUE (product_number);

ALTER TABLE products
ADD CONSTRAINT products_product_number_positive
CHECK (product_number > 0);

ALTER TABLE products
ALTER COLUMN code DROP NOT NULL;

UPDATE products
SET code = 'A-' || lpad(product_number::text, 2, '0');

ALTER TABLE products
ALTER COLUMN code SET NOT NULL;