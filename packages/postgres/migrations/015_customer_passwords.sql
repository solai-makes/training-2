ALTER TABLE store_customer_profiles ALTER COLUMN verified_at DROP NOT NULL;
CREATE TABLE store_customer_passwords (
 customer_id uuid PRIMARY KEY REFERENCES store_customer_profiles(id),
 password_hash text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
