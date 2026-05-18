# Routines

Each `.md` in this directory is the prompt body of a Claude Code Routine to be created at `claude.ai/code/routines` per the parallel-work prompt at `D:/.code/EcodiaOS/backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md`.

## How to use

1. Open a routine file (e.g. `meta-loop.md`).
2. Read the YAML frontmatter for: account (which Max 20x to host on), schedule (cron cadence), trigger (schedule | api | github), repos (which to clone), connectors (always at least `ecodia`), permissions (whether unrestricted branch pushes are needed - default no).
3. Sign in to claude.ai on the named account.
4. Visit `https://claude.ai/code/routines` -> New routine.
5. Name = filename without .md.
6. Prompt = the full body BELOW the frontmatter (don't include the frontmatter itself in the prompt - it's for routing context only).
7. Configure schedule + repos + connectors + permissions per the frontmatter.
8. Click Create. Run-now once to verify the first end-to-end run.

## Routines authored in the 2026-05-15 sprint

Phase 0 ship-priority subset (5 of 16):

- `meta-loop.md` - tate@, every 1h - hourly conductor heartbeat
- `email-triage.md` - code@, every 1h - inbox triage + draft-for-Tate-relay
- `parallel-builder.md` - money@, every 2h - dispatch parallelisable work to cowork-pool forks
- `system-health.md` - tate@, every 4h - substrate aliveness + anomaly surface
- `morning-briefing.md` - tate@, daily 09:00 AEST - daily Tate briefing email

## Routines pending authoring

These 11 are part of Phase 0 but were deferred for context budget reasons. They follow the same template - see the 5 above as exemplars.

- `deep-research.md` - tate@, every 3h - long-form research dossier on a status_board topic
- `self-evolution.md` - tate@, every 4h - identify and codify new doctrine from recent Episodes
- `strategic-thinking.md` - tate@, daily 14:00 AEST - revisit the top-5 goals and surface strategic moves
- `inner-life.md` - tate@, every 6h - reflective check-in (calibration not chase per `inner-life-notice-calibration-not-chase-pre-calibration-self.md`)
- `claude-md-reflection.md` - tate@, daily 20:00 AEST - audit CLAUDE.md for staleness, propose edits
- `outreach-engine.md` - code@, every 8h - drive outbound for active opportunities
- `vercel-deploy-monitor.md` - tate@, every 2h - poll Vercel deploys, surface broken builds
- `marketing-outreach.md` - money@, every 72h - marketing pipeline maintenance
- `weekly-financial-review.md` - money@, weekly Mon 10:00 AEST - financial summary + forecast
- `pattern-corpus-health-check.md` - tate@, weekly Sun 21:00 AEST - audit pattern corpus for staleness, broken cross-refs, untriggered patterns
- `daily-index-regen.md` - tate@, daily 22:00 AEST - regenerate `backend/patterns/INDEX.md` from frontmatter triggers across all .md files
- `kg-consolidation.md` - tate@, daily - merge duplicate Neo4j nodes, dedupe canonical entities

Plus the API-trigger routines for webhook ingress:

- `inbound-email-handler.md` - code@, trigger=api - fired by VPS Resend webhook shim
- `stripe-event-handler.md` - money@, trigger=api - fired by VPS Stripe webhook shim
- `vercel-deploy-handler.md` - tate@, trigger=api - fired by VPS Vercel webhook shim (for instant deploy reactions; vercel-deploy-monitor scheduled covers periodic polling)
- `apple-asn-handler.md` - tate@, trigger=api - fired by VPS Apple App Store notifications shim

Plus the Factory replacement:

- `factory-cloud.md` - dedicated 4th account OR money@ extra, trigger=api - fired by `factoryDispatch.js` for code-shipping work that was previously claude -p in the worker pool

## Routine prompt template (use this for the deferred 11)

```yaml
---
account: <tate@ecodia.au | code@ecodia.au | money@ecodia.au>
schedule: <every Nh | every Nm (>=60) | daily HH:MM AEST | weekly DAY HH:MM AEST | "trigger: api" | "trigger: github">
trigger: <schedule | api | github>
repos: EcodiaTate/ecodiaos-backend
connectors: ecodia-core, <plus per-routine: ecodia-comms | ecodia-code | ecodia-money | ecodia-shell | ecodia-supabase | ecodia-scheduler | ecodia-crm | ecodia-graph | ecodia-factory>
permissions: <claude/-prefixed branches only (default) | unrestricted branch pushes (rare)>
purpose: <one-line summary of what this routine does>
---

You are EcodiaOS running as the <name> Routine on <account>. This fires <cadence>. Your job is <one paragraph of context]. You have ~<N> minutes.

## Step 1 - Substrate orientation

[which MCP tools to call to orient]

## Step 2 - <main work>

[the actual work, decision criteria, action options]

## Step N - Episode write

`neo4j.write_episode` with name="<routine-name> {timestamp AEST}", description="...", type="cowork_realisation" or "cowork_audit".

## Step N+1 - observer_signal emit (universal contract per Lane C3)

If any of these conditions fired during the run, emit an observer_signal to the routine's kv_store surface AND to the global roll-up. These are NOT critique events - they are gentle peer-signals about behavioural drift (the post-migration replacement for the VPS osSessionService observer layer).

Default rules every Routine evaluates against itself:

- **substrate-write-streak:** more than 10 distinct tool calls in this Routine run produced no `status_board.upsert` / `neo4j.write_decision` / `neo4j.write_episode` / `kv_store.set`. (Most Routines should always pass; flagging means the prompt is too read-heavy.)
- **thin-context:** any `status_board.upsert` you authored this run had `context` < 50 chars. Re-upsert with a fuller context line before exit.
- **episode-overdue:** the Routine completed without writing an Episode. (Per the per-Routine prompt; exempt only when the prompt explicitly says "no Episode this run".)
- **untrusted_input_wrap mismatch:** a webhook-triggered Routine processed external content without the `<untrusted_input>` wrap markers visible. (Indicates an upstream shim regression.)
- **routine-specific:** anything the individual Routine prompt names as load-bearing failure modes (e.g. factory-cloud names em-dash-drift and high-blast-radius-edit; meta-loop names absence-of-decision; system-health names anomaly-coverage-gap).

Append each signal to TWO kv_store keys (LIFO, capped):

```
kv_store.cowork.observer_signals.routine.<routine-name>   # cap 20, per-routine
kv_store.cowork.observer_signals.global                   # cap 50, cross-routine roll-up
```

Signal shape:

```json
{
  "ts": "<ISO timestamp>",
  "routine": "<routine-name>",
  "routine_session_id": "<anthropic session id>",
  "kind": "<substrate-write-streak | thin-context | episode-overdue | untrusted-input-wrap-mismatch | <routine-specific>>",
  "message": "<one-line summary>",
  "ref": "<row id | file path | external ref>"
}
```

The local conductor reads `cowork.observer_signals.global` via the `/observer-signals` slash command and surfaces any high-priority kinds to Tate.

## Constraints

- Em-dashes BANNED.
- [other applicable constraints from doctrine - no client contact, autonomy doctrine, etc]

## Failure modes to avoid

- [3-5 specific failure modes for this routine]
```

## Cross-Routine observer_signals contract

The post-migration observer layer spans 16 Routines + the interactive Corazon conductor. Convergence shape:

| Surface | Producer | Consumer | Cap |
|---|---|---|---|
| `kv_store.cowork.observer_signals.recent` | Corazon PostToolUse hook (`observer_signal.py`) | `/observer-signals` slash command + meta-loop Routine | 20 LIFO |
| `kv_store.cowork.observer_signals.routine.<name>` | Each Routine at end of its run | `/observer-signals` slash command + the Routine itself for self-tuning | 20 LIFO per routine |
| `kv_store.cowork.observer_signals.global` | Both Corazon hook AND every Routine | `/observer-signals` slash command + claude-md-reflection Routine for weekly tuning | 50 LIFO |
| Local tail (Corazon only) | PostToolUse hook | `/observer-signals` slash command as a fallback when MCP is unreachable | 50 LIFO at `~/.claude/hooks/ecodia/state/observer_signals_local.jsonl` |

The interactive Corazon hook writes to `recent` + `global`. Each Routine writes to `routine.<name>` + `global`. The roll-up at `global` is the canonical pan-substrate view.

Pattern: `D:/.code/EcodiaOS/backend/patterns/observer-signals-reimplementation-via-posttoolusehook-2026-05-15.md`.
Architecture: `D:/.code/EcodiaOS/backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` §7.

## Verification

After creating each routine in the web UI and Run-now-firing it once, the routine should:
1. Read its substrate inputs without 401.
2. Make at least one durable substrate write (status_board.upsert OR neo4j.write_episode/decision OR kv_store.set).
3. Complete in <50% of its scheduled interval (so it does not overlap with the next scheduled run).

If a routine 401s on every MCP call, the ecodia connector is not attached or is misconfigured on that account - re-check the parallel-work prompt step 1.

If a routine completes but writes nothing durable, re-read the prompt and look for a missing Episode/Decision/status_board write.

If a routine times out, the prompt is too ambitious for the available session budget; either narrow the work or split into two routines.
