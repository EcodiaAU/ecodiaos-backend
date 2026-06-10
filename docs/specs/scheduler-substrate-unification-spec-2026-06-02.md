---
title: Scheduler substrate unification spec
status: living
authored: 2026-06-02
supersedes: status_board.db48d970.context (the row-context-as-spec antipattern)
status_board: 957bddcc-6fde-41f0-b230-dd123312cbcb (parent audit), db48d970-bee1-44b5-94b4-c8f079b647e6 (migration)
---

# Scheduler substrate unification

The single substrate of record for "what runs when EcodiaOS is not at the keyboard." Lives on the Corazon laptop-agent (`D:/.code/eos-laptop-agent/tools/scheduler.js`), polls Supabase `os_scheduled_tasks`, dispatches a fresh Claude Code chat tab via `cowork.dispatch_worker`, tracks completion through the `coord` inbox. Africa Oct-Dec 2026 is the forcing function.

## Canonical surfaces

| Surface | Where | Auth | Status |
|---|---|---|---|
| In-process tool dispatch | `POST http://127.0.0.1:7456/api/tool` with `tool: scheduler.schedule_*` | bearer at `~/.ecodiaos/laptop-agent.token` | LIVE |
| Remote MCP connector | `https://api.admin.ecodia.au/api/mcp/ecodia-scheduler` (15 tools) | `kv_store.creds.ecodia_scheduler_mcp_bearer` | LIVE |
| Scheduler dispatch loop | `D:/.code/eos-laptop-agent/tools/scheduler.js::start` (30s lease + 5s completion + 60s stale recovery + 5min cap-warn + 7min orphan-cleanup) | env `SCHEDULER_ENABLED=true` | LIVE on Corazon |

The CRUD/control plane and the dispatch plane share one process (the laptop-agent). One poller, one substrate, one source of truth.

## Phases

### Phase A - foundation (laptop-agent owns dispatch)

**A1 - in-process scheduler.schedule_delayed / schedule_cron / schedule_list:** SHIPPED. Commit `9f54194`. Tools exposed via `/api/info`, invoked through `/api/tool`. `tz` column added to `os_scheduled_tasks` so crons fire in Brisbane time, not UTC.

**A2 - CRUD pause / resume / cancel / run_now / chain:** SHIPPED. Commit `ee01fc9`. Chain wake-up wired (`markComplete` sets child `next_run_at = NOW()` on parent success).

**A3a - JSON-RPC 2.0 shim mirroring `mcpCoord.js`:** SUPERSEDED 2026-06-02. The remote `ecodia-scheduler` connector already exposes the 15 tools to any Claude Code seat via standard MCP. The local seat reaches the same tools through `/api/tool`. A second HTTP surface duplicating the JSON-RPC envelope adds no capability and another race target. Skip.

**A3b - retire VPS schedulerPollerService:** PENDING. Two pollers leasing the same `os_scheduled_tasks` table is the structural race. Disable the VPS path once A3a-superseded is recorded and a 24h fire-success window passes on the laptop-agent alone.

### Phase B - reliability hardening (live work)

**B1 - no-IDE = transient defer:** SHIPPED 2026-06-02. Commit `2733bfa`. `dispatchOne` recognises "no IDE instances registered" as transient and defers the row 5min without incrementing `retry_count`. The cron survives any IDE-gap window naturally.

**B2 - cron rows never permanently fail:** SHIPPED 2026-06-02. Same commit. When `markFailed` hits `MAX_RETRY_COUNT` on a cron row, defer to the next cron interval and reset `retry_count` instead of marking `failed`. One-shot (delayed/chained) rows still permanently fail because that work IS done.

**B3 - codify the reliability invariants:** PENDING. Author the doctrine pattern + cross-ref from `backend/CLAUDE.md`.

### Phase C - retire vestigial substrates

Substrates that scheduled work historically and need explicit retire-or-keep decisions:

- **VPS `schedulerPollerService`** - racing with laptop-agent on the same table. Retire (B3b above).
- **Anthropic claude.ai Routines** - 16 of 22 registry rows have blank `fire_url`/`fire_token` in `backend/routines/REGISTRY.md` (status `unverified` since 2026-05-17). Decide per-routine: register in the claude.ai web UI OR archive the .md file. Default: archive if no clear consumer.
- **Webhook `/fire` shims at `backend/src/routes/webhooks/*-fire-shim.js`** - Phase 2 side-by-side with legacy handlers (`stripe.js`, `vercel.js` etc) since 2026-05-15. Pick one path per source and disable the other.
- **Windows Task Scheduler entries scheduling EOS work** - `EcodiaOS Phase G v2 Producer`, `Daily Digest`, `MetaAudit-Saturday`, `doctrine-consolidation-audit`, `Conductor Pacemaker`. These violate `never-schedule-host-process-restart-via-os-scheduled-tasks`. Migrate or delete.
- **Legacy file-watcher listener tier** at `backend/listener-tier/`. Hook-based listeners under `~/.claude/hooks/ecodia/` are alive; the file-watcher daemon is dark. Either start the daemon or remove the code.
- **VPS pg_notify listeners** (forkComplete-cleanup, emailArrival-triage) - `last_fired_ts: null` since shipped. Either re-architect on hooks or remove.

### Phase D - substrate hygiene

- **D1** Archive the 532 terminal rows in `os_scheduled_tasks` (completed + cancelled + failed + orphaned). `SELECT count(*)` over the active set should fall from 534 to ~12.
- **D2** Re-arm the 3 orphaned recurring tasks (`bookkeeping-fx-rates-import`, `bookkeeping-tax-prep-eofy`, `coexist-stats-drift-check`) - convert from orphaned back to active with sane `next_run_at`.
- **D3** Resolve the 16 cron-vs-Routine name collisions (`pattern-corpus-health-check`, `weekly-financial-review`, `claude-md-reflection`, `morning-briefing`, `meta-loop`, `email-triage`, `system-health`, `daily-index-regen`, `kg-consolidation`, `self-evolution`, `marketing-outreach`, `outreach-engine`, `strategic-thinking`, `inner-life`, `parallel-builder`, `vercel-deploy-monitor`). For each: keep the `os_scheduled_tasks` row, archive the `routines/*.md` file (Routines are the deprecated path).

### Phase E - reflex enforcement

The doctrine surface for scheduling discipline currently lives in:

- `~/.claude/hooks/ecodia/dispatch_sched_reflex_surface.py` - UserPromptSubmit surfacing
- `~/.claude/hooks/ecodia/self_scheduling_nudge.py` - PostToolUse nudge on email/commit/dispatch

Both surface, neither enforces. After Phase B verification (one week of clean cron fires), audit fire rate via hook telemetry, decide whether enforcement (block-on-no-follow-up) is warranted.

### Phase F - doctrine prune

35 scheduler-related pattern files exist in `backend/patterns/`. ~15 describe dead substrate (forkService, os_forks, `/api/os-session/message`). Prune list lives in the parent audit report. Archive to `backend/patterns/_archived/` with `superseded_by:` frontmatter pointing at this spec.

`backend/CLAUDE.md` L162-170 + L907-961 (~1,200 words) still describe the deprecated `/api/os-session/message` path as canonical. Rewrite to reference this spec.

## Invariants (any future change MUST hold)

1. **One poller per `os_scheduled_tasks` table.** Two processes leasing the same row via `FOR UPDATE SKIP LOCKED` is a race; one always orphans.
2. **Cron rows never permanently die.** Any failure recovery path that ends in `status='failed'` for `type='cron'` is a regression. Defer to next interval + reset retry_count instead.
3. **Transient errors defer, do not retry.** No-IDE, network blip, account-cap defer the row and leave retry_count alone. Genuine permanent errors (malformed brief, missing prompt) consume retries.
4. **Dispatch loop never crashes the agent.** Every loop body is wrapped in try/catch; one bad row never tanks the scheduler.
5. **The brief composes signal_bound + signal_done + close_my_tab on every dispatch.** Workers self-clean; the IDE never accumulates dead tabs from the scheduler.
6. **AEST for human surfaces, UTC for substrates.** `cron-parser` parses with `{tz: row.tz}`; database stores UTC; tool returns include both `_utc` and `_aest` fields.
7. **Errors classify before they recover.** `dispatchOne` catch block discriminates by `err.name === 'AllAccountsCappedError'` / `err.message.includes('no IDE instances registered')` / generic. New error classes get a named branch, not a fallthrough.

## Cross-refs

- Parent audit: status_board `957bddcc-6fde-41f0-b230-dd123312cbcb`, Neo4j Episode node 4515
- Migration row: `db48d970-bee1-44b5-94b4-c8f079b647e6`
- 24/7 autonomy architecture invariants: `D:/.code/EcodiaOS/backend/patterns/24x7-autonomy-architecture-invariants-2026-05-27.md`
- Self-scheduling reflex: `D:/.code/EcodiaOS/backend/patterns/scheduling-is-0th-class-primitive-2026-05-28.md`
- Worker ack timeout doctrine: `D:/.code/EcodiaOS/backend/patterns/worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28.md`
- Auto-memory: `feedback_information_in_action_out_must_be_autonomous_2026-06-02.md` (three-layer framing that started this arc)
