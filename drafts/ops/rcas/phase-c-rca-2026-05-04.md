# Phase C application_event ingestion RCA + fix — 2026-05-04 (fork_moq0ybyf_9e5fa5)

## TL;DR

Layer 4 (consumer) of the Phase C forcing-function pipeline was never built. The hook (Layer 1+2+3) wrote `application-events.jsonl` correctly, but `dispatchEventConsumer.js` only drained `dispatch-events.jsonl` into `dispatch_event` + `surface_event` tables — there was no code path reading `application-events.jsonl` and writing `application_event` rows. The 470 historical rows in `application_event` predate this analysis (max ts 2026-04-30T15:06:00.497Z) and were almost certainly written by a one-shot manual or a since-removed code path; no commit on any branch ever shipped `consumeApplicationEventFile` or `rotateAndConsumeApplicationEvents` despite status_board row 4c9d8b96 ("Phase C shipped") naming both functions in its context. Phase C was specced + partially shipped (hook, JSONL, schema, query reads in `decisionQualityService` + `failureClassifier`) but the JSONL→DB drainage step was never implemented in `dispatchEventConsumer.js`.

Fix: extend `dispatchEventConsumer.js` with `consumeApplicationEventFile` + `rotateAndConsumeApplicationEvents`. `runOnce()` now drains both files in order (dispatch first so app-event FK lookups succeed). Shipped on `origin/main` at commit `54fdb72`. Smoke test confirmed end-to-end ingestion within 30 seconds.

## 5-layer verification table

| Layer | Component | Status | Evidence | Fix shipped? |
|---|---|---|---|---|
| 1 Producer | Conductor / fork emits `[APPLIED]` / `[NOT-APPLIED]` text in brief or tool result | LIVE | This fork's brief and prior fork briefs since 2026-04-30 contain tags; `dispatch-events.jsonl` shows continuous activity with non-empty `surfaces[]` arrays | n/a (not broken) |
| 2 Trigger | PostToolUse hook `post-action-applied-tag-check.sh` fires on `mcp__forks__spawn_fork` / `mcp__factory__start_cc_session` | LIVE | Hook present at `~/ecodiaos/scripts/hooks/post-action-applied-tag-check.sh` (executable, last fix commit 4c24ace), registered in `~/.claude/settings.json` PostToolUse matcher, fresh entries in `application-events.jsonl` as recent as 17:08:28Z (tail at investigation start) | n/a (not broken) |
| 3 Bridge | Hook writes JSONL line to `~/ecodiaos/logs/telemetry/application-events.jsonl` | LIVE | File size 46KB, last entry 17:08:28Z at investigation start, 137 unconsumed lines accumulated since 2026-04-30 silent cutoff | n/a (not broken) |
| 4 Listener | Consumer reads `application-events.jsonl` and inserts `application_event` rows | DARK → LIVE | `dispatchEventConsumer.js` had no `consumeApplicationEventFile` or `application-events.jsonl` reference; `git log --all --pickaxe-regex -S"application-events.jsonl" -- 'src/'` returned zero source-code commits ever; `git log --all --pickaxe-regex -S"INSERT INTO application_event"` returned zero hits across all branches | YES — commit `54fdb72` on `origin/main` |
| 5 Side-effect | `application_event` table receives row | DARK → LIVE | `SELECT max(ts), count(*) FROM application_event` at investigation start returned `2026-04-30T15:06:00.497Z, 470`; after fix + drain returned `2026-05-03T17:09:17.605Z, 606` (+136 backlog rows, zero orphans, zero errors) | YES (downstream of layer 4 fix) |

## Root cause

`dispatchEventConsumer.js` (Phase B Layer 4 of the Decision Quality Architecture) was specced as the JSONL→Postgres drain for both telemetry streams emitted by the hooks:

- `dispatch-events.jsonl` (PreToolUse hooks: brief-consistency-check, cred-mention-surface, anthropic-first-check, episode-resurface, cowork-first-check) → `dispatch_event` + `surface_event` tables
- `application-events.jsonl` (PostToolUse hook: post-action-applied-tag-check) → `application_event` table

Only the dispatch-event drain was implemented. The hook script's docstring explicitly says "The dispatchEventConsumer drains the JSONL into the application_event Postgres table" but the consumer code never had that branch. Status_board row 4c9d8b96 ("Phase C shipped: applied-pattern-tag forcing function", 2026-04-29 18:10 AEST archive) names `consumeApplicationEventFile` + `rotateAndConsumeApplicationEvents` in its context as if they had been written, but `git log --all --pickaxe-regex -S"consumeApplicationEventFile|rotateAndConsumeApplicationEvents"` returns zero hits across all branches. The status_board row was a phantom-shipped record — the spec, hook, schema, and read-side queries shipped, but the write-side consumer extension never landed in code.

Origin status_board row 5b8ef9bd from 2026-05-01 01:20 AEST claimed Phase C ingestion was "resolved" based on a coincidental observation that some app-events were fresh — but those were the 467 rows from 2026-04-29 and 3 from 2026-04-30 that someone or something had written via a code path that no longer exists. Once that one-shot writer (whatever it was) stopped, the table went silent. The 70-hour silence between 2026-04-30T15:06Z and the fix is the duration the un-drained `application-events.jsonl` accumulated unread.

## Fix details

Commit `54fdb72` on `origin/main`. Single-file change to `src/services/telemetry/dispatchEventConsumer.js`:

1. New constant `APPLICATION_EVENT_FILE` (default `~/ecodiaos/logs/telemetry/application-events.jsonl`, env override `ECODIAOS_APPLICATION_EVENT_FILE`).
2. New function `consumeApplicationEventFile(filePath, client)` — parses each JSONL line, resolves `dispatch_event_id` by looking up `dispatch_event` WHERE `ts = matched_dispatch_ts::timestamptz AND tool_name = $2` (with a +/-5min fuzzy fallback for timing skew), then `INSERT INTO application_event`. Per-line try/catch; orphans (no matching dispatch row) are counted and skipped.
3. New function `rotateAndConsumeApplicationEvents()` — same atomic-rename safety as the existing dispatch-event rotation, processes file at `processed/<stamp>-application-events.jsonl`.
4. `runOnce()` now calls both `rotateAndConsume()` then `rotateAndConsumeApplicationEvents()`. Order matters: dispatch_event rows for the current tick must be in DB before app-event FK lookups run.
5. New module exports: `rotateAndConsumeApplicationEvents`, `consumeApplicationEventFile`.

The cron `telemetry-dispatch-consumer` (every 15m, task id `0c28bfbb-7f33-4183-a1a2-a38660485daf`) shells out to `node src/services/telemetry/dispatchEventConsumer.js --once` and picks up the new code on its next tick. No PM2 restart required (consumer is one-shot; no Factory queue active per `cc_sessions WHERE status='running'` returning 0).

## Empirical verification

Pre-fix:
```
SELECT max(ts), count(*) FROM application_event;
→ {"max": "2026-04-30T15:06:00.497Z", "count": 470}
```

After single `--once` run with new code:
```
SELECT max(ts), count(*) FROM application_event;
→ {"max": "2026-05-03T17:09:17.605Z", "count": 606}
```

136 backlog rows drained, zero orphans, zero `lineErrors`. (One additional row hit `last_hour` count of 4 because the drain happened just at the end of the hour window.)

Smoke test (synthetic dispatch + application event written to JSONLs, drained immediately):
```
SELECT max(ts), count(*) FILTER (WHERE reason='phase-c-smoke-test') FROM application_event;
→ {"max": "2026-05-03T17:14:43.000Z", "smoke_rows": 1}
```

End-to-end latency from JSONL append to row landing: under 30 seconds (one-shot drain). On the cron schedule, latency is `0..15min` (cron interval).

## Resolution status

`fixed_54fdb72_smoke_passed`

## Cross-refs

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — 5-layer framework (Producer, Trigger, Bridge, Listener, Side-effect)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 spec (the forcing function)
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` — empirical probe over log-tail inference
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — status_board 4c9d8b96 narrated "shipped" while disk had unimplemented spec
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — the entire forcing-function exists because untagged surfaces are symbolic; tagged + drained = artefact

## Out of scope (intentional)

- Did not author a new pattern. The applicable doctrine (status_board row narrating "shipped" while disk had unimplemented spec) is already covered by `verify-deployed-state-against-narrated-state.md`.
- Did not touch Layers 1, 2, 4, 5, 6, 7 of the Decision Quality architecture — only Layer 3's downstream consumer.
- Did not restart `pm2 ecodia-api` (consumer is one-shot via cron, no API code path touched).
