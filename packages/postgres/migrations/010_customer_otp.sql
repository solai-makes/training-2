CREATE TABLE store_customer_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 channel text NOT NULL CHECK(channel IN ('email','sms')),
 identifier text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 verified_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel,identifier)
);
CREATE TABLE store_customer_sessions (
 token_hash text PRIMARY KEY,
 customer_id text NOT NULL,
 name text NOT NULL,
 guest boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_customer_sessions_expiry ON store_customer_sessions(expires_at);
CREATE TABLE store_otp_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 channel text NOT NULL CHECK(channel IN ('email','sms')),
 identifier text NOT NULL,
 name text NOT NULL,
 provider_sid text,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 consumed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_otp_destination_recent ON store_otp_challenges(channel,identifier,created_at);
CREATE TABLE store_auth_rate_limits (
 bucket text PRIMARY KEY,
 count integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL
);
