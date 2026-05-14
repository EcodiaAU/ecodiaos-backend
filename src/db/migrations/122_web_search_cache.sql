-- 122: web_search_cache — sha256-keyed 24h cache for webSearchService.
--
-- Brave Search free tier = 2k queries/month. Same query hash returns the
-- cached result. AUTONOMY_AUDIT_2026-05-13 §27.

CREATE TABLE IF NOT EXISTS public.web_search_cache (
  query_hash  TEXT PRIMARY KEY,
  query       TEXT NOT NULL,
  result      JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS web_search_cache_fetched_at_idx
  ON public.web_search_cache (fetched_at DESC);
