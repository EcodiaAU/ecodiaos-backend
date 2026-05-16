-- 125: Apple ASN (App Store Server Notifications V2) event log.
--
-- One row per Apple in-app-purchase notification we receive. Idempotency at
-- the table level via the UNIQUE constraint on notification_uuid - even if
-- the kv_store seen-key check were to fail, the unique index keeps Apple's
-- 5-day retry storm from double-recording revenue.
--
-- Weekly-financial-review aggregates Co-Exist subscription revenue from this
-- table. The raw decoded payload + decoded transactionInfo + decoded
-- renewalInfo are persisted so any future reconciliation/audit query can be
-- answered without round-tripping back to Apple.

CREATE TABLE IF NOT EXISTS public.apple_iap_events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_uuid        TEXT NOT NULL UNIQUE,
  notification_type        TEXT NOT NULL,
  subtype                  TEXT,
  bundle_id                TEXT NOT NULL,
  environment              TEXT NOT NULL,        -- 'Production' | 'Sandbox'
  route                    TEXT NOT NULL,        -- A | B | C | D | E | F | G | sandbox | duplicate
  transaction_id           TEXT,
  original_transaction_id  TEXT,
  web_order_line_item_id   TEXT,
  product_id               TEXT,
  price_cents              INTEGER,              -- price in cents of currency (price field / 10)
  currency                 TEXT,                 -- ISO 4217 e.g. AUD
  purchased_at             TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  signed_date              TIMESTAMPTZ,
  raw_payload              JSONB NOT NULL,       -- decoded outer payload (with inner JWTs replaced by decoded objects)
  status_board_row_id      UUID,                 -- nullable backref into status_board for routes that opened one
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apple_iap_events_transaction_id
  ON public.apple_iap_events (transaction_id);

CREATE INDEX IF NOT EXISTS idx_apple_iap_events_original_transaction_id
  ON public.apple_iap_events (original_transaction_id);

CREATE INDEX IF NOT EXISTS idx_apple_iap_events_bundle_created
  ON public.apple_iap_events (bundle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apple_iap_events_type_created
  ON public.apple_iap_events (notification_type, created_at DESC);
