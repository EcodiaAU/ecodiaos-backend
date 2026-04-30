-- Prompt-assembly shadow-mode audit sink.
-- See docs/PROMPT_ASSEMBLY_SPEC.md §7.1.
--
-- Records per-turn comparison between v1 (current osSessionService path)
-- and v2 (promptAssembler.assemble). Under PROMPT_ASSEMBLY_V2=shadow both
-- paths run; v1 output ships to the model; v2 output is diffed against v1
-- and the row is written here. PR 6 flip from shadow → canary → full is
-- gated on 48h of clean rows (zero semantic_equivalent=false).

CREATE TABLE IF NOT EXISTS prompt_assembly_audit (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT,
  v1_bytes INTEGER,
  v2_bytes INTEGER,
  v1_blocks INTEGER,
  v2_blocks INTEGER,
  breakpoint_bytes JSONB,          -- {bp1: 12000, bp2: 3000, bp3: 4500, bp4: 8000}
  semantic_equivalent BOOLEAN,     -- true if concatenate(v2) == v1
  diff_first_divergence INTEGER,   -- byte index of first difference, or null
  mode TEXT NOT NULL,              -- 'shadow' | 'canary' | 'off'
  assembled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prompt_assembly_audit_session_idx
  ON prompt_assembly_audit (session_id, assembled_at DESC);
CREATE INDEX IF NOT EXISTS prompt_assembly_audit_diverged_idx
  ON prompt_assembly_audit (assembled_at DESC)
  WHERE semantic_equivalent = false;
