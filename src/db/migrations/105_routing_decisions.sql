-- 104_routing_decisions.sql
-- Persistent log of every capability-router decision so the conductor can
-- tune routing rules from observed corrections after 7d of data.

CREATE TABLE IF NOT EXISTS routing_decisions (
  id             BIGSERIAL PRIMARY KEY,
  session_id     TEXT,
  task_description TEXT NOT NULL,
  intent         TEXT NOT NULL,
  estimated_steps INT NOT NULL,
  parallelisable  BOOLEAN NOT NULL,
  tate_visible   BOOLEAN NOT NULL,
  chosen_route   TEXT NOT NULL,
  rationale      TEXT NOT NULL,
  conductor_overrode BOOLEAN DEFAULT FALSE,
  actual_outcome TEXT,                        -- 'success'|'partial'|'failed' (filled later)
  ts             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS routing_decisions_session_idx ON routing_decisions(session_id, ts DESC);
CREATE INDEX IF NOT EXISTS routing_decisions_route_idx   ON routing_decisions(chosen_route);
