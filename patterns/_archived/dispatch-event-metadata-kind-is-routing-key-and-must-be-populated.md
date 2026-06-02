---
triggers: dispatch_event, metadata-kind, dispatch-kind, routing-key, kind-field, dispatch-event-metadata, outcome-routing, fork_id-heuristic, factory_dispatch, fork_spawn, cron_fire, dispatchEventConsumer
status: archived
archived_at: 2026-06-02
archived_reason: Rule routes outcomes for dead fork_spawn + factory_dispatch + cron_fire kinds through dead outcomeInference.js + dispatchEventConsumer pipeline.
superseded_by: scheduler-substrate-unification-spec-2026-06-02.md
---

# dispatch_event.metadata.kind Is the Routing Key for Outcome Inference and Must Be Populated

## Rule

The `dispatch_event.metadata` JSONB column must include a `kind` field on every row. The outcome inferrer (`outcomeInference.js`) routes each dispatch to the correct inference function based on `kind` (`fork_spawn` → `inferForkSpawnOutcome`, `factory_dispatch` → `inferFactoryDispatchOutcome`, `cron_fire` → `inferCronFireOutcome`). When `kind` is absent, the inferrer falls through to a `fork_id`-presence heuristic that incidentally works for most rows but fails silently for cron-fire dispatches and any future dispatch kind.

## Do

- Emit `kind` on every JSONL dispatch event at the producer site:
  - `mcp__forks__spawn_fork` → `kind: 'fork_spawn'`
  - `mcp__factory__start_cc_session` → `kind: 'factory_dispatch'`
  - scheduler cron-fire → `kind: 'cron_fire'`
  - PreToolUse hook warn → `kind: 'hook_warn'`
  - Future kinds (voice chunk, batch, etc.) → author a new `kind` string at the time the dispatch type is added
- Validate at consumer time in `dispatchEventConsumer.js`: if `kind` is absent, log a warning and attempt heuristic inference, but mark the row with `metadata.kind_inferred = true` so downstream consumers know the routing was best-effort
- Add a monitoring query that alerts when `% of dispatch_event rows without kind` exceeds 5% in a rolling 24h window

## Do NOT

- Rely on `fork_id` presence/absence as a proxy for dispatch kind - `fork_id` is a content field, not a routing field; rows with `fork_id = null` are not necessarily cron-fires
- Assume future dispatch kinds will work with the current heuristic - new dispatch surfaces (voice chunks, batch jobs, macro runs) have neither `fork_id` nor `session_id` and fall silently through to the SMS/unverified default
- Leave `kind` as an optional field in the dispatch event schema - it is required for correct outcome routing; treat absence as a schema violation, not a soft default

## Diagnosis

```sql
SELECT COUNT(*) AS total, 
       COUNT(*) FILTER (WHERE metadata->>'kind' IS NOT NULL) AS with_kind,
       COUNT(*) FILTER (WHERE metadata->>'kind' IS NULL) AS without_kind
FROM dispatch_event WHERE ts > NOW() - INTERVAL '7 days';
```

`without_kind` approaching `total` means outcome routing is operating on heuristics rather than explicit routing - classification is best-effort for every dispatched operation.

## Backfill (one-off if rolling out `kind` after the fact)

```sql
-- Heuristic backfill where unambiguous
UPDATE dispatch_event
SET metadata = metadata || '{"kind": "fork_spawn", "kind_inferred": true}'::jsonb
WHERE metadata->>'kind' IS NULL AND metadata->>'fork_id' IS NOT NULL;

UPDATE dispatch_event  
SET metadata = metadata || '{"kind": "factory_dispatch", "kind_inferred": true}'::jsonb
WHERE metadata->>'kind' IS NULL AND metadata->>'session_id' IS NOT NULL;
-- Leave ambiguous rows (hook_warn, cron_fire with no fork_id) as NULL
```

## Origin

Found in Phase G adversarial self-audit 2026-05-08 as critique-05 (`phase-G-audit-2026-05-08`, severity 4, surfacing_failure). Probe of 1,472 dispatch_event rows in the 7-day window: zero rows contained a `kind` field. The architecture document (`decision-quality-self-optimization-architecture.md`) specifies `kind`-based routing at lines describing the `factory_dispatch` vs `fork_spawn` branches; the implementation silently falls through to `fork_id` presence. The 30-row audit sample confirmed 30/30 rows with `dispatch_kind=NULL`. Graduated from Critique node to pattern file 2026-05-12 via fork_mp1drm4m_dbb590 Phase G triage pass.

## Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 outcome model (kind-routing specification)
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` (dispatch-side schema vs architecture-doc seam)
- `~/ecodiaos/src/services/telemetry/outcomeInference.js` (the consumer that compensates with fork_id heuristic - update when kind is populated)
- `~/ecodiaos/src/services/telemetry/dispatchEventConsumer.js` (the producer JSONL→DB consumer - add kind emit here)
