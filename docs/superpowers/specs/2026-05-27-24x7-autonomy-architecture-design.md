# EcodiaOS 24/7 Autonomy Architecture - End-to-End Design

**Date:** 2026-05-27
**Status:** Design v1 - awaiting Tate review before any code lands
**Driver:** Tate verbatim 2026-05-27: "be MUCH more thorough with how you design each part. Actually thinking about your ongoing and 24/7 autonomy, ability to complete chained tasks, coordinate the different parts of you, stay coherent over time, manage yourself etc."
**Scope:** The full loop from scheduler-fires-cron through worker-completes through conductor-aware-of-outcome. Identifies every gap in the current substrate vs. true 24/7 self-sustaining operation.

## What 24/7 autonomy actually requires

Tate is travelling October-December 2026. While he is away, EcodiaOS must:

1. Fire scheduled work without manual prompting
2. Spawn fresh CC chat tabs that actually execute their briefs
3. Have the spawned work's outcomes flow back to a live conductor instance
4. Coordinate multiple simultaneous conductors (this chat, iOS app, voice, other CC tabs) without duplicating work or stepping on each other
5. Keep coherent state across hours/days/restarts/account caps
6. Self-monitor and self-correct - detect when work failed silently, when account is about to cap, when a substrate seam drifted
7. Escalate to Tate only when human-only judgement is required (escalation tiers: SMS for time-critical, push for batched, no-fire for routine)
8. Survive its own crashes, restarts, cred refreshes without losing in-flight context

The current build has most of the SUBSTRATE in place. The GAPS are in the coordination/awareness/lifecycle layers between substrate components.

## Layer map - what exists, what is broken, what needs building

### Layer 1: Substrate (state owners)

| Substrate | Owner | Status | Purpose |
|---|---|---|---|
| `os_scheduled_tasks` | Postgres | alive, migration 136 applied | cron / delayed / chained scheduled work |
| `pending_restart_requests` | Postgres | alive (workers write, conductor approves) | conductor-owns-restart coordination |
| `status_board` | Postgres | alive, 100+ rows | canonical "what is open" surface |
| `approval_queue` + `approval_action_log` | Postgres, migration 134 | shipped this session | items needing Tate Y/N/edit |
| `working_set` | Postgres | alive | typed conductor thread-state (max 5 active) |
| `observer_signals` | Postgres | alive | Haiku observer-trio drift warnings |
| `os_session_messages` | Postgres | alive | message queue for VPS-side conductors + iOS app |
| `coord` bus | local filesystem on Corazon | alive (laptop-agent owns) | worker registration, signal_bound, signal_done, inbox per topic |
| Neo4j (Decisions, Episodes, Patterns) | Aura | alive | durable memory |
| `kv_store` | Postgres | alive | credentials, ephemeral state |
| Auto-memory | Anthropic Corazon-local | alive | relationship memory per machine |

**Gap:** there are 11 substrate surfaces. No single map tells a conductor at turn-start which of them have anything new. Each must be queried individually OR injected via continuity blocks.

### Layer 2: Scheduler + Dispatcher + Watchdog

| Component | Path | Status | Notes |
|---|---|---|---|
| Scheduler dispatch loop | `D:/.code/eos-laptop-agent/tools/scheduler.js` | alive (Phase 3 architect's ship) | 30s poll, lease-then-dispatch, launch-lock serial |
| dispatch_worker | `D:/.code/eos-laptop-agent/tools/cowork.js` | alive but brief-paste-focus bug (this session: focus call patched into both primary and recovery paste paths, awaiting end-to-end re-test) | Spawns fresh CC chat via Ctrl+Alt+Shift+C, rotates creds, pastes brief |
| Tab auto-close | (missing) | gap | `signal_done` unlinks `.spawned` marker but IDE tab stays open. Tabs accumulate. |
| Cred rotation | `D:/.code/eos-laptop-agent/tools/creds.js` | alive | atomic file write, no fs.watch (regression-tested) |
| Cred refresher daemon | `D:/.code/eos-laptop-agent/daemons/cred-refresher.js` | alive, needs PM2 supervision | 30-min OAuth refresh, rotates single-use refresh_token atomically |
| Watchdog | `D:/.code/EcodiaOS/backend/src/services/corazonWatchdog.js` | alive on disk, needs VPS git pull + PM2 reload | SMSes Tate on laptop-agent down, queue backup, refresh failures, orphaned tasks |
| Account seeding | `D:/PRIVATE/ecodia-creds/{tate,code,money}.json` | only `tate.json` seeded | code@/money@ need Tate to sign in then copy |

**Gaps:**
- Tab auto-close (v1.1 polish)
- code@/money@ cred files (needs Tate)
- VPS watchdog deployment (one git-pull + pm2-reload)
- PM2 supervision of laptop-agent (needs elevated PowerShell)

### Layer 3: Worker lifecycle

| Phase | Mechanism | Status |
|---|---|---|
| Spawn | `vscode.new_claude_code_chat` (Ctrl+Alt+Shift+C) | alive |
| Brief paste | clipboard.write + Ctrl+V + Enter, gated by `ide.command claude-vscode.focus` (patched this session) | alive after focus patch |
| Signal bound | `coord.signal_bound` (worker first turn, releases launch-lock) | alive |
| Execute | worker reads brief, runs task, writes substrate | works |
| Signal done | `coord.signal_done` (writes to chat.conductor.inbox + unlinks .spawned marker) | alive |
| Tab close | (gap) | tabs accumulate; manual Ctrl+W required |
| Outcome verify | none automated (gap) | conductor must remember to check |

**Gaps:**
- Tab auto-close after signal_done
- Outcome verification harness

### Layer 4: Conductor turn-start awareness (THE CRITICAL GAP Tate identified)

A conductor session has continuity blocks injected at turn-start. Today there are:

- `<now>` - timestamp
- `<forks_rollup>` - legacy SDK fork state
- `<working_set>` - conductor thread state
- `<scratchpad_recent>` - silent reasoning trace
- `<observer_signals>` - Haiku observer interventions
- `<approval_queue>` - items needing Tate (added this session)
- `<recent_doctrine>` - last 14d Decision/Episode
- `<relevant_memory>` - topic-scoped Neo4j
- `<perception_summary>` - perception bus state
- `<proactivity_signal>` - proactivity engine
- `<restart_recovery>` - handoff state if recent
- `<last_turn_breadcrumb>` - prior turn artifact

**Missing blocks (the gap):**

- `<coord_events>` - new `coord.signal_done` / `signal_bound` messages from workers since the last turn boundary. Without this, when a worker fires `signal_done`, no conductor sees it unless someone manually polls `coord.read_inbox`.
- `<pending_restart_requests>` - rows in `pending_restart_requests` table with `status='pending'`. Per the conductor-owns-restart doctrine, only the conductor can approve. Without injection, the request sits forever or needs Tate to surface it.
- `<status_board_critical>` - rows with `priority <= 2 AND archived_at IS NULL`. Currently you have to query manually. Critical rows should be visible at every turn-start.
- `<active_workers>` - rows in coord `workers` registry with `dead=false`. Visibility into what fresh-chat-tabs are alive right now.

**Two-pane problem:** this conductor (Cursor-based, on Corazon) does NOT route through `osSessionService` on the VPS. It is a direct Claude Code chat with MCP. Continuity-block injection for this conductor must happen via a **UserPromptSubmit hook** that runs locally (same hook mechanism as the existing scope-context block at every prompt).

For VPS-side conductors (iOS native conductor, voice conductor), `_injectCoordEvents` and `_injectPendingRestartRequests` go in `osSessionService.js` (same shape as `_injectApprovalQueue` added this session, which calls out to laptop-agent across Tailscale).

### Layer 5: Multi-conductor coordination

The current state: multiple conductors can run simultaneously (this Cursor chat + iOS + voice + spawned worker chats). Each writes to the same `status_board`, `working_set`, `os_scheduled_tasks`, etc.

**Gaps:**

- **No claim-then-execute pattern.** If THIS conductor decides to "handle email triage" and another conductor (or worker) also picks it up, both work in parallel on the same thread. Result: duplicate sends, duplicate status_board writes, conflicting state.
- **No conductor identity at turn-start.** Each conductor's first turn doesn't know other conductors are alive. `coord.list_workers` shows spawned workers but not other conductor sessions.
- **No "I'm taking this" lease.** When a conductor decides to act on a `status_board` row, no lease is acquired. Another conductor could pick up the same row.

**Build:**

A `claims` substrate (could be `working_set` extended OR new table):

```sql
CREATE TABLE conductor_claims (
  id uuid PK,
  conductor_id text,  -- e.g. 'main-tate-cursor-2026-05-27'
  entity_type text,  -- 'status_board_row' | 'email_thread' | 'queue_item' | 'scheduled_task'
  entity_ref text,
  claimed_at timestamptz,
  expires_at timestamptz,  -- TTL: 30 min default
  released_at timestamptz,
  outcome text
);
```

Pattern:
1. Conductor decides to act on entity X
2. `INSERT ... ON CONFLICT (entity_type, entity_ref) WHERE released_at IS NULL DO NOTHING`
3. If returned row → my claim, proceed
4. If no row returned → someone else owns it, defer or skip

This is the same lease-then-act pattern `scheduler.leaseDueRows` already uses.

### Layer 6: Verification + self-healing

**Current state:**
- Workers report `signal_done` with a result_summary
- Conductor (or Tate) trusts the summary
- Pattern `verify-deployed-state-against-narrated-state.md` says don't trust narration

**Gap:** no automated verification harness. The pattern is doctrine but not substrate.

**Build:** per-item-type verification probes:

| Worker task type | Probe |
|---|---|
| Code commit | `git log --oneline | head -1` matches reported SHA |
| Deploy | `vercel.list_deployments` shows new deployment in READY state |
| Email send | `gmail.get_thread` shows outbound message in thread |
| Status_board write | row exists with expected name + status |
| Neo4j write | `MATCH (n {name: '...'}) RETURN n` returns 1 |
| File write | `fs.stat` confirms |

The verification harness runs after `signal_done` (either by completionPass on laptop-agent OR by the conductor at turn-start when it sees the `<coord_events>` block). If verification fails: re-fire task OR file P1 status_board row OR SMS Tate per escalation tier.

### Layer 7: Continuity across sessions

When a chat ends (cap hit, restart, accidental close), the next chat needs to know what was in flight. Today:

- `handoff_state` in kv_store (saved via `/api/os-session/save-state`) - VPS-side, only for osSession conductors
- `restart_recovery` continuity block reads it on next turn
- 6h freshness window

**Gaps:**

- THIS Cursor conductor doesn't save handoff_state. If the chat is replaced (cap hit on tate@), the new chat starts blind.
- `working_set` rows aren't auto-transferred. A new chat doesn't pick up the threads the prior chat was on.
- No "I am account X about to cap" warning surfaces to this conductor (the observer trio exists but doesn't surface here without the turn-start hook).

**Build:**

1. PreCompact hook (Anthropic SDK feature): write working_set + recent action log + active claims to `kv_store.handoff_state.tate_cursor_main` before context compaction
2. UserPromptSubmit hook: read `kv_store.handoff_state.tate_cursor_main` if age < 6h and inject as `<continuity_handoff>` block
3. `coord.usage_warning` event: when current account headroom < 15min, fire a signal that the turn-start hook surfaces as `<account_capping>` block

### Layer 8: Escalation tiers (failure mode awareness)

When something fails, the escalation needs to be calibrated:

| Severity | Surface | Latency target |
|---|---|---|
| Routine info | observer_signal | next-turn (when conductor sees `<observer_signals>`) |
| Action recommended | observer_signal P2 + status_board P3 | next-turn |
| Conductor decision needed | `<pending_restart_requests>` block + status_board P2 | next-turn |
| Tate-only judgement | `approval_queue` insert + APNs push (+ SMS if critical) | within minutes |
| Time-critical / urgent | direct `sms.tate` + observer P1 | within minutes |
| Hard tripwire (per CLAUDE.md) | STOP + SMS + status_board P1 | immediate |
| Substrate down (corazon dead, all caps, refresh fail 3x) | corazonWatchdog SMS to Tate | <15 min |

**Current state:** most of these wires exist (sms.tate, approval_queue surfacing, observer_signals, corazonWatchdog). What's missing is the EXPLICIT routing per failure mode - a worker that fails silently should know which tier to escalate to.

**Build:** a `failureEscalate(severity, message, context)` helper that workers + conductor both call, routing to the right tier per the table above.

## Build priority

### P0 (this session, before re-enabling scheduler)

1. **Comprehensive autonomy spec** (this document)
2. **Conductor turn-start awareness** - UserPromptSubmit hook for THIS Cursor conductor + `_injectCoordEvents` + `_injectPendingRestartRequests` for VPS-side conductors
3. **Dispatch_worker focus patch** - already shipped this session, awaiting end-to-end test
4. **Tab auto-close on signal_done** - via UIA-targeted close-tab call invoked by `scheduler.markComplete`

### P1 (this session, ideally)

5. **Multi-conductor claim-then-execute** - claims table + lease helper + claim check in obvious caller paths (email triage, status_board row pickup, scheduled task dispatch)
6. **Outcome verification harness** - per-task-type probe library + integration into `scheduler.markComplete`
7. **Handoff hardening** - PreCompact hook saves handoff_state for this Cursor conductor; UserPromptSubmit hook reads + injects
8. **Stop VPS ecodia-conductor scheduler poller** - laptop-agent v3 owns scheduling now; remove VPS-side competitor

### P2 (next session if not now)

9. **Escalation tier helper** - `failureEscalate()` library used everywhere
10. **CLAUDE.md update** - document the alive substrate canonically
11. **Doctrine consolidation** - my stale self-scheduling doc → mark superseded by canonical v3

### Deferred (needs Tate)

12. **code@/money@ cred seeding** - manual sign-in + copy
13. **PM2 elevated supervision** - elevated PowerShell setup
14. **VPS corazonWatchdog deploy** - git pull + pm2 reload

## Non-negotiable invariants

These rules apply to every component built under this spec:

1. **Tabs spawned by dispatch_worker MUST close on signal_done.** Accumulation is a regression.
2. **No conductor reads `~/.claude/.credentials.json` directly.** Only `creds.rotate_to` writes. No `fs.watch`.
3. **Conductor-owns-restart.** Workers file `pending_restart_requests`. Conductor approves + executes.
4. **No conductor double-dispatches a scheduled task.** `leaseDueRows` is the atomic gate.
5. **No two conductors act on the same `status_board` row simultaneously.** Claims gate this.
6. **Every worker brief mandates `signal_bound` as the literal first instruction.** Without it, the scheduler treats the dispatch as failed after 30s timeout.
7. **Worker signal_done MUST trigger conductor turn-start surfacing.** No silent completion. (THE GAP Tate identified.)
8. **Verification ALWAYS runs after signal_done** for tasks that have a verifiable outcome. Narrated success is not real success.
9. **Continuity blocks have hard byte caps.** No turn-start block exceeds 2KB. Tail-truncation with "N more omitted" pointer.
10. **All substrate writes go through named producer methods.** No ad-hoc INSERTs from chat narration.

## What this fixes vs. what stays unsolved

**This spec fixes:**
- Conductor blindness to worker outcomes (Layer 4 build)
- Empty-tab accumulation (Layer 3 + Layer 2 build)
- Race conditions across simultaneous conductors (Layer 5 build)
- "Did it really work" verification gap (Layer 6 build)
- Cap-hit context loss for THIS chat (Layer 7 build)
- Inconsistent escalation routing (Layer 8 build)

**This spec does NOT fix (out of scope, separate work):**
- Cross-language verification (Python, Swift, etc deliverables)
- Multi-machine federation (Mac mini, second VPS executor)
- Goal-based scheduling (open-ended goals decomposed into chats)
- Active-chat-rotation (seamless mid-conversation account swap with context transfer)

## Testing strategy

For each Layer build:

1. **Layer 4 turn-start awareness:** simulate a worker firing `signal_done`. Next conductor turn must show `<coord_events>` block with the signal. Without manual polling.
2. **Layer 5 claims:** two simulated conductors race for the same `status_board` row. Exactly one wins. The other defers cleanly.
3. **Layer 6 verification:** simulate a worker that lies in `result_summary`. The verification probe catches it. Conductor sees a `<verification_failed>` event.
4. **Layer 7 handoff:** simulate context compaction. New session reads `<continuity_handoff>` and resumes the prior chat's working_set.
5. **End-to-end:** schedule a real cron task. Fresh CC chat spawns, runs, signals done. THIS conductor sees the result at next turn-start. Verification probes the deliverable. Tab auto-closes.

## Open questions to resolve in writing-plans

- Should the UserPromptSubmit hook for THIS Cursor conductor be a single hook with all 4 new blocks, or 4 separate hooks each producing one block?
- What's the right UIA call for tab-close? Per-tab-id targeting needs the tab's window handle - is that stored?
- Should claims have priority levels (so high-pri conductors can preempt low-pri ones)?
- Handoff_state byte cap - what fits in continuity-block budget given working_set + recent actions could be large?
- Verification probes: synchronous (block markComplete) or async (next tick)?

---

That's the design. Tate, want this shape? Edits? Then I execute P0-P1 in order.
