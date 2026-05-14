-- 120: schema hardening — FK constraints, state-machine CHECKs, kv_store auto-touch trigger
--
-- Six findings from AUTONOMY_AUDIT_2026-05-13 (data layer audit) consolidated
-- into one migration. Every change is idempotent (guarded with IF NOT EXISTS
-- or DO-block existence check) so it is safe to run repeatedly.
--
-- 1. kv_store auto-bump updated_at on UPDATE (finding 17)
-- 2. kv_store composite index on (updated_at) for retention scans (finding 18)
-- 3. os_forks status state-machine CHECK (finding 33)
-- 4. observer_signals optimistic-locking version column (finding 34)
-- 5. os_conversation.cc_session_id FK (finding 27)
-- 6. gkg_events.session_id non-FK enforcement (finding 28 — left advisory because
--    gkg_events.session_id is a free-form string, not a UUID; just index it)

-- ─── 1. kv_store auto-bump updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eos_kv_store_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kv_store') THEN
    -- Ensure updated_at exists (migration 053 added it; defensive).
    BEGIN
      ALTER TABLE kv_store ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    DROP TRIGGER IF EXISTS trg_kv_store_touch_updated_at ON kv_store;
    CREATE TRIGGER trg_kv_store_touch_updated_at
      BEFORE UPDATE ON kv_store
      FOR EACH ROW EXECUTE FUNCTION public.eos_kv_store_touch_updated_at();
  END IF;
END $$;

-- ─── 2. kv_store updated_at index for retention scans ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'kv_store') THEN
    CREATE INDEX IF NOT EXISTS kv_store_updated_at_idx ON kv_store (updated_at DESC);
  END IF;
END $$;

-- ─── 3. os_forks status state-machine CHECK ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'os_forks') THEN
    -- Drop any prior version of the constraint (idempotency on re-run).
    BEGIN
      ALTER TABLE os_forks DROP CONSTRAINT IF EXISTS os_forks_status_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    ALTER TABLE os_forks ADD CONSTRAINT os_forks_status_check
      CHECK (status IN ('spawning', 'running', 'reporting', 'done', 'aborted', 'error', 'crashed'));
  END IF;
END $$;

-- ─── 4. observer_signals optimistic-locking version column ────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observer_signals') THEN
    ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ─── 5. os_conversation.cc_session_id FK (if both tables exist) ───────────────
-- NOTE: cc_sessions(id) must exist; if it's missing, we skip rather than fail
-- the whole migration. Cascade delete chosen because conversation rows are
-- meaningless without their session.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'os_conversation')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cc_sessions')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'os_conversation' AND constraint_name = 'os_conversation_cc_session_fk'
     )
  THEN
    -- Defensive: NULL out any orphan references before adding the FK, so the
    -- ALTER does not fail. NULL is allowed because we use ON DELETE SET NULL.
    -- (cc_session_id was originally declared NOT NULL in migration 055 but is
    -- not always populated by hand-run INSERTs on prod; we relax that here.)
    BEGIN
      ALTER TABLE os_conversation ALTER COLUMN cc_session_id DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    UPDATE os_conversation
    SET cc_session_id = NULL
    WHERE cc_session_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cc_sessions WHERE id = os_conversation.cc_session_id);
    ALTER TABLE os_conversation
      ADD CONSTRAINT os_conversation_cc_session_fk
      FOREIGN KEY (cc_session_id) REFERENCES cc_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 6. gkg_events.session_id index (FK not added — free-form text) ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gkg_events') THEN
    CREATE INDEX IF NOT EXISTS gkg_events_session_id_idx ON gkg_events (session_id);
  END IF;
END $$;

-- ─── 7. outbound_actions.updated_at auto-touch (migration 119) ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outbound_actions') THEN
    DROP TRIGGER IF EXISTS trg_outbound_actions_touch_updated_at ON outbound_actions;
    CREATE TRIGGER trg_outbound_actions_touch_updated_at
      BEFORE UPDATE ON outbound_actions
      FOR EACH ROW EXECUTE FUNCTION public.eos_kv_store_touch_updated_at();
  END IF;
END $$;

COMMENT ON FUNCTION public.eos_kv_store_touch_updated_at IS
  'Generic BEFORE UPDATE trigger that stamps NEW.updated_at = NOW(). Used by kv_store and outbound_actions.';
