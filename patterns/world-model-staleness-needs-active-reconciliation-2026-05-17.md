---
name: world-model-staleness-needs-active-reconciliation-2026-05-17
description: My world model (the architecture I describe in CLAUDE.md, auto-memory, patterns, Neo4j) drifts from ground truth because no system periodically reconciles claim against reality. Hooks surface local doctrine on individual actions but nothing asks "is the architecture you describe actually running?"
triggers: world-model-drift, world-model-staleness, architecture-drift, claude-md-stale, doctrine-stale, narrated-vs-running, phantom-shipped, shipped-but-not-running, declared-but-dormant, codified-but-dead, world-model-audit, reconciliation-routine, ground-truth-probe, weekly-world-model-audit, drift-detection-architectural, lane-shipped-not-running, listener-tier-dormant, frontend-dead-but-doctrine-alive, fork-mechanic-stale
metadata:
  type: doctrine
  status: active
  authored_at: 2026-05-17
---

# World model staleness needs active reconciliation, not just per-action hooks

## The rule

A weekly **world-model-audit** routine (or its non-cron equivalent on the new local-first substrate) reconciles claims in CLAUDE.md / auto-memory / patterns / Neo4j against the actual disk / process / substrate state they describe. When drift exceeds a threshold for a given section, it opens a single P3 `status_board` row naming the section and the gap.

Per-action hooks already exist for local doctrine surfacing (cred-mention, status-board-write, brief-consistency, em-dash detector, etc). Those catch micro-staleness on individual writes. They do NOT catch macro-staleness: a whole subsystem described as live in CLAUDE.md that has no running process.

## The failure mode this prevents

2026-05-17 cold-start orientation: I laid out a 200-line world-model summary for Tate with multiple outright fictions:

- "Fork hierarchy - 3 Max accounts = 6 capacity slots, manager forks, 5/5 cap" - the entire SDK fork substrate had been migrated away from. No process holds it.
- "Listener tier shipped Phase 2 Lane 03 2026-05-15" - code on disk at `backend/listener-tier/` exists, but PM2 is empty on Corazon. Never started. `last_fired_ts: null` and `fire_count: 0` in `registry.json`.
- "EOS mobile app" - directory doesn't exist on disk.
- "[redacted] / [redacted] - client engagement, Bitbucket repo" - already partially archived to `clients/archived/[redacted]/` but doctrine + skills + pattern + INDEX still surface it as active.
- "EcodiaOS frontend" - dir exists at `D:/.code/EcodiaOS/frontend/` but Tate stopped using it; doctrine describes it as the user-facing surface.

Tate flagged these and framed the meta-problem himself: "this is an actual problem that needs attending to."

## Why per-action hooks miss this

Per-action hooks fire on a tool call: "you're writing to status_board, here's the doctrine on status_board writes." They never fire on the **absence** of an action. "Nothing has fired the listener-tier in 60 days" is exactly the signal that needs surfacing, and no hook can emit it.

`re-probe-stale-readings-before-acting-on-cached-alerts` exists for health-check kv_store rows. That doctrine covers "the metric is stale." It does NOT cover "the architecture the metric was supposed to monitor is dead."

## The audit routine spec

Pick **one section per run**. Probe what it claims. Diff against reality. Open at most one P3 row.

Concrete probe protocol per section type:

| Section claims | Probe |
|---|---|
| "PM2 process X is running" | `pm2 list` for that name |
| "MCP tool X exists" | `ToolSearch select:X` returns a schema |
| "File at path Y exists" | `Test-Path Y` or `Glob Y` |
| "Endpoint Z responds" | `curl -s -o /dev/null -w "%{http_code}" Z` |
| "Substrate row in table T with property P" | `db_query SELECT count(*) FROM T WHERE P` |
| "Cron job N fires daily" | `mcp__scheduler__schedule_list` for N, check `last_fired_ts` |
| "Listener L fires on event E" | Read `listener-tier/registry.json` for L's `last_fired_ts` and `fire_count` |
| "Client X is active" | `clients/{slug}.md` exists at top level (not `clients/archived/`) AND `status_board` has an active row |
| "Pattern Y is live doctrine" | Pattern file frontmatter `status` is `active` (not `narrowed` or `archived`) |

Score: each probe returns pass / fail / inconclusive. Section score = % pass. <70% triggers a P3 status_board row: `world-model-drift section=<name> score=<n%> probes_failed=<list>`. The row's `next_action` is "rewrite the section against current reality." `next_action_by=ecodiaos`.

## Sections to cycle through

CLAUDE.md (user-global + workspace + backend) plus auto-memory MEMORY.md plus the live pattern set. Approximate section list:
1. Identity / legal
2. Substrate map (Postgres tables, Neo4j labels, kv_store namespaces)
3. MCP endpoints (cowork, ecodia-full, domain-scoped connectors)
4. Routines (which are running on which account?)
5. Local Corazon embodiment (hooks, skills, auto-memory paths)
6. Tailscale mesh (which IPs respond?)
7. Listener tier (which listeners have fired in the last 7d?)
8. Streaming substrate (which publishers are publishing?)
9. Checkpoint primitive (any active chains?)
10. Visual testing substrate (any recent visual runs?)
11. Auto-preview substrate (extension installed in IDEs?)
12. Voice engine (any recent calls?)
13. Frontend / EOS mobile (still in use? Tate uses what?)
14. Hooks layer (which are firing? which are dormant?)
15. Active clients (status_board active vs `clients/archived/` separation clean?)
16. Migration phase (status_board phase row vs reality)

One section per run. Run cadence: ideally weekly. On the local-first substrate without VPS-driven crons, this becomes a `/world-model-audit` skill that Tate can invoke (or that runs from a scheduled IDE-tab spawn once the macro path ships).

## The same-turn correction rule

Per `codify-at-the-moment-a-rule-is-stated-not-after`, when Tate flags staleness in chat, the correction lands on the right substrate **that turn**. I violated this on the 2026-05-17 cold-start by laying out 200 lines of stale architecture and then continuing to talk before correcting it. The audit routine is the structural fix. The same-turn rule is the cultural fix. Both required.

## Anti-patterns

- **Auditing everything at once**. The audit routine picks ONE section per run. Sweeping the whole doctrine is exactly the action that generates a 200-line stale narrative, because synthesis under cap pressure compresses by trusting the source.
- **Trusting `last_fired_ts: null` as "never fired"**. Could mean never fired, OR the listener was never started. Probe process state too.
- **Inferring service liveness from `pm2 list` alone on Corazon**. Most Corazon services don't run under PM2 - see [[pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17]]. Use HTTP `/health` probes instead. This was the specific 2026-05-17 sister-failure: I correctly recognised that doctrine was stale and started auditing, then used the wrong probe substrate (PM2) and generated NEW stale claims (agent dead, when alive).
- **Writing the audit verdict as a Neo4j Reflection**. Reflections drift the same way doctrine does. Verdict lands as a `status_board` row (durable, surfaced on every orientation pass) plus a same-turn edit to the offending CLAUDE.md / pattern file.
- **Letting the audit row sit at P3 for weeks**. If the section is still stale 30d after the row was opened, escalate to P2 + Tate-required.

## Origin

Tate verbatim 2026-05-17: "There are a lot of htings there that are stale and that we need ot be tracking much better in future (this is an actual problem that needs attending to)."

The trigger event was the cold-start world-model summary in this session, which contained ~5 substantial architectural fictions. The deeper cause is that the doctrine substrates have no continuous reconciliation against ground truth.

## How to apply

When Tate asks for any survey-shape output ("explain X", "what's our Y", "describe Z architecture"), grep `triggers:` for the topic, then for each claim that names a process / file / endpoint / substrate row, **probe it before asserting it**. If the probe fails, mark the claim with `[STALE: <reason>]` in the response and write a same-turn correction to the source doctrine file.

When Tate flags a stale claim in chat, write the correction to the right substrate that turn. Do not say "I'll get to it" - the audit routine catches what slips, but the same-turn rule prevents most slippage.

Cross-refs: [[verify-deployed-state-against-narrated-state]], [[codify-at-the-moment-a-rule-is-stated-not-after]], [[re-probe-stale-health-check-readings-before-acting-on-cached-alerts]], [[narration-vs-disk-reconciliation-checklist]].
