---
triggers: dispatch_event_id, episode_resurface_event, dispatch-fk-null, dispatch-event-id, foreign-key-null, producer-insertion, resurface-event, layer-7, episode-resurface, dispatch-event-id-wiring
status: active
---

# dispatch_event_id Must Be Wired at ALL Producer Insertion Sites

## Rule

Any telemetry event table that carries a `dispatch_event_id` foreign key MUST receive a non-null value at INSERT time. A schema column that exists but is never populated is permanently broken regardless of how many rows are produced. The join chain it enables (`event.dispatch_event_id → dispatch_event.id → outcome_event.dispatch_event_id`) is the architecture's primary correlation path - null values in a volume producer make every downstream KPI uncomputable on that event type.

## Do

- Before shipping a producer service, verify the INSERT statement includes `dispatch_event_id` with the actual dispatch context value from the calling stack
- After deploying a new producer, run: `SELECT count(*), count(DISTINCT dispatch_event_id) FROM <event_table> WHERE ts > NOW() - INTERVAL '1 hour'` - the `distinct_dispatches` count must be > 0 within one hour of first production events
- If the producer is called from a context that has no dispatch_event_id, trace up the call stack to find where the dispatch context is available and pass it down, OR look up the most recent dispatch for the current session/fork_id and use that
- Add a NOT NULL constraint or application-level assertion on `dispatch_event_id` for tables where every row MUST have a dispatch context

## Do NOT

- Merge a producer that only writes the row without the dispatch FK on the grounds that "the volume problem is fixed" - schema presence + data absence = permanently broken KPI
- Ship a new event table with a `dispatch_event_id uuid` column and zero documentation on how it should be populated - the schema column is a promise; enforce the promise at write time
- Treat `count(*) > 0` as a sign the producer is healthy - the metric is `count(DISTINCT dispatch_event_id) > 0`; row volume without FK population is write-only noise

## Diagnosis

```sql
SELECT count(*), count(DISTINCT dispatch_event_id) as distinct_dispatches
FROM <event_table>
WHERE ts > NOW() - INTERVAL '24 hours';
```

If `distinct_dispatches = 0` but `count(*) > 0`, the column is orphaned. If `distinct_dispatches > 0`, at least some rows are correctly linked.

## Protocol (when dispatch_event_id is always NULL on a volume producer)

1. Find the INSERT statement in the producer service (e.g. `src/services/episodeResurface.js`)
2. Audit the calling context - does the caller have access to a `dispatch_event_id`? If not, trace up to the dispatch initiator (fork-spawn, cron-fire, os-session message handler)
3. Pass `dispatch_event_id` as a parameter down the call chain from the initiator to the producer
4. If the call chain is too deep, store the current dispatch context in a request-scoped variable (e.g. `AsyncLocalStorage`) accessible from the producer
5. Validate: after deploy, run the diagnostic query - `distinct_dispatches` must be > 0 on new rows within 1h of the fix landing

## Origin

Found in Phase G adversarial self-audit 2026-05-11 as critique-01 (`phase-G-audit-2026-05-11/critique-01-layer7-resurface-dispatch-fk-null`). The `episode_resurface_event` table had 567 rows (all volume correct) but `count(DISTINCT dispatch_event_id) = 0` across every row. The producer service `src/services/episodeResurface.js` was wired after the 05-08 audit found zero rows (the volume problem was fixed), but the FK population was never implemented - so all 567 rows are orphaned and Layer 7's primary KPI ("repeated-failure-after-resurface rate") is permanently uncomputable. Graduated from Critique node to pattern file 2026-05-12 via fork_mp1drm4m_dbb590 Phase G triage pass.

## Cross-refs

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 7 (episode_resurface_event specification and the KPI it feeds)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (layer 3: bridge - is the FK being passed through the call chain?)
- `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` (volume rows without FK = activated producer with dark correlation path)
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` (verify via `count(DISTINCT dispatch_event_id)`, not by reading producer logs)
