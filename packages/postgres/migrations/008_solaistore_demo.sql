-- Separate fictional payment providers; never reuse real gateway identities.
ALTER TABLE store_payments DROP CONSTRAINT store_payments_provider_check;
ALTER TABLE store_payments ADD CONSTRAINT store_payments_provider_check CHECK(provider IN ('cod','razorpay','paypay','demo_card','demo_qr'));
CREATE TABLE store_catalog_batches(batch_key text PRIMARY KEY,baseline integer NOT NULL,target integer NOT NULL,added integer NOT NULL DEFAULT 0);
