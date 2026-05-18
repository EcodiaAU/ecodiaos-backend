-- 2026-05-18: pending_marketing_artifacts - producer-loop substrate for marketing posts.
--
-- The cron-must-be-registered audit (backend/patterns/cron-must-be-registered-
-- not-just-documented-2026-05-18.md) surfaced that `marketing-outreach` and
-- the Monday-10:00 weekly post-batch fire symbolically: there is no draft
-- queue downstream of either cron, so even when they fire they leave no
-- artefact a human or scheduler can act on.
--
-- This table is the missing producer queue. Every marketing fire (outreach-
-- engine LinkedIn draft, marketing-outreach LinkedIn post draft, Monday
-- weekly batch, pattern-of-week, opportunistic ship) writes here with
-- status='drafted'. The cadence monitor reads `published_at IS NOT NULL`
-- rows to compute days-since-last-post per channel. Tate's review path is
-- status='tate_review'. Zernio publishing flips status='published' and
-- stamps zernio_post_id.
--
-- Idempotent via IF NOT EXISTS. The CHECK constraints on channel + kind +
-- status are intentionally strict - schema-level enforcement of the post
-- primitives doctrine (backend/patterns/marketing-post-primitives-and-
-- generation-doctrine-2026-05-16.md).

CREATE TABLE IF NOT EXISTS pending_marketing_artifacts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         text          NOT NULL CHECK (channel IN (
                                  'linkedin','instagram','facebook','x',
                                  'tiktok','youtube','threads','bluesky',
                                  'reddit','pinterest','newsletter','blog'
                                )),
  kind            text          NOT NULL,            -- 'post' | 'carousel' | 'reel' | 'story' | 'long_form'
  title           text,
  body            text          NOT NULL,
  media_urls      jsonb         NOT NULL DEFAULT '[]'::jsonb,
  metadata        jsonb         NOT NULL DEFAULT '{}'::jsonb,
  status          text          NOT NULL DEFAULT 'drafted' CHECK (status IN (
                                  'drafted','tate_review','approved',
                                  'published','rejected','expired'
                                )),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  zernio_post_id  text,
  source_cron     text,         -- 'outreach-engine' | 'marketing-outreach' | 'monday-batch' | 'pattern-of-week'
  source_pattern  text,         -- pattern slug if derived from one
  created_at      timestamptz   NOT NULL DEFAULT NOW(),
  updated_at      timestamptz   NOT NULL DEFAULT NOW()
);

-- Hot path: cadence monitor + Tate review queue scan pending rows.
CREATE INDEX IF NOT EXISTS idx_pma_status
  ON pending_marketing_artifacts (status, scheduled_for)
  WHERE status IN ('drafted','tate_review','approved');

-- Hot path: cadence monitor groups by channel and reads most recent published_at.
CREATE INDEX IF NOT EXISTS idx_pma_channel
  ON pending_marketing_artifacts (channel, published_at);
