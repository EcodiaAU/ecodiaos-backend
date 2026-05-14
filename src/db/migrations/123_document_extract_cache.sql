-- 123: document_extract_cache — content-hash-keyed cache for PDF/OCR extracts.
-- AUTONOMY_AUDIT_2026-05-13 §29-30. Reads are idempotent; same content hash
-- returns the same text without re-running parse/OCR.

CREATE TABLE IF NOT EXISTS public.document_extract_cache (
  content_hash  TEXT PRIMARY KEY,
  source_kind   TEXT NOT NULL CHECK (source_kind IN ('pdf', 'image')),
  text          TEXT NOT NULL,
  page_count    INTEGER,
  extracted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_extract_cache_extracted_at_idx
  ON public.document_extract_cache (extracted_at DESC);
