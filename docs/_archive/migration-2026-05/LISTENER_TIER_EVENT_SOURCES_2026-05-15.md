# Local Listener Tier - Event Source Taxonomy + Routing Tree

**Date:** 2026-05-15
**Author:** EcodiaOS-on-Corazon, Phase 2 Lane 03
**Cowork session:** `phase2-03-listener-tier-2026-05-15`
**Status:** active doctrine for the post-migration local-native era
**Supersedes:** `EcodiaOS_Spec_Listeners.md` (2026-04-23 design brief). The original spec assumed a custom in-process WS bus on the VPS as the sole substrate. That assumption is retired. Listener semantics (single-purpose, idempotent, silent-on-failure, owns-write-surface) carry forward unchanged; the substrate changes.

---

## 1. Why this document exists

The VPS shipped 10 listener modules under `~/ecodiaos/src/services/listeners/` plus the Haiku observer trio under `~/ecodiaos/src/services/observers/`. They are useful AND brittle: every one depends on a custom WS broadcast bus + an in-process pg_notify bridge living on a single Node process. When PM2 recycled the api process, the entire reflexive tier went dark with no external alerting.

Locally on Corazon we have four event sources that are individually more reliable than the VPS bus, and collectively cover everything the original spec wanted. This document is the contract that says which source owns which kind of "listen for X, do Y" requirement. The contract prevents the failure mode where four similar listener fires get authored across four different substrates and nobody can find them when something breaks.

The decision tree in §3 is the load-bearing piece. Read §3 before authoring any new listener.

---

## 2. The four event sources

### 2.1 File watchers (Corazon, chokidar)

**What it is.** A long-running Node process on Corazon under PM2 (`eos-listener-tier`) using `chokidar` to watch specific paths under `D:/.code/EcodiaOS/`, `D:/.code/macro-recordings/`, and other tracked Corazon directories. Each path glob maps to one or more handlers.

**What it detects.**
- File create / write / unlink on tracked paths.
- Directory create / unlink.
- Pseudo-events emitted by external tools that write a sentinel file (a poor-man's IPC).

**What it cannot detect.**
- Substrate writes that happen on the VPS or via MCP (no filesystem touchpoint locally).
- Events on machines other than Corazon (Mac mini reaches us via a separate watcher in the macOS era; cloud-only Routine work has no filesystem touchpoint and must use 2.4 or 2.3).
- Events that happen while Corazon is asleep (the watcher catches up via a startup-scan when Corazon wakes, but only for paths configured for catchup).

**Latency.** < 100ms for in-tree changes once chokidar settles. Cold-start adds up to ~2s for `awaitWriteFinish` debounce.

**Cost.** Effectively zero. Chokidar uses native `fs.watch` on Windows. Per-handler cost is whatever the handler does; the bus itself is free.

**Failure mode.** Watcher crashes silently and stops firing. Mitigation: PM2 `--max-restarts 10 --restart-delay 5000` plus a heartbeat to `kv_store.health.eos_listener_tier` every 60s. If the heartbeat goes stale > 5min, the daily `pattern-corpus-health-check` cron flags it as a P3 status_board row. The watcher uses `awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }` to suppress mid-write partial reads.

**Examples (shipped or sketched).**
- `pattern-INDEX-regen` (this lane, 2026-05-15) on `backend/patterns/*.md`.
- `commit-pattern-detector` (this lane) on `.git/refs/heads/*`.
- Macro-recording session-id watcher on `D:/.code/macro-recordings/*` (existing).

### 2.2 Hook events (Claude Code lifecycle)

**What it is.** PreToolUse / PostToolUse / Stop / UserPromptSubmit / SessionStart hooks configured in `C:/Users/tjdTa/.claude/settings.json`. Each event passes its JSON envelope to a hook script under `~/.claude/hooks/`. The script can emit additional context (model-visible), append to a telemetry JSONL, or write to the substrate.

**What it detects.**
- Every tool call the conductor makes (PreToolUse and PostToolUse).
- Every turn boundary (Stop).
- Every user-typed prompt (UserPromptSubmit).
- Every session start (SessionStart).
- Subagent boundaries (SubagentStop).

**What it cannot detect.**
- Anything that happens outside an interactive Claude Code turn (cron-fired Routines, background processes, MCP-only writes from a non-conductor process).
- The semantic content of multi-tool turns until each tool call's PostToolUse fires.
- Anything in an isolated worktree the conductor never enters (the hook fires in the Corazon profile; isolated worktrees inherit settings, but the practical event surface is the same).

**Latency.** Synchronous with the turn. The hook blocks the next tool call until its stdout returns. Practical budget: under 200ms for context-injecting hooks. PostToolUse hooks that publish telemetry and return immediately are effectively free.

**Cost.** Token-free for the bash hooks; LLM-call hooks (`haiku-semantic-review.sh`) pay per fire. Lane B ships 13 ecodia hooks plus observer_signal.py plus session_logger.py - all token-free unless they explicitly fan out to an LLM.

**Failure mode.** Hook script errors are surfaced to the model as `[HOOK ERROR] <name>: <stderr>`. Critical hooks must `exit 0` on internal error and log to `~/.claude/hooks/ecodia/logs/`; never block the conductor on a hook bug. Lane B hooks already follow this discipline.

**Examples (already shipped, Lane B/C).**
- `cred-mention-surface.sh` (PreToolUse on Bash/Edit/Write/MultiEdit).
- `emdash-detector.sh` (PreToolUse on Edit/Write/MultiEdit).
- `observer_signal.py` (PostToolUse - emits coherence / drift / thin-context signals).
- `session_logger.py` (Stop - captures full transcripts for the corpus pipeline).
- `episode-resurface.sh` (UserPromptSubmit - injects relevant Neo4j Episodes).
- `pattern-surface` skill triggers (UserPromptSubmit - grep patterns/ for matching doctrine).

### 2.3 Routine triggers (Anthropic cloud + /fire webhook)

**What it is.** A scheduled or webhook-driven Claude Code cloud session managed at `claude.ai/code/routines`. Each routine is a fresh Claude Code session with the ecodia MCP connector attached. Routines can be cron-shaped (`every 6h`, `daily 09:00 AEST`) or trigger-shaped (POST to the routine's `/fire` URL).

**What it detects.**
- Scheduled wall-clock events.
- External webhooks (Resend inbound, Stripe events, GitHub PR events, Bitbucket PR events, custom systems).
- Anything that fires an HTTP POST at the routine's `/fire` URL.

**What it cannot detect.**
- File changes on Corazon (the routine cannot see Corazon's filesystem).
- Hook lifecycle events on Corazon.
- Substrate writes inside an active interactive conductor turn (those are 2.2 or 2.4, depending on shape).

**Latency.** Cron: scheduled to within ~1min of wall clock. Webhook /fire: ~5-15s end to end including Claude Code cold-start + connector handshake. Inside the routine, behaves like a regular Claude Code session.

**Cost.** Subscription routing (`Routines draw down subscription usage the same way interactive sessions do` per Claude Code docs). Per-fire cost dominated by tokens used during the routine. Heavy meta-cognitive routines cost more than narrow extraction routines.

**Failure mode.** Two classes:
1. Anthropic-side: the routine fails to fire (rare; reported in `claude.ai/code/routines` dashboard).
2. Self-inflicted: routine prompt is too narrow or too broad. Mitigation: every routine prompt under `backend/routines/<name>.md` includes a resolution-criteria block and an exit-fast clause for the empty-work case (see `~/CLAUDE.md` "Cron efficiency").

**Examples (Lane D).**
- `inbound-email-triage` (Resend webhook).
- `meta-loop` (cron, every 2h on tate@).
- `morning-briefing` (cron, daily 09:00 AEST on tate@).
- `system-health` (cron, every 4h on tate@).
- `factory-cloud` (POST /fire from `factoryDispatch.js`).

### 2.4 MCP write events (substrate-side notify)

**What it is.** The Postgres `eos_listener_events` channel via `pg_notify`. Every status_board / kv_store / os_forks / cc_sessions / staged_transactions / email_events INSERT or UPDATE fires a NOTIFY with the row id. A `dbBridge` LISTEN'er turns each NOTIFY into a `db:event` published on the in-process event bus.

**Substrate location.** The VPS Postgres remains the LISTEN target. Two consumer shapes:
- **VPS-side (current):** `src/services/listeners/dbBridge.js` on the api process LISTENs and fans to in-process listeners on the VPS. This is the substrate the original spec was built around.
- **Corazon-side (new):** the local listener tier can subscribe to a SSE relay at `/api/streams/db-events` (Streaming Substrate, Phase 2 Lane 06) without needing a direct LISTEN connection from Corazon. Lane 06 ships the relay; Lane 03 documents the consumer contract.

**What it detects.**
- Any `INSERT` or `UPDATE` on tables wired with `trg_*_notify` triggers (migrations 063 + later).
- Reverse-direction: a listener can write to a row to trigger another listener (chain), but the cross-listener communication rule in §5.3 of the original spec forbids this.

**What it cannot detect.**
- Filesystem changes (those are 2.1).
- Anthropic-side events with no DB touchpoint (those are 2.2 or 2.3).
- DELETEs unless the trigger is wired (the standard `trg_*_notify` migration captures INSERT + UPDATE only).

**Latency.** Inside the api process: < 50ms. Across the relay to Corazon (when Lane 06 ships): < 250ms median, < 1s p99.

**Cost.** Effectively free. The LISTEN is one persistent connection; the relay is one persistent SSE stream. Per-event cost is whatever the listener does.

**Failure mode.** Two:
1. dbBridge disconnects (the NOTIFY queue drops events the bridge wasn't there to receive). Mitigation: `dbBridge` keeps a `last_seen_seq` checkpoint in `kv_store.health.eos_listener_events_checkpoint` and on reconnect issues a catch-up SELECT against an audit table. The audit-table catch-up was authored in fork 5 May 2026 and is current as of this writing.
2. The trigger never fires (DDL change removed it, or the migration that adds it was never applied). Mitigation: a `pg_trigger` presence assertion runs in the api boot sequence.

**Examples (shipped on VPS, surfaced via local relay post-Lane 06).**
- `forkComplete` listener (os_forks UPDATE to terminal status).
- `statusBoardDrift` (status_board UPDATE, hybrid event+timer).
- `invoicePaymentState` (staged_transactions INSERT).
- `factorySessionComplete` (cc_sessions UPDATE to status='complete').
- `emailArrival` (email_events INSERT).

---

## 3. The routing decision tree

When a new "listen for X, do Y" requirement appears, run the tree top-down. The first matching rule owns the listener.

```
1. Is the trigger a file change on Corazon (or Mac mini in the macOS era)?
   -> File watcher (2.1).
   Examples: patterns/*.md save, .git/refs/heads/* update, macro-recordings/* session-end sentinel.

2. Is the trigger a tool call shape inside an active Claude Code turn?
   -> Hook (2.2).
   Examples: surface a cred mention before Edit, strip em-dashes after Write, emit observer_signal after a tool batch, classify the user's prompt before SessionStart.

3. Is the trigger a substrate write (status_board / kv_store / os_forks / cc_sessions etc.) regardless of who wrote it?
   -> MCP write event (2.4).
   Examples: fork completion cleanup, invoice payment matching, status_board drift sweep, email_events triage wake.

4. Is the trigger time-shaped (wall-clock) or an external webhook?
   -> Routine (2.3).
   Examples: morning-briefing 09:00, system-health every 4h, Resend inbound, Stripe paid-invoice webhook, GitHub PR opened.

5. Is the trigger an external event we cannot detect locally and have no webhook for?
   -> Webhook /fire shim (Lane D) -> Routine (2.3).
   Example: a vendor sends email-only notifications; the shim is a forwarder that turns the email arrival into an HTTP POST against the routine's /fire URL.
```

Edge cases:

- **A change happens in two places at once.** E.g. a commit lands both as a filesystem change (.git/refs) and as a substrate write (status_board "commit landed" row). Pick the source closest to the truth: the filesystem change is canonical, the status_board row is a derived projection. Author the listener on (2.1); the substrate row is a side-effect of the same handler.

- **Same trigger, two actions.** Author two listeners. The single-purpose rule (original spec §2) is load-bearing.

- **A hook needs to do work that takes > 200ms.** The hook publishes a sentinel (file write or kv_store write) and a separate listener on (2.1) or (2.4) picks it up async. Never block the conductor on a slow hook.

- **A Routine needs the local filesystem.** It does not get the local filesystem. Either (a) Factory dispatch as a cloud sub-task, or (b) the Routine writes a `pending_local_work` row in status_board and the local conductor's next turn picks it up via a (2.4) listener.

- **The trigger is "the conductor finished a turn."** This is (2.2) - Stop hook - if the action must run synchronously with the turn boundary. If the action can run async, prefer (2.4) by having the Stop hook write a sentinel row.

---

## 4. The 6 highest-leverage listeners (post-migration set)

| # | Listener | Source | Action | Status |
|---|---|---|---|---|
| 1 | `pattern-INDEX-regen` | (2.1) file watcher on `backend/patterns/*.md` | Regenerate `backend/patterns/INDEX.md` when frontmatter or filename changes | shipped this lane 2026-05-15 |
| 2 | `forkComplete-cleanup` | (2.4) MCP write on `os_forks` terminal status | Close working_set rows + perception-summary update | shipped on VPS, surfaced via Lane 06 relay |
| 3 | `emailArrival-triage` | (2.3) routine via Resend /fire | Inbound triage and conductor wake | shipped Lane D |
| 4 | `cred-mention-surface` | (2.2) PreToolUse on Bash / Edit / Write / MultiEdit | Surface kv_store cred path before insecure usage | shipped Lane B |
| 5 | `commit-pattern-detector` | (2.1) file watcher on `.git/refs/heads/*` | Scan diff for pattern-worthy work + status_board row | shipped this lane 2026-05-15 |
| 6 | `observer-signals-emit` | (2.2) PostToolUse | Emit coherence / thin-context / drift signals to local jsonl + observer_signals table | shipped Lane C |

The original spec set (memory facts, finance, todo, decision, consolidation, contact, factory output, rejection, status board) is partially shipped on the VPS and partially deferred. The full disposition is in `VPS_LISTENERS_DISPOSITION_2026-05-15.md` in this directory.

---

## 5. Doctrine for adding a 7th

Author a 7th only if all four hold:

1. The new listener has a single purpose that none of the existing six covers.
2. The routing tree gives a clean answer (one source, not "could be 2.1 or 2.4 depending").
3. The relevance filter can be specified in one sentence without an LLM call. Filters that require semantic understanding belong inside the handler, not the gate.
4. The write surface is declared and does not overlap any other listener.

If the new requirement fails any of the four, restate it. Common failure modes:
- "Listen for the conductor making a mistake" - too vague. Specify the tool call shape and write the hook.
- "Listen for clients going quiet" - that's a Routine job (cron, not a listener).
- "Listen for system health" - that's a Routine job (cron).
- "Listen for X, do A AND B" - two listeners.

The cap is soft. Six is a working set, not a ceiling. The lane authors will know when adding a seventh is wrong because the routing tree will refuse to answer.

---

## 6. Relationship to the VPS listener tier

The 10 modules under `~/ecodiaos/src/services/listeners/` plus the observer trio under `~/ecodiaos/src/services/observers/` continue to operate on the VPS for the substrate-write-event class (2.4). They are not duplicated locally; the local listener tier picks up exactly the cases the VPS substrate cannot reach - file changes (2.1) and hook events (2.2). Routines (2.3) run on Anthropic infrastructure regardless.

The VPS listener tier's `wsManager.subscribe()` bus is a private detail of the VPS api process. The local listener tier does not consume it directly; the streaming substrate (Lane 06) is the only documented bridge. Until Lane 06 ships, the local conductor reads `db:event` evidence by re-querying the substrate via MCP at the start of each turn (slow but correct).

---

## 7. Health and observability

Every listener (local or VPS) writes a heartbeat to `kv_store.health.<listener_name>` on every successful fire. The `pattern-corpus-health-check` weekly cron (Sunday 21:00 AEST) reads these heartbeats and surfaces silent listeners as a single status_board P3 row.

The local listener-tier additionally writes to `backend/listener-tier/registry.json` after every fire (atomic file rewrite). The `/listener-health` skill reads that file plus the kv_store heartbeats to produce a one-screen brief: which listeners fired in the last 24h, which are silent, which errored.

---

## 8. Anti-patterns

- **Do not author a listener for an event the routing tree says belongs elsewhere.** If you author a file watcher when the trigger is a substrate write, the listener will work right up until the next time someone writes to that substrate from a path that doesn't touch the filesystem (an MCP-only write from a Routine, for example). The bug will be invisible until production breaks.
- **Do not depend on the VPS WS bus from a local handler.** That bus is internal to the VPS api process. The local listener tier reads either the filesystem, the hook lifecycle, or the streaming substrate.
- **Do not duplicate a VPS listener locally.** If `forkComplete` exists on the VPS, it stays on the VPS. The local conductor learns about fork completions either via context-stitching (next-turn substrate read) or via the streaming relay.
- **Do not skip the heartbeat write.** A listener that fires silently is impossible to debug. Every handler ends with a `kv_store.health.<name>` write before it returns success.
- **Do not let a local watcher run without PM2.** Manual `node listener.js` will not survive a Corazon reboot or VS Code crash. PM2 with auto-start on Windows is the substrate.

---

## 9. Cross-references

- `EcodiaOS_Spec_Listeners.md` - original 2026-04-23 design brief. Superseded for substrate, current for listener semantics.
- `VPS_LISTENERS_DISPOSITION_2026-05-15.md` - per-module audit of the VPS listener tier.
- `MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` - the parent architecture doc.
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - the five-layer pattern (producer / trigger / bridge / listener / side-effect). Applies to local and VPS tiers identically.
- `~/ecodiaos/patterns/local-listener-tier-four-event-sources-2026-05-15.md` - the same routing tree codified as a triggerable pattern.
- Phase 2 Lane 06 dossier - streaming substrate that bridges the VPS event bus to Corazon.

---

## 10. Future work

- Lane 06 ships the SSE relay; once live, the local listener tier can consume `db:event` directly instead of re-querying.
- Mac mini era: the file-watcher source extends to a second host. The kv_store heartbeat per host disambiguates "watcher on Corazon" vs "watcher on Mac mini."
- A 7th listener will likely emerge from the Mac mini era: macOS Reminders / Notes / Calendar change watchers via `ScriptingBridge` are a clean fit for (2.1) on Mac mini.
- The original spec's "Finance" listener (§4.2) is intentionally deferred. The Cortex finance flow is conscious-thought work, not reflexive extraction; mis-categorising it would push money work into a Haiku Layer that the spec explicitly warns against ("money is real, always human-approved").
