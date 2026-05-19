# Design spec: Corazon worker dispatch for execute phase

**Date:** 2026-05-19
**Author:** EcodiaOS (Opus 4.7, this Insiders headless-conductor chat)
**Status:** Draft for review by ecodia-native chat + Tate
**Companion:** [2026-05-19-one-conductor-many-channels.md](2026-05-19-one-conductor-many-channels.md), [2026-05-19-ecodia-native-ios-app-design.md](2026-05-19-ecodia-native-ios-app-design.md) (sibling)

## Problem

The current architecture, post-tonight's pivot:
- **Triage** (Haiku 4.5, SDK OAuth on VPS) reads inbound envelopes + thread-mirror + status_board context. Replies directly OR escalates.
- **Execute** = spawn `claude --print --model claude-opus-4-7 --effort max` as a subprocess on the VPS. The CLI uses Tate's `code@ecodia.au` Max subscription credentials. Full doctrine + MCPs + skills loaded.

What's wrong:
1. **Single account bottleneck.** Every execute hits `code@` exclusively. The other two Max accounts (`tate@`, `money@`) sit idle for execute work even though their weekly quotas are independent. One account hitting weekly cap = all execute work blocked.
2. **No parallelism.** Tate texts two substantive things in 60s, they serialize on the VPS CLI subprocess.
3. **Subprocess context is amnesiac.** Every `claude --print` starts cold. No conversation continuity. The CLI loads CLAUDE.md + MCPs but has no native chat history across invocations.
4. **Programmatic budget posture.** Even though `claude --print` uses Max subscription (not API key), Tate's CLAUDE.md explicitly flags "everything moves to interactive or Routine paths. No production Agent SDK usage." The VPS CLI is borderline - it's subscription auth, but it's running in a non-interactive, headless, repeated-spawn shape. Interactive chat sessions on Corazon are cleaner.

## Goal

Haiku triage delegates execute work to alive Claude Code chats running on Corazon (Tate's laptop). Those chats use their respective Max subscription accounts (Insiders / Stable / Cursor instances, each potentially logged into a different account). The chats do the work autonomously, signal back when done, and Haiku then surfaces the result to Tate via the inbound channel.

Achieves:
- **3x parallelism + 3x weekly-quota runway** by distributing across `tate@` / `code@` / `money@`
- **Real chats with native history** for follow-up tasks in the same thread
- **Worker specialization** - chats with specific workspaces open are natural fits for tasks in that codebase
- **No VPS CLI subprocess** as the primary path (fallback only)
- **No collision with native iOS chat** - that work is outbound (notifyTate). This work is execute placement. Orthogonal layers.

## Non-goals

- Auto-spawning Corazon chats from a cold-laptop state (laptop must be up + IDE open + chat alive). Cold-start = fallback to VPS CLI.
- Cross-machine work distribution (no SY094 / Mac mini participation in v1).
- Worker chat persistence across Corazon reboots. When a chat closes, its registration goes stale within 30 min and next dispatch ignores it.

## Architecture

### A. Worker registry (existing primitive, augmented)

The laptop-agent already has a coord workers file-backed registry (`D:/.code/EcodiaOS/coordination/workers/`). Each Claude Code chat that registers via `coord.register_conductor` (heartbeat hook) gets a row. We extend the row with new fields for Haiku discovery:

```jsonc
{
  "tab_id": "<unique chat id>",
  "claude_port": 27199,
  "ide_name": "Visual Studio Code",
  "ide_pid": 13584,
  "ide_bridge_port": 7458,
  "workspace_root": "d:/.code/ecodiaos/backend",
  "registered_at": "2026-05-19T...",
  "last_seen_at": "2026-05-19T...",
  "in_turn": false,
  "in_turn_set_at": null,

  // NEW for dispatch:
  "account": "code@ecodia.au",        // which Max account this chat is using
  "specialties": ["ecodiaos", "backend", "node"],  // optional labels for affinity matching
  "available_for_dispatch": true,     // false = excluded from Haiku's pool (e.g. Tate's primary chat)
  "current_dispatched_task": null,    // task_id when assigned
  "dispatched_since": null            // ISO when current task was assigned
}
```

`account` + `available_for_dispatch` + `specialties` are written by the heartbeat hook at registration time. The hook detects the active account from `~/.claude/.credentials.json` (or from session env), and `available_for_dispatch` defaults true. Tate's "primary" chat (the one he's actively typing in) can set it to false via a Claude Code slash command (future) or by adding `[NO_DISPATCH]` to its initial prompt.

### B. Triage context block (new)

`_loadTurnContext` in `headlessConductor.js` gains an `alive_workers` array. Pulled from laptop-agent's `coord.list_workers` filtered to `available_for_dispatch=true && in_turn=false && current_dispatched_task=null`:

```
# Alive Corazon workers available for dispatch
- worker_a3f2 [Cursor / money@ / d:/.code/coexist] (idle 4m)
- worker_b1e8 [Insiders / code@ / d:/.code/ecodiaos] (idle 0m)
- worker_c9d1 [Stable / tate@ / d:/.code/chambers] (idle 12m)
```

This block is appended to the triage user message after the status_board block. Cost: ~200 chars typically. Haiku sees who's around + what they're best at.

### C. Dispatch tool (new, in both TRIAGE_TOOLS and EXECUTE_TOOLS)

```jsonc
{
  "name": "dispatch_to_corazon_worker",
  "description": "Delegate execute work to an alive Corazon Claude Code chat (or spawn a fresh one). Worker runs the brief autonomously using its Max subscription, calls coord.signal_done when finished. The result comes back to a fresh Haiku invocation which surfaces it to Tate. Use this INSTEAD OF escalate_to_opus when Corazon workers are available. Falls back to escalate_to_opus (VPS CLI subprocess) if no workers alive.",
  "input_schema": {
    "type": "object",
    "required": ["brief", "task_id"],
    "properties": {
      "brief": { "type": "string", "description": "Full task brief. Include WHY, WHAT (deliverable), and any references. Will be pasted into the worker chat." },
      "task_id": { "type": "string", "description": "Stable task id (e.g. uuid or descriptive slug) so the worker's signal_done can be correlated back to this dispatch." },
      "prefer_worker_id": { "type": "string", "description": "Optional tab_id to target a specific worker (e.g. workspace-affinity match)." },
      "prefer_account": { "type": "string", "enum": ["tate", "code", "money", "auto"], "description": "Optional account preference. auto = pick least-loaded." },
      "prefer_workspace": { "type": "string", "description": "Optional substring; if a worker has this in workspace_root, prefer it." },
      "dispatch_mode": { "type": "string", "enum": ["existing", "new", "auto"], "description": "existing=pick alive worker only (fail if none); new=spawn fresh tab; auto=existing then new fallback. Default: auto." },
      "ack_first": { "type": "string", "description": "Optional 1-3 word ack ('on it', 'checking') sent to Tate via inbound channel before dispatch fires." }
    }
  }
}
```

Handler behavior:
1. Resolve target worker via selection policy (see §D).
2. If no worker resolvable AND dispatch_mode != 'new': return `{ok:false, reason:'no_worker_available'}`. Caller may then fallback to `escalate_to_opus` (VPS CLI subprocess).
3. Write task record to `kv_store.cowork.dispatched_tasks.<task_id>`:
   ```jsonc
   {
     "task_id": "...",
     "envelope_idempotency_key": "...",
     "reply_channel": "sms" | "telegram" | "native",
     "reply_thread_id": "+61...",
     "worker_tab_id": "worker_a3f2",
     "worker_account": "code@ecodia.au",
     "brief_chars": 1234,
     "status": "assigned",
     "assigned_at": "ISO",
     "ack_first_sent": true | false
   }
   ```
4. Update worker's registry row: `current_dispatched_task = task_id`, `dispatched_since = now`.
5. Send `ack_first` SMS/TG if specified.
6. Deliver the brief to the worker. Two paths:
   - **Existing worker**: `coord.send_message` to `chat.<worker_tab_id>.inbox` with body `{type: 'haiku_dispatch', task_id, brief, reply_channel, reply_thread_id}`. The worker's heartbeat hook (already wired) surfaces inbox as turn prelude on its next user prompt - but autonomous dispatch means we need it to wake. Wake substrate: existing `wakeConductor` path (auto_type mode) pastes a wake prompt into the chat that contains the brief.
   - **New worker**: `cowork.dispatch_worker` (existing primitive) which spawns a fresh chat tab with the brief pre-loaded. Already works.
7. Return `{ok:true, task_id, worker_tab_id, account}` to Haiku, which then writes a `neo4j_write_episode` and exits its turn.

### D. Worker selection policy

Default policy (= `auto`):

```
1. Filter alive workers: in_turn=false, current_dispatched_task=null, available_for_dispatch=true, last_seen < 5min ago.
2. If prefer_worker_id given AND it's in the pool, pick it.
3. If prefer_workspace given AND any worker's workspace_root contains it, pick that one (workspace affinity).
4. If prefer_account given AND any worker is on that account, pick it.
5. Else pick the worker with the freshest last_seen.
6. If pool is empty:
   - If dispatch_mode='existing': return no_worker_available.
   - Else: spawn new via cowork.dispatch_worker, preferring the IDE on the least-loaded account.
```

Account-load balancing for spawning new workers: laptop-agent's `usage.pick_account` (already exists) returns the account with most headroom. Use that.

### E. The worker side - autonomous task execution

When the worker chat receives the brief (either pasted into a fresh tab, or whispered via coord inbox), it sees a structured prompt:

```
[HAIKU DISPATCH]
task_id: <uuid>
reply_channel: sms
reply_thread_id: +61404247153
ack_status: sent ("on it")

# Brief
<the actual work brief that Haiku composed>

# Hard rules
- You are autonomous. Do the work. Don't ask Tate to confirm routine actions.
- Use any tool you have. Full doctrine, all MCPs, all skills loaded.
- When done, call coord.signal_done with:
    result_summary: 1-2 sentences of outcome
    result_pointer: optional kv_store or status_board reference
    reply_for_tate: the actual text to surface to Tate via SMS/TG (already in Ecodia voice; will be sent verbatim)
- If you hit a blocker, signal_done with result_summary explaining + reply_for_tate asking the specific question.
- Em-dashes BANNED. Per sms-segment-economics, reply_for_tate <=160 GSM chars for SMS / <=4000 for Telegram / <= sensible for native.
```

The worker is just an Opus 4.7 Claude Code chat. It already has the full skill + tool surface. The only new behavior is: **call `coord.signal_done` with a `reply_for_tate` field**. The signal-back wake substrate routes that text up to Haiku.

### F. Signal-back wake path (new)

When a worker calls `coord.signal_done` with `parent_dispatch=true` (or matching `task_id` in `kv_store.cowork.dispatched_tasks.*`), the laptop-agent does an additional action:

```
POST https://api.admin.ecodia.au/api/headless/worker-done
Body: {
  task_id,
  worker_tab_id,
  worker_account,
  status: 'done' | 'error' | 'blocked',
  result_summary,
  result_pointer,
  reply_for_tate,
  duration_ms,
  reply_channel,        // from dispatched_tasks row
  reply_thread_id
}
Auth: Bearer <kv_store.creds.headless_worker_callback_bearer>
```

VPS endpoint `/api/headless/worker-done` does:
1. Validate bearer.
2. Look up `kv_store.cowork.dispatched_tasks.<task_id>` to confirm it was Haiku-dispatched.
3. Mark task `status='done'`, `completed_at=now` on the kv record.
4. Clear the worker's registry row: `current_dispatched_task=null`.
5. Invoke `processEnvelope` with a **synthetic envelope**:
   ```jsonc
   {
     "channel": "<reply_channel>",
     "from": "tate (worker-result)",
     "from_kind": "system",
     "sender_name": "Ecodia Worker",
     "thread_id": "<reply_thread_id>",
     "body": "[WORKER RESULT task_id=<id>] <reply_for_tate>\n\nresult_summary: <summary>",
     "received_at": "ISO",
     "idempotency_key": "worker-done-<task_id>",
     "source": "worker_callback",
     "worker_meta": {...}
   }
   ```
6. Haiku reads the synthetic envelope. Its system prompt (updated) knows: when `source=worker_callback`, the job is to relay `reply_for_tate` to the user via the appropriate channel using `notify_tate` (or channel-matched tool).
7. Haiku fires the reply, writes an Episode.

Why route through Haiku rather than direct dispatch the SMS from the worker-done endpoint? Because Haiku has the context-load primitive that lets it decide:
- "this result is just an ack - send it as-is"
- "this result is bigger than 160 chars, summarize for SMS + put full at kv_store reference"
- "this result conflicts with something Tate just said in another message - flag it"
- "rate-limit: Tate just got 3 SMS in 60s, this one is low priority - hold or batch"

Keeping decision authority centralized in Haiku is cleaner than spreading "should this go to Tate" logic across worker chats.

### G. Native chat coordination

Zero conflict. Specifically:
- **Native chat's `notifyTate` service**: still the outbound reply mechanism. When the result envelope reaches Haiku, Haiku calls `notify_tate({body: reply_for_tate, channel: reply_channel, thread_id: reply_thread_id})`. notifyTate picks APNs / SMS / Telegram per its existing policy.
- **Native chat's iOS app**: continues to be a new inbound channel. When the iOS app sends an inbound, it can be dispatched to a Corazon worker just like an SMS inbound. The reply path is `notify_tate({channel: 'native'})`.
- **Native chat's `liveActivityPush`**: when a worker is dispatched, the headless can fire `live_activity_update({state: 'thinking', body: <task>})`. When the worker signals done, fire `live_activity_update({state: 'done'})`. The Dynamic Island shows live progress of the dispatched task on Tate's lock screen.
- **No shared state to fight over**: dispatched_tasks kv namespace is new; worker registry is new fields on existing rows; the callback endpoint is new.

The only minor integration the native chat needs to know: when `notify_tate` is called with `body` originating from a worker callback, the deep_link should point to the relevant native app surface (status_board row, draft email, etc) so Tate can drill in. That's a small addition to the `worker-done` endpoint: it can hint a `deep_link` to notify_tate.

### H. Failure modes

| Failure | Behavior |
|---|---|
| Worker chat closes mid-task | Sweep marks worker stale → laptop-agent fires worker-done with `status='abandoned'` → Haiku surfaces to Tate: "the X worker died. Want me to retry?" |
| Worker hangs (no signal_done in 5min) | Timeout watcher fires worker-done with `status='timeout'` → Haiku decides: retry on another worker OR escalate to Tate |
| All Corazon workers busy AND dispatch_mode='auto' | Spawn new via `cowork.dispatch_worker` (existing) |
| Cowork.dispatch_worker fails (laptop off, IDE crashed) | Fallback to existing `escalate_to_opus` (VPS CLI subprocess on `code@`) |
| Account weekly cap on chosen worker | Worker's first MCP call gets 429 → worker signals done with `status='error'` → Haiku re-dispatches to a different account |
| Headless POST to /api/headless/worker-done fails | Laptop-agent retries 3x with backoff. If still fails, writes to coord inbox + Tate sees pending in next prompt prelude |
| Bearer mismatch on /api/headless/worker-done | 403. Worker's result is logged but not relayed. Critical alert. |

### I. State machine

```
   (Haiku dispatch_to_corazon_worker called)
                ↓
            pending
                ↓ (worker selected, brief delivered)
            assigned
                ↓ (worker calls signal_done)
        ┌───────┴─────────┬─────────┐
       done            error    abandoned
                          │
                          ↓
                    (retry policy)
```

`kv_store.cowork.dispatched_tasks.<task_id>` tracks current state. TTL 24h after terminal state (cleanup).

### J. Parallel limits

Cap: max **3 concurrent in-flight dispatched tasks** (one per Max account). If Haiku gets a 4th substantive inbound while 3 are running:
- Option A: queue in `kv_store.cowork.dispatch_queue.fifo` + dispatch when a worker signals done.
- Option B: spawn anyway, accept 2x load on one account.
- Option C: just escalate via VPS CLI subprocess (current path) until a worker frees up.

Recommendation: **Option A + C hybrid**. Queue up to 3 additional. If queue depth > 3, use VPS CLI subprocess for overflow. SMS Tate when overflow happens (so he knows we're saturated).

### K. Token discipline + cost

- Triage context cost: +200 chars for the alive_workers block, no big deal.
- Worker execution cost: same as Opus 4.7 max via CLI subprocess (which we already do), just on a different machine + different account. Net subscription cost is identical or lower (parallelism doesn't add cost, just speeds up wall clock).
- Signal-back HTTP cost: one POST per dispatched task. Negligible.
- Triage re-invocation on worker-done: a second Haiku call per task. Cheap.

Net: this **reduces cost pressure** because it offloads from the single `code@` account onto a 3-account pool. Each account's weekly cap is independent.

## End-to-end scenarios

### S1. Single substantive inbound, idle workers

1. Tate texts "check the latest vercel deploy on resonaverde."
2. SMS webhook → router → triage.
3. Triage sees context: 2 idle workers (Insiders/code@ and Cursor/money@).
4. Triage calls `dispatch_to_corazon_worker({brief: "check resonaverde deploy via vercel MCP, summarize status", task_id: uuid, ack_first: "checking"})`.
5. Selection: workspace-affinity miss; pick Cursor/money@ (freshest last_seen).
6. SMS to Tate: "checking".
7. Brief delivered to Cursor worker via coord inbox + wake (auto_type paste).
8. Cursor worker reads brief, calls vercel MCP, gets deploy status, calls `coord.signal_done({task_id, status:'done', reply_for_tate: "resonaverde main green. last deploy 12m ago by vercel-deploy-monitor cron. all checks passing."})`.
9. Laptop-agent POSTs `/api/headless/worker-done` with the payload.
10. VPS endpoint validates, looks up dispatched_tasks, fires synthetic envelope.
11. Haiku reads `[WORKER RESULT...]` envelope, calls `notify_tate({body: "resonaverde main green...", channel: "sms", thread_id: "+61404247153"})`.
12. Tate gets the SMS reply. Total wall time: ~30-45s.

### S2. Parallel inbounds (the big win)

1. Tate texts at t=0: "check resonaverde deploy"
2. Tate texts at t=2s: "draft a follow-up to angelica"
3. Triage for #1 dispatches to Cursor/money@. Returns "checking" SMS.
4. Triage for #2 sees Cursor/money@ now `current_dispatched_task=<uuid1>` (busy). Picks Insiders/code@. Dispatches with brief for the draft. Returns "drafting" SMS.
5. Both workers run in parallel.
6. Cursor finishes first at t=25s → "deploy green" SMS to Tate.
7. Insiders finishes at t=60s → "draft saved at kv_store.cowork.drafts.angelica-...md" SMS to Tate.

Two genuinely parallel pieces of work, two different accounts, no serialization. Current architecture would have made #2 wait for #1 to finish.

### S3. No workers alive (laptop off)

1. Inbound arrives.
2. Triage sees `alive_workers: []`.
3. Triage tries `dispatch_to_corazon_worker({dispatch_mode: 'auto', brief: ...})`.
4. Handler can't find a worker AND `cowork.dispatch_worker` fails (no IDE alive on Corazon).
5. Handler returns `{ok:false, reason:'no_corazon_workers'}`.
6. Triage falls back: calls `escalate_to_opus({reason: ..., ack_first: ...})`.
7. Existing VPS CLI subprocess path runs as today.

Graceful degradation.

### S4. Worker affinity match

1. Tate texts: "fix the typo in coexist README"
2. Triage sees alive workers including Cursor/money@ with `workspace_root="d:/.code/coexist"`.
3. Triage calls `dispatch_to_corazon_worker({brief: "...", prefer_workspace: "coexist"})`.
4. Handler picks the coexist worker - it already has the repo open, file tree indexed.
5. Worker does the fix faster + with better context than a generic worker.

### S5. Worker timeout

1. Worker takes a task. Starts running.
2. Worker hits an unexpected issue, hangs (e.g. waiting on a network call that never returns).
3. 5min watchdog on the dispatched_tasks kv record fires.
4. Laptop-agent calls `process.kill` on the worker tab (or just unregisters it) + fires `/api/headless/worker-done` with `status='timeout'`.
5. Headless tries to re-dispatch to a different worker (one retry max).
6. If retry succeeds, normal flow. If retry also times out, SMS Tate: "X task timed out twice. Backing off - flagged at status_board <id>."

### S6. The "primary chat" exclusion

1. Tate has a chat tab open in Insiders that he's actively working with. Doesn't want Haiku to dispatch to it.
2. He runs `/no-dispatch` (a slash command we'd add) in that chat.
3. The heartbeat hook flips `available_for_dispatch=false` on its registry row.
4. Haiku's triage sees that chat in workers list but filtered out of the dispatchable pool.
5. Tate keeps his focused chat focused. Other tabs stay in the dispatch pool.

### S7. Concurrent worker callback race

1. Three workers all signal_done within 200ms.
2. Three POSTs to `/api/headless/worker-done` arrive nearly simultaneously.
3. Three Haiku invocations fire in parallel, each surfacing a result.
4. Tate's phone gets 3 SMS within 1-2 seconds.

If we want rate-limiting / batching: the worker-done endpoint can check Tate's recent SMS send rate (last 60s) and batch if >2 SMS per minute. For v1, just let them through.

## What's new (build list)

### On the VPS backend:

1. **`src/services/headlessConductor.js`**:
   - Update `_loadTurnContext` to fetch alive workers from laptop-agent's `coord.list_workers` (filtered)
   - Add `alive_workers` block to triage user message
   - Add `dispatch_to_corazon_worker` tool in TRIAGE_TOOLS + EXECUTE_TOOLS
   - Handler: writes dispatched_tasks kv row, calls laptop-agent
   - Add system prompt section: "when source=worker_callback, relay reply_for_tate via notify_tate"

2. **`src/routes/headless.js`** (new):
   - `POST /api/headless/worker-done` endpoint
   - Bearer-auth via new `kv_store.creds.headless_worker_callback_bearer`
   - Builds synthetic envelope, calls `processEnvelope`

3. **`src/services/dispatchedTasks.js`** (new):
   - kv_store CRUD for `cowork.dispatched_tasks.<task_id>`
   - State machine helpers (assigned → done/error/abandoned/timeout)
   - 24h cleanup sweep

### On the laptop-agent:

4. **`tools/coord.js`**:
   - Extend `register_conductor` + `conductor_heartbeat` to accept new fields (account, specialties, available_for_dispatch, current_dispatched_task)
   - Add `coord.list_dispatchable_workers` tool (returns filtered list for Haiku's context-load - saves a round-trip)
   - Add `coord.assign_dispatch({task_id, worker_tab_id, brief})` - marks worker assigned + delivers brief via coord inbox + triggers wake
   - Modify `coord.signal_done` - if the worker's current_dispatched_task is set, fire the worker-done webhook to VPS

5. **`src/services/dispatchCallback.js`** (new on laptop-agent):
   - HTTP client that POSTs `/api/headless/worker-done` to VPS
   - Retries 3x with backoff
   - Falls back to coord inbox on persistent failure

6. **Worker brief macro**:
   - Existing `cowork.dispatch_worker` macro for new chats - already works
   - Modified to inject `[HAIKU DISPATCH]` header when called with `haiku_dispatch=true` param

### On Corazon hooks:

7. **`conductor_heartbeat.py`**:
   - Detect active account from `~/.claude/.credentials.json` + write to registry
   - Detect workspace from cursor-preview registry + write to registry
   - Handle `/no-dispatch` slash command (or env var `ECODIA_NO_DISPATCH=1`) to set available_for_dispatch=false
   - Read pending `coord.peek_inbox` for `haiku_dispatch` messages + surface as turn prelude (this is how an alive worker sees a new task)

### New status_board / kv shapes:

8. **`kv_store.cowork.dispatched_tasks.<task_id>`** - per-task state record
9. **`kv_store.cowork.dispatch_queue.fifo`** - overflow queue when 3-worker cap hit
10. **`kv_store.creds.headless_worker_callback_bearer`** - bearer for VPS → laptop-agent auth on the callback (provisioned once)

## Migration / build order

1. **Phase 1 - VPS-side shape, laptop-agent unchanged** (test on synthetic data):
   - Extend `_loadTurnContext` to query `coord.list_workers` and stub the `alive_workers` block
   - Add `dispatch_to_corazon_worker` tool with a fail-soft stub handler
   - Add `/api/headless/worker-done` endpoint + bearer auth
   - Smoke test via curl: synthetic worker-done POST → Haiku invoked → Tate gets SMS

2. **Phase 2 - laptop-agent extensions** (now real workers can be dispatched):
   - Extend conductor record with new fields
   - Add `coord.list_dispatchable_workers` + `coord.assign_dispatch` tools
   - Add `dispatchCallback.js` service
   - Hook worker-done callback into `coord.signal_done`

3. **Phase 3 - heartbeat hook upgrades**:
   - Account detection
   - Workspace + specialty labels
   - `/no-dispatch` slash command support
   - Inbox-peek for haiku_dispatch messages

4. **Phase 4 - end-to-end live test**:
   - Tate texts "test task". Haiku dispatches to alive worker. Worker echoes. Result back to Tate via SMS.
   - Tate texts two things in 60s. Verify parallelism.

5. **Phase 5 - failure mode hardening**:
   - Timeout watcher (5min)
   - Stale worker sweep
   - Account weekly-cap fallback
   - VPS CLI subprocess fallback when zero workers alive

6. **Phase 6 - native integration polish**:
   - `live_activity_update` fires on dispatch + on completion (Tate sees Dynamic Island progress)
   - `notify_tate` deep_link points to relevant artifact

## Acceptance criteria

A1. Tate texts a substantive inbound. Triage sees `alive_workers: [...]` and chooses one. Dispatches. Tate gets the ack_first SMS within 3s. Tate gets the result SMS within ~30-60s (depending on work).

A2. Tate texts two substantive things within 60s. Two workers run in parallel. Both replies land within ~30-60s of each respective inbound.

A3. Tate closes all Corazon chats. Next substantive inbound falls back to VPS CLI subprocess. Tate gets the result. No silent failures.

A4. Tate marks one chat `/no-dispatch`. Triage's alive_workers does not include it. Dispatches go to other chats.

A5. Worker chat hits a tool error and signals done with `status='error'`. Tate gets a clear SMS: "X failed because Y. Want me to retry / different approach?"

A6. Two of the three Max accounts hit weekly cap. Third account picks up all work. Tate sees graceful degradation (slightly slower, never failure).

A7. Live Activity on iOS lock screen reflects worker state (received → thinking → progress → done) for dispatched tasks (post native chat integration).

## Open questions for review by ecodia-native chat + Tate

1. **Live Activity hooks for dispatched tasks**: should `dispatch_to_corazon_worker` auto-fire a `live_activity_update({state: 'thinking', body: task_summary})`? That gives iOS lock-screen visibility into background work. Marginal cost, big UX win. Lean yes.

2. **deep_link from worker-done**: should the worker-done endpoint accept an optional `deep_link` field that `notify_tate` forwards? Useful when the worker produced an artifact (status_board row, kv draft) that Tate can drill into via the iOS app. The native chat would need to wire deep_link → app route.

3. **Worker affinity semantics**: workspace_root is the obvious signal, but should we also let chats declare arbitrary "specialty" labels (e.g. `[SPECIALTY: finance, bookkeeping]` in the initial prompt)? Adds richness but maybe over-engineering for v1.

4. **3-worker cap**: hard cap with overflow queue, or soft cap that allows 2nd dispatches to a single account when others are exhausted? Hard cap is simpler + protects accounts.

5. **No-dispatch slash command**: real `/no-dispatch` slash command on Corazon (requires writing a Claude Code skill), OR env var, OR a config file at `~/.claude/no-dispatch`? Easiest: a kv_store flag the heartbeat reads.

6. **Bearer for worker-done callback**: new kv `creds.headless_worker_callback_bearer`, provisioned once. Generated as part of build.

## Hard rules

- Em-dashes BANNED in any text the worker or Haiku produces toward Tate.
- Workers MUST call `coord.signal_done` before exit. Workers that don't are flagged + Tate gets surface ("X worker exited without signaling").
- `reply_for_tate` is the canonical Tate-facing text. Workers don't fire SMS/TG themselves - only Haiku does, after reading the result.
- No client contact from dispatched workers without Tate explicit OK in the brief.

## What this replaces

- `claude --print` subprocess on VPS becomes FALLBACK only. The new primary execute path is Corazon worker dispatch.
- The system prompt section about "PHASE 2 - Opus 4.7 max via CLI subprocess" gets updated: "PHASE 2 - dispatch to Corazon worker OR (fallback) VPS CLI subprocess."

## What this doesn't change

- Triage shape (Haiku, SDK OAuth, same context-load + tools mostly).
- Outbound reply mechanism (notifyTate from native chat handles all outbound).
- Thread mirror writes (still on every inbound + outbound).
- Status_board / Episode substrate.
- Native iOS app's inbound channel + outbound services.
