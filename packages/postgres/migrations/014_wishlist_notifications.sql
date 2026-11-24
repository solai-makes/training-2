CREATE TABLE store_wishlist (
 customer_id text NOT NULL, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(customer_id,product_id)
);
CREATE TABLE store_customer_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id text NOT NULL,
 event_key text NOT NULL, kind text NOT NULL CHECK(kind IN ('order','return','restock')),
 payload jsonb NOT NULL, event_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz, UNIQUE(customer_id,event_key)
);
CREATE INDEX store_notifications_customer_time ON store_customer_notifications(customer_id,event_at DESC);
CREATE INDEX store_notifications_customer_unread ON store_customer_notifications(customer_id) WHERE read_at IS NULL;
