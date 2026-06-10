# Autonomy Substrate Design - Scheduling + Credential Rotation

**Date:** 2026-05-26
**Status:** Design v2 - awaiting implementation plan
**Scope:** v1 covers autonomous scheduling (#1) + sequential credential rotation (#3). CDP focusless multi-tab (#2) has its own spec.
**Driver:** Tate travelling October-December 2026. EcodiaOS must run 24/7 without manual prompting.

## Revision history

- **v1 (initial)**: included active-chat-rotation observer + per-turn conversation streaming + dedicated event-router HTTP endpoint on laptop-agent + blocking-sequential scheduler loop.
- **v2**: applied first review. Cut active-chat-rotation, per-turn conversation streaming, event-router HTTP endpoint. Split scheduler into dispatch + track + stale-recovery phases. Added launch-lock + tab cleanup. Promoted IDE target + OAuth refresh from open questions to hard prerequisites.
- **v3 (this version)**: applied second review. Added MCP connectivity as 4th hard prerequisite (signal_bound/signal_done are MCP calls, the spawned chat must have laptop-agent MCP connected). Added Seed state section. Tightened brief boilerplate so signal_bound can't be skipped. Elevated manual-new-chat bypass to its own design decision. Clarified fire-shim retry strategy. Documented launch-lock scaling characteristic.

## Problem statement

EcodiaOS's primary execution substrate is interactive Claude Code chats on Corazon (Tate's laptop, always-on, plugged in, never sleeps). Today the system is reactive: chats only spawn when Tate prompts them. Anthropic Routines exist as a scheduled-firing mechanism but are capped at 15/day per account, fire in the cloud (not in the primary substrate), and depend on substrate that mostly no longer exists.

Three blockers prevent autonomous operation:

1. **No native scheduling.** Nothing on Corazon spawns CC chats at scheduled times or in response to events.
2. **CDP reliability** (covered in separate spec).
3. **Credential switching is broken.** A previous `refresh-clobber-watchdog.js` PM2 service tried to manage `~/.claude/.credentials.json` rotation and self-DOS'd the system by restoring stale tokens within 300ms of every fresh login. It was killed; no replacement exists. When tate@ caps, the system has no path to code@ or money@ except manual sign-in.

#1 and #3 couple. The scheduler picks WHICH account a chat should run on. The rotation actually swaps credentials so the chat lands on that account. Solving one without the other ships nothing.

## Hard prerequisites - must verify BEFORE writing implementation plan

These four things must be confirmed working. If any is broken, the design changes:

1. **dispatch_worker for the chosen single IDE.** Today `dispatch_worker` is wired to Cursor's `Ctrl+Alt+Shift+C`. Tate's directive is "stable only". Two paths to resolve: (a) find or define a VS Code Stable keybinding that opens a new Claude Code chat as an editor-area tab, then update `dispatch_worker` to use it; (b) use `claude` CLI invocation if the extension supports launching chat from CLI. The implementation cannot start until this is decided and the resulting dispatch primitive is verified working on VS Code Stable. If neither path works, fallback is to keep Cursor as the single IDE and treat "stable only" as a routing choice (only one IDE used, not "VS Code Stable specifically").
2. **Anthropic OAuth refresh works for Max accounts.** Hit the refresh endpoint with a real refresh_token from one of the three accounts. Confirm: endpoint URL, exact request shape, that the returned token is usable, that the refresh_token is reusable (not single-use). If refresh tokens are single-use OR expire with the access token, the cred-refresher daemon architecture changes to a headless-browser OAuth PKCE re-flow. Two days were burned in May 2026 debugging refresh-token 401s. This must be verified before committing.
3. **`coord.signal_done` exists or is built first.** The scheduler depends on this signal to know when a dispatched chat completes. Same for `coord.signal_bound`. Verify by reading `D:/.code/eos-laptop-agent/tools/coord.js`. If absent, build them as the first tasks in the implementation plan, before anything else.
4. **laptop-agent MCP auto-connects in spawned CC chats.** `signal_bound` and `signal_done` are MCP tool calls. If the dispatched chat doesn't have the laptop-agent MCP connected, every brief silently fails its signalling and every task ends up `orphaned`. Verify: open a fresh CC chat in the IDE-of-choice in the workspace `dispatch_worker` targets, check that `mcp__coord__*` tools appear in the available-tools list, run a test call. If MCP doesn't auto-connect, fix by adding laptop-agent to the workspace's `.mcp.json` (or equivalent project-local MCP config). Document the exact workspace path that gets the config so dispatch_worker always opens chats there.

## Seed state - must exist before the scheduler can run its first loop

Day-zero checklist. The implementation plan's first phase establishes all of this:

- `/Users/ecodia/PRIVATE/ecodia-creds/tate.json` exists with valid OAuth tokens for tate@ecodia.au.
- `/Users/ecodia/PRIVATE/ecodia-creds/code.json` exists with valid OAuth tokens for code@ecodia.au.
- `/Users/ecodia/PRIVATE/ecodia-creds/money.json` exists with valid OAuth tokens for money@ecodia.au.
- `os_scheduled_tasks` migration applied (new columns + extended status CHECK constraint).
- At least one seed cron row exists (suggested: `morning-briefing` daily 09:00 AEST) to validate the loop end-to-end.
- `coord.signal_bound` and `coord.signal_done` tools registered and callable on laptop-agent MCP at `http://127.0.0.1:7456`.
- The workspace path that dispatch_worker opens chats in has laptop-agent MCP wired in its `.mcp.json` so spawned chats can call `mcp__coord__*` immediately.
- VS Code Stable (or whichever IDE is selected per prerequisite #1) is running and signed in to the account currently in `~/.claude/.credentials.json`.
- PM2 daemon is running so it can supervise `cred-refresher`.

Anything missing from this list = scheduler dispatch loop will fail in observable ways. Don't start the loop until the checklist passes.

The previous `refresh-clobber-watchdog.js` incident left stale backup files at `~/.ecodia-creds/`. Confirm that path is empty (or deleted) to remove any chance of the new system being mistaken for the old one. The new path is `/Users/ecodia/PRIVATE/ecodia-creds/` and only the new system writes there.

## Goals

- Scheduled chats fire on time, every time, without manual intervention.
- Event-driven chats fire when their trigger arrives (gmail webhook, vercel deploy failed, status_board alert).
- All three Anthropic accounts (tate@, code@, money@) get used over a day, not just one.
- When one account caps, the NEXT chat to spawn lands on the next-healthiest account automatically.
- Tate's active interactive chat receives an observer signal when his current account is capping. He manually opens a new chat when convenient; the new chat lands on a fresh account because the scheduler rotated creds at spawn time.
- Zero file-watching of `~/.claude/.credentials.json`. The previous broken pattern is impossible to recreate by construction.
- Watchdog escalation: if Corazon is unreachable for >15 min, Tate gets an SMS.

## Non-goals

- Auto-spawning a successor chat that picks up an active chat's context when that chat's account caps. Architecturally fragile (no mechanism to gracefully stop a running CC chat; 20-turn snapshots lose tool state and working-file context). Out of scope for v1; Tate handles this manually with a "next account ready" observer signal as prompt.
- Per-turn conversation streaming to Postgres. The PostToolUse hook mechanism does not capture full turn boundaries cleanly. Out of scope for v1.
- Multi-IDE binding (VS Code Stable + Insiders + Cursor each on different accounts). Explicitly rejected by Tate.
- Mid-session credential swap for already-running chats. Architecturally impossible without modifying the CC extension. Out of scope.
- Second always-on machine (Mac mini, VPS executor). VPS becomes pure watchdog. Corazon is the sole executor.
- Goal-based scheduling (open-ended goals the system decomposes). Cron + delayed + chained + event-driven only in v1.

## Observed property worth noting (not a goal)

Each CC chat reads `~/.claude/.credentials.json` at LAUNCH and caches the tokens in memory. This means multiple chats CAN run concurrently on different accounts if launched with cred rotation between them. Tab A launched with tate@ tokens cached + Tab B launched with code@ tokens cached + Tab C launched with money@ tokens cached = three accounts in flight on one IDE.

The known limitation: when a chat's access_token expires (~1h), the SDK refreshes and may write new tokens back to `.credentials.json`. This could clobber a different account's tokens that another tab wrote, or clobber tokens that a NEW chat is about to read at launch. The launch-lock in the scheduler (see Component 1) protects the launch window. Mid-session refresh clobbers are accepted as a rare failure mode; the running chat with cached tokens is fine, but the next chat to launch may read clobbered tokens. Detection: failed chat exits abnormally, scheduler retries.

This means v1 effectively delivers parallel-different-accounts as a best-effort property, not a guaranteed one.

## Architecture

```
                       [Supabase Postgres]
                        os_scheduled_tasks
                       (durable queue, source of truth)
                                ▲
                                │ INSERT from MCP tools (scheduler.cron, scheduler.delayed)
                                │ INSERT from VPS fire-shims (gmail, vercel, status_alert)
                                │ INSERT from laptop-agent local producers
                                │
                                │ 30s poll
                                ▼
        ┌──────────────────────────────────────────────────┐
        │  [eos-laptop-agent on Corazon, always-on]        │
        │                                                  │
        │   ┌────────────────────────────────────────┐     │
        │   │  scheduler module                      │     │
        │   │  - Dispatch loop (30s)                 │     │
        │   │     lease, rotate, dispatch fast       │     │
        │   │     row status: active → dispatching   │     │
        │   │                  → running              │     │
        │   │  - Completion tracker (event-driven)   │     │
        │   │     listens on coord bus               │     │
        │   │     marks complete, closes tab          │     │
        │   │  - Stale-lease recovery (60s)          │     │
        │   │     dispatching > 10min → active        │     │
        │   │     running > 6h → orphaned             │     │
        │   └────────┬────────────────────┬───────────┘    │
        │            │                    │                │
        │            ▼                    ▼                │
        │   ┌────────────────┐   ┌──────────────────────┐  │
        │   │ cred-rotation  │   │ dispatch_worker      │  │
        │   │ + launch-lock  │   │ (existing, modified) │  │
        │   │ - mutex serial │   │ - one-IDE keybind    │  │
        │   │ - pick acct    │   │ - paste brief        │  │
        │   │ - atomic copy  │   │ - return tab_id      │  │
        │   │ - wait bound   │   │ - new: close_tab(id) │  │
        │   └────────────────┘   └──────────────────────┘  │
        │                                                  │
        │  [PM2-supervised]                                │
        │  cred-refresher daemon                           │
        │  - every 30min                                   │
        │  - refresh per-acct .json                        │
        │  - NEVER touches .credentials                    │
        │                                                  │
        └────────────┬─────────────────────────────────────┘
                     │
                     ▼
              [single CC-IDE on Corazon]
              new tab opens
              CC extension reads .credentials.json AT LAUNCH
              binds to current account
              runs brief
              calls coord.signal_bound (new) + coord.signal_done

[VPS ecodia-api]
  watchdog (every 5min)
    GET http://100.114.219.69:7456/health
    3 consecutive fails → sms.tate
    queue backing up (>20 overdue) → sms.tate
    cred refresh failure rows → sms.tate
    NEVER executes scheduled work itself

[VPS fire-shims]
  webhook receivers (apple-asn, github, resend, stripe, vercel, gmail-push)
    no longer POST to /api/event on laptop-agent
    INSTEAD: INSERT directly into os_scheduled_tasks via Supabase REST
    no Tailscale dependency for event delivery
```

## Components

### 1. Scheduler module - `D:/.code/eos-laptop-agent/tools/scheduler.js`

Owned by the laptop-agent process. Runs continuously inside it.

**Row states:**
- `active` - awaiting next_run_at
- `dispatching` - leased by scheduler, dispatch in flight, awaiting `coord.signal_bound`
- `running` - tab bound, chat executing, awaiting `coord.signal_done`
- `completed` - one_shot done OR cron with max_runs reached
- `failed` - dispatch failed permanently after retries
- `orphaned` - running > 6h without signal_done

**Stale-lease recovery loop (60s):**

```sql
-- dispatching too long: dispatch likely failed silently, reset for retry
UPDATE os_scheduled_tasks
SET status='active', leased_by=NULL, leased_at=NULL, retry_count=retry_count+1
WHERE status='dispatching' AND leased_at < now() - interval '10 minutes'
  AND retry_count < 3;

-- dispatching retried too many times: give up
UPDATE os_scheduled_tasks
SET status='failed', last_error='dispatch_loop_max_retries'
WHERE status='dispatching' AND retry_count >= 3;

-- running too long: orphaned, no auto-reset (someone investigates)
UPDATE os_scheduled_tasks
SET status='orphaned', last_error='no_signal_done_within_6h'
WHERE status='running' AND leased_at < now() - interval '6 hours';
```

**Dispatch loop (30s):**

```javascript
async function dispatchLoop() {
  // Pull up to 5 due rows, lease them atomically
  const rows = await db.tx(async (t) => {
    return await t.query(`
      WITH due AS (
        SELECT id FROM os_scheduled_tasks
        WHERE status = 'active' AND next_run_at <= now()
        ORDER BY priority ASC, next_run_at ASC
        LIMIT 5
        FOR UPDATE SKIP LOCKED
      )
      UPDATE os_scheduled_tasks t
      SET status='dispatching', leased_by='corazon-laptop-agent', leased_at=now()
      FROM due
      WHERE t.id = due.id
      RETURNING t.*;
    `);
  });

  // Dispatch serially, each fast (<5s end-to-end)
  // Serial because cred-rotation + tab launch must not race
  for (const row of rows) {
    await dispatchOne(row);  // never awaits chat completion
  }
}

async function dispatchOne(row) {
  await launchLock.acquire();  // in-memory mutex, serializes the rotate+launch window
  try {
    const account = await creds.pick_healthiest_account({
      preferred: row.preferred_account,
      required_headroom_minutes: 15,
    });
    await creds.rotate_to(account);
    const { tab_id } = await cowork.dispatch_worker({
      brief: buildBrief(row),
      task_id: row.id,
    });
    // Wait for the new tab to confirm it bound (~500ms typical)
    await coord.wait_for_signal_bound(row.id, { timeout_ms: 30_000 });
    await db.query(`
      UPDATE os_scheduled_tasks
      SET status='running', actual_account=$1, dispatched_tab_id=$2, leased_at=now()
      WHERE id=$3
    `, [account, tab_id, row.id]);
  } catch (err) {
    await markFailed(row, err);
  } finally {
    launchLock.release();
  }
}
```

**Completion tracker (event-driven, not polling):**

```javascript
coord.on('signal_done', async (event) => {
  // event = { task_id, status: 'success'|'fail', summary, tab_id }
  const row = await db.queryOne('SELECT * FROM os_scheduled_tasks WHERE id=$1', [event.task_id]);
  if (!row) return;  // unknown task_id, ignore

  await db.tx(async (t) => {
    if (event.status === 'success') {
      if (row.type === 'cron') {
        const nextRun = cronParser.next(row.cron_expression);
        await t.query(`
          UPDATE os_scheduled_tasks
          SET status='active', last_run_at=now(), next_run_at=$1,
              run_count=run_count+1, last_result=$2, retry_count=0,
              leased_by=NULL, leased_at=NULL
          WHERE id=$3
        `, [nextRun, event.summary, row.id]);
      } else {  // one_shot
        await t.query(`
          UPDATE os_scheduled_tasks
          SET status='completed', last_run_at=now(), last_result=$1
          WHERE id=$2
        `, [event.summary, row.id]);
      }
    } else {  // fail
      await markFailedWithRetry(row, event.summary);
    }
  });

  // Close the tab so it doesn't accumulate
  await cowork.close_tab({ tab_id: event.tab_id });
});
```

**Brief construction** wraps the row's `prompt` with mandatory boilerplate. The `signal_bound` call is the literal first instruction of the prompt body, not a header section, so the chat cannot semantically skip it as "preamble":

```
Call mcp__coord__signal_bound now with { task_id: "{row.id}" }. Do this before anything else, including reading any files or thinking about the task. This is the only way the scheduler knows you launched successfully.

Once you have signalled bound, your task is:

{row.prompt}

When you finish (whether you succeeded, partially succeeded, or failed), call mcp__coord__signal_done with {
  task_id: "{row.id}",
  status: "success" | "fail",
  summary: "<one paragraph summary of what happened, what changed on disk or in substrate, and what the next chat would need to know>"
}

You are running as a scheduled task on account {actual_account}. The scheduler will not know your task finished until signal_done arrives. If you exit without signalling, you will be marked orphaned in 6 hours and a recovery probe will investigate.
```

The signal_bound call as the literal first line (not a header section) makes it impossible to skip without disobeying the prompt directly. Modern Claude Code chats respect such direct instructions reliably; if telemetry shows missed signal_bound calls, the brief can escalate to a structured tool_use prefix.

**Schema additions to `os_scheduled_tasks`:**

```sql
ALTER TABLE os_scheduled_tasks
  ADD COLUMN IF NOT EXISTS preferred_account text,
  ADD COLUMN IF NOT EXISTS actual_account text,
  ADD COLUMN IF NOT EXISTS leased_by text,
  ADD COLUMN IF NOT EXISTS leased_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_tab_id text,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_result text;

-- Add 'dispatching', 'running', 'orphaned' to the status CHECK constraint if it exists.
```

**Failure handling:**
- `dispatch_worker` throws (CC-IDE crashed, no tab): retry up to 3x with 30s backoff via stale-lease recovery. After 3: `status='failed'`, status_board P2.
- `cred-rotation` throws `AllAccountsCappedError`: defer task `next_run_at = max(reset_times) + 1min`, release lease back to `active`, status_board P2.
- `coord.wait_for_signal_bound` times out (30s): tab opened but never signalled. Treat as dispatch failure, retry.
- `coord.wait_for_signal_done` never arrives (6h): row goes to `orphaned`. Recovery routine probes deliverable.

### 2. Cred-rotation module - `D:/.code/eos-laptop-agent/tools/creds.js`

**Functions exported:**

`pick_healthiest_account({preferred?, required_headroom_minutes?}) -> 'tate' | 'code' | 'money'`
- Fetch usage state for all three accounts via existing `coord.get_usage_state`.
- Compute combined headroom score for each (weighted: weekly_remaining * 0.6 + session_5h_remaining * 0.4).
- If `preferred` given and its headroom > `required_headroom_minutes` (default 15): return preferred.
- Otherwise: return highest-scoring account with headroom > `required_headroom_minutes`.
- All three below threshold: throw `AllAccountsCappedError` with each account's reset time.

`rotate_to(account: 'tate' | 'code' | 'money') -> {previous, current}`
- Source: `/Users/ecodia/PRIVATE/ecodia-creds/{account}.json`.
- Identify current account by reading `~/.claude/.credentials.json` (best-effort; may be 'unknown' if last refresh-write was from a different tab).
- Atomic swap: write source content to `~/.claude/.credentials.json.tmp` then `fs.renameSync` to `~/.claude/.credentials.json` (atomic on NTFS).
- Returns `{previous, current}` for logging.
- Does NOT signal, restart, or notify any running CC chat.

`current_account() -> 'tate' | 'code' | 'money' | 'unknown'`
- Reads `~/.claude/.credentials.json`.
- Identification heuristic determined during implementation. Options: jti claim in JWT payload, account_id field if present, marker added during rotate_to. Open question - resolve in writing-plans.

**launch-lock** is an in-memory async mutex in the scheduler module (not in creds.js). It serializes the window from `rotate_to` start to `coord.signal_bound` arrival, preventing concurrent dispatches from racing on `.credentials.json`.

**Scaling note:** the critical section is bounded by `coord.wait_for_signal_bound` timeout (30s). Worst case at the current `LIMIT 5` per dispatch loop is 5 × 30s = 150s of serialized dispatch under pathological cold-startup conditions. Typical is ~5s × 5 = 25s. If the LIMIT is ever raised above 5, the launch-lock becomes a bottleneck. Acceptable for v1. v2 could parallelize the launch lock by partitioning per account (3 locks instead of 1) if the throughput matters.

**Hard invariants:**
- Nothing in this module reads `~/.claude/.credentials.json` to react to changes.
- Nothing watches `~/.claude/.credentials.json` with `fs.watch` or any other mechanism.
- The only writes to `~/.claude/.credentials.json` come from `rotate_to`.
- Any future code path that "restores" the file from a backup is a regression and must be rejected in code review. Enforced via test: `expect(fs.watch).not.toHaveBeenCalled()`.

### 3. Cred-refresher daemon - `D:/.code/eos-laptop-agent/daemons/cred-refresher.js`

PM2-supervised. Runs forever. Lightweight (~50MB resident).

**Prerequisite (see Hard prerequisites #2):** OAuth refresh endpoint must be verified working before this component is built. If refresh tokens are single-use or auto-expire, this daemon's design changes to a headless-browser OAuth PKCE re-flow (much heavier, but feasible via the existing CDP substrate).

**Assumed design (refresh endpoint works):**

```javascript
// Every 30 min
for (const account of ['tate', 'code', 'money']) {
  const file = `/Users/ecodia/PRIVATE/ecodia-creds/${account}.json`;
  const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ttlSeconds = creds.expires_at - Date.now()/1000;
  if (ttlSeconds < 20 * 60) {
    try {
      const fresh = await refreshOAuthToken(creds.refresh_token);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(fresh));
      fs.renameSync(`${file}.tmp`, file);
      log(`refreshed ${account}, new TTL ${fresh.expires_at - Date.now()/1000}s`);
      await kv_store.delete(`creds.refresh_failure.${account}`);
    } catch (err) {
      log(`refresh failed for ${account}: ${err.message}`);
      const count = await kv_store.incr(`creds.refresh_failure_count.${account}`);
      if (count >= 3) {
        await kv_store.set(`creds.refresh_failure.${account}`, {
          last_error: err.message, at: new Date().toISOString()
        });
        // watchdog SMSes Tate when it sees this row
      }
    }
  }
}
```

**Hard invariants:**
- Reads + writes ONLY to `/Users/ecodia/PRIVATE/ecodia-creds/{account}.json`.
- Never reads, writes, or watches `~/.claude/.credentials.json`.
- Logs every refresh to `/Users/ecodia/PRIVATE/ecodia-creds/refresh.log` with timestamp + account + old/new TTL.

### 4. Producers - where rows in `os_scheduled_tasks` come from

**Existing MCP tools (reused):**
- `scheduler.cron(name, schedule, prompt, preferred_account?)` at `/api/mcp/cowork` and `/api/mcp/ecodia-full` (already wired). Allows any CC chat to schedule recurring work.
- `scheduler.delayed(name, delay, prompt, preferred_account?)` (same). Allows any CC chat to schedule a one-shot follow-up.
- `scheduler.chain(after_task_id, prompt, preferred_account?)` (same). Chained successor task.

**VPS fire-shims (modified):**
- Located at `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/*-fire-shim.js`.
- Previously POSTed to `/api/routines/fire`.
- v2 change: each fire-shim instead INSERTs into `os_scheduled_tasks` via Supabase REST (the VPS already has Supabase service key). Row shape:
  ```json
  {
    "type": "one_shot",
    "name": "gmail_arrived_<message_id>",
    "prompt": "<rendered brief>",
    "next_run_at": "now()",
    "priority": 2,
    "preferred_account": "tate",
    "status": "active",
    "idempotency_key": "gmail_arrived_<message_id>"
  }
  ```
- The `idempotency_key` column gets a UNIQUE constraint; double-fired webhooks dedupe at INSERT time via `ON CONFLICT DO NOTHING`.
- **Three starter event types wired in v1:** `gmail_arrived`, `vercel_deploy_failed`, `status_alert`. Their brief templates live as Markdown files at `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/templates/{event_name}.md` with `{{payload.field}}` placeholders.

**Laptop-agent local producers:**
- A small Express endpoint `POST /api/scheduler/enqueue` on laptop-agent that wraps the INSERT for local tool callers. Same Supabase write, just convenient HTTP wrapper. Used by gui/cdp tools that want to schedule follow-up work after they complete.

**No event-router HTTP endpoint.** The event-router concept from v1 design has been eliminated. Producers write directly to Postgres. Scheduler polls Postgres. One substrate. No Tailscale dependency for event delivery.

### 5. Tab cleanup

**New laptop-agent tool:** `cowork.close_tab({tab_id})`.
- Sends the close-tab keybinding to the IDE targeted at the specific tab.
- Implementation depends on IDE choice (#1 in prerequisites).
- For VS Code Stable: probably `Ctrl+W` after focusing the tab via `workbench.action.openEditorAtIndex` or similar.

**Invocation:** completion tracker calls `cowork.close_tab(dispatched_tab_id)` after marking row complete.

**Failure mode:** if close_tab fails, log and continue. Tabs accumulate but don't break correctness. The dispatch loop continues to work.

**Cleanup on scheduler startup:** on laptop-agent boot, scan `os_scheduled_tasks` for `status='completed'` rows from the last 24h that still have `dispatched_tab_id` set + tab still open. Close them. Marks them `tab_closed=true`.

### 6. Watchdog - VPS ecodia-api `src/services/corazonWatchdog.js`

Tiny service that runs on the VPS only.

**Loop body, every 5 min:**

```javascript
// 1. Health probe
const healthy = await pingLaptopAgent({timeout_ms: 10_000});
if (!healthy) {
  consecutiveFailures++;
  if (consecutiveFailures === 3) {
    await sms.tate('EcodiaOS alert: laptop-agent unreachable for 15+ min');
  }
} else {
  consecutiveFailures = 0;
}

// 2. Queue backup check
const overdue = await db.queryOne(`
  SELECT COUNT(*) as n FROM os_scheduled_tasks
  WHERE status='active' AND next_run_at < now() - interval '30 minutes'
`);
if (overdue.n > 20) {
  await sms.tate(`EcodiaOS alert: ${overdue.n} scheduled tasks overdue`);
}

// 3. Cred refresh failure check
const refreshFails = await kv_store.keys('creds.refresh_failure.*');
for (const k of refreshFails) {
  if (!alreadyAlerted(k)) {
    const v = await kv_store.get(k);
    await sms.tate(`EcodiaOS alert: cred refresh failing for ${k.split('.')[2]} (${v.last_error})`);
    markAlerted(k);
  }
}

// 4. Orphaned task check
const orphaned = await db.queryOne(`SELECT COUNT(*) as n FROM os_scheduled_tasks WHERE status='orphaned'`);
if (orphaned.n > 0) {
  await sms.tate(`EcodiaOS alert: ${orphaned.n} orphaned tasks (>6h running, no signal_done)`);
}
```

**Hard invariants:**
- Never tries to execute scheduled work itself.
- Never tries to swap credentials.
- Never tries to wake / WoL / RDP Corazon.
- Only function: detect + escalate via SMS.

### 7. Manual "New CC Chat" dispatch path

A real UX gap: if Tate opens a new chat manually via the IDE's normal keybinding, that chat reads whatever's currently in `~/.claude/.credentials.json` and the scheduler's rotation never runs. He could be opening a chat on a capped account without realising it.

Two paths in v1, decide which during implementation:

**Path A (recommended): remap the "new CC chat" keybinding to route through laptop-agent.**
- The IDE keybinding that normally opens a new CC chat gets rebound to a tiny intermediate command.
- That command POSTs to `http://localhost:7456/api/scheduler/manual_chat` on laptop-agent.
- The endpoint runs the same `pick_healthiest_account` + `rotate_to` flow as scheduled dispatches, then opens the new chat via the same `dispatch_worker` keystroke.
- Net effect: every chat Tate opens goes through the rotation path. He never accidentally lands on a capped account.

**Path B (fallback): explicit slash command in observer signal.**
- Keep the IDE keybinding as-is.
- The usage-cap observer signal (Component 8) includes an explicit instruction: "When you finish this turn, type `/rotate-and-new-chat` in any active chat. That will rotate creds then trigger dispatch_worker for a new chat. Or trigger `cowork.dispatch_worker_manual` via MCP directly."
- Manual opens that bypass the slash command are at Tate's risk; the observer will keep nagging.

Path A is cleaner but requires figuring out the right IDE-keybinding-to-HTTP-POST mechanism. Path B is fallback if A turns out to be infeasible.

### 8. Usage-cap observer (lightweight replacement for cut v1 component)

**Producer:** a small periodic check inside the laptop-agent scheduler module, every 5 min.

**Trigger condition:** the current account (per `creds.current_account()`) has headroom < 15min AND there are active CC tabs visible (not just scheduled work).

**Action when triggered:**
- Write an observer signal via existing `observer_signals` substrate:
  ```
  Current account ({current}) is capping in <N> minutes.
  Next-healthiest account ({next}) has {headroom} remaining.
  When convenient, finish your turn and open a new chat - it will land on {next} automatically.
  ```
- The signal shows up in any active CC chat's `<observer_signals>` continuity block at the start of the next turn (existing mechanism, no new wiring needed).

This is intentionally minimal. The previous v1 active-chat-rotation tried to seamlessly hand off the conversation. v2 just tells Tate the next account is ready and lets him decide when to switch.

## Data flow worked examples

### Example A: cron task fires

1. Task `morning-briefing`: `cron_expression='0 9 * * *'`, `next_run_at='2026-05-27 09:00 AEST'`, `prompt='Compose Tate's morning briefing email...'`.
2. At 09:00, scheduler dispatch loop sees row due, leases it: `status='dispatching'`.
3. `pick_healthiest_account({preferred: null})` → returns `tate` (most headroom).
4. `launchLock.acquire()` → `rotate_to('tate')` → atomic file write.
5. `dispatch_worker(brief, task_id)` → CC tab opens in the configured IDE. Tab reads `.credentials.json` at launch.
6. Tab signals `coord.signal_bound` within ~500ms. Scheduler updates row: `status='running', actual_account='tate', dispatched_tab_id='tab_abc'`.
7. `launchLock.release()`.
8. Tab runs brief. Composes email, sends via gmail MCP.
9. Tab calls `coord.signal_done({task_id, status:'success', summary:'Sent briefing'})`.
10. Completion tracker receives event. Computes `next_run_at='2026-05-28 09:00 AEST'`, sets `status='active'`.
11. Completion tracker calls `cowork.close_tab('tab_abc')`. Tab closes.

### Example B: gmail event triggers triage chat

1. Gmail push notification fires `gmail-fire-shim` on VPS.
2. fire-shim renders template, INSERTs into `os_scheduled_tasks` via Supabase REST:
   ```json
   {
     "type": "one_shot",
     "name": "gmail_arrived_abc",
     "prompt": "A new email arrived. Triage it. message_id=abc, from=kurt@coexist.com.au, subject=app rollover question",
     "next_run_at": "now()",
     "priority": 2,
     "preferred_account": "tate",
     "idempotency_key": "gmail_arrived_abc"
   }
   ```
3. Within 30s, scheduler dispatch loop picks it up. Same flow as Example A.

### Example C: tate@ approaching cap during Tate's active work

1. Tate is chatting with tab X on tate@ at 14:30.
2. At 14:32, usage-cap observer detects tate@ headroom = 12min.
3. Observer writes observer signal: `tate@ capping in ~12 min. code@ ready (4h 23min headroom). When convenient, finish your turn and open a new chat to switch.`
4. Tate sees the signal at the start of his next turn in tab X.
5. Tate finishes the turn. Decides to switch now. Triggers a manual `New CC Chat` via the IDE keybinding.
6. The new chat is dispatched through the same path as scheduled chats (or even just spawned manually; either way it reads whatever's in `.credentials.json`). If Tate's `New CC Chat` triggers laptop-agent dispatch, scheduler rotates to code@ first. If Tate opens it directly without involving laptop-agent, his existing creds (tate@) are used and he hits cap. Implementation note in writing-plans: the IDE keybinding for "new chat" should ideally go through laptop-agent so cred rotation happens. Otherwise the observer signal is just a heads-up.

### Example D: all three accounts capped

1. Scheduler tries to fire task at 22:00.
2. `pick_healthiest_account` throws `AllAccountsCappedError` with `{tate: '22:45', code: '23:10', money: '04:00 next day'}`.
3. Scheduler sets row: `next_run_at='2026-05-26 22:46'`, releases lease, status back to `active`.
4. status_board P2 row INSERTED: `'All three Max accounts capped at 22:00. Earliest reset 22:45 (tate). Scheduler resumes then.'`.
5. At 22:46, scheduler retries. Succeeds.

## Failure mode summary

| Failure | Detection | Response |
|---|---|---|
| Corazon laptop-agent crashes | VPS watchdog 3 consecutive ping fails | SMS Tate; tasks back up in Postgres; resume on laptop-agent restart |
| Scheduler module exits but laptop-agent up | Watchdog notices queue backing up >20 overdue | SMS Tate; manual restart |
| Single account refresh fails 3x | cred-refresher writes `kv_store.creds.refresh_failure.{acct}` | Watchdog reads kv_store, SMS Tate; scheduler skips that account |
| All three accounts capped | `AllAccountsCappedError` | Task deferred to earliest reset; status_board P2; auto-resume |
| dispatch_worker fails (IDE crashed) | scheduler catches exception | Retry 3x via stale-lease; then `status='failed'`, status_board P2 |
| `coord.signal_bound` never arrives (30s) | dispatchOne timeout | Treat as dispatch failure, retry |
| `coord.signal_done` never arrives (6h) | stale-lease recovery | `status='orphaned'`; recovery probe routine investigates |
| Cred file corrupted | `rotate_to` reads invalid JSON | Throw, scheduler treats account as unavailable; tries next |
| Postgres unreachable from laptop-agent | Scheduler poll fails | Retry with exponential backoff up to 30min; SMS Tate after 15min |
| Postgres unreachable from VPS fire-shim | INSERT fails | v1 strategy: rely on the webhook provider's retry policy (Gmail push retries ~3x over hours, Vercel retries ~5x with exponential backoff, Stripe retries up to 3 days). fire-shim returns 500 on Postgres failure, provider retries. If Postgres outage exceeds provider retry window, those events are lost. v2 (if needed): add local SQLite buffer + drain loop on VPS fire-shims. Document this gap in operations runbook so Tate can take action if a Postgres outage exceeds 1h. |
| Refresh-clobber regression introduced by future change | Test fails: `expect(fs.watch).not.toHaveBeenCalled()` | Code review blocks merge |
| Two concurrent dispatches race on `.credentials.json` | launch-lock serializes them | Impossible to race when both go through scheduler. If a manual cred-write happens from elsewhere, chat may read wrong account, fail, retry |
| Tab not closed after completion | startup cleanup scans for stale completed rows with open tabs | Closes them |

## Migration from existing substrate

- `os_scheduled_tasks` table: REUSED. Migration adds columns: `preferred_account`, `actual_account`, `leased_by`, `leased_at`, `dispatched_tab_id`, `retry_count`, `last_error`, `last_result`. Status CHECK extended with `dispatching`, `running`, `orphaned`.
- `schedulerPollerService.js` on VPS: STOPPED (PM2 disable). Poller logic moves to laptop-agent. VPS process becomes the watchdog.
- `cronForkDispatcher.js` on VPS: DEPRECATED.
- `scheduler.cron`, `scheduler.delayed`, `scheduler.chain` MCP tools: REUSED. They INSERT into `os_scheduled_tasks` and the new laptop-agent poller picks up.
- Anthropic Routines (`backend/routines/*.md`): KEPT but UNUSED in v1. Logic from each Routine recreated as a row in `os_scheduled_tasks` over time. No hard cutover required; Routines can keep firing until each is migrated.
- Webhook fire-shims at `backend/src/routes/webhooks/*-fire-shim.js`: REWRITTEN to INSERT into Postgres directly instead of POSTing to `/api/routines/fire` or `/api/event`. Their templates move to sibling `templates/` directory as Markdown.

## Testing strategy

1. **Unit tests** on `creds.js`: rotate_to atomicity, pick_healthiest_account with various usage states, current_account identification. Includes the regression test: `expect(fs.watch).not.toHaveBeenCalled()`.
2. **Unit tests** on scheduler dispatch loop: lease atomicity (no double-dispatch under SKIP LOCKED), stale-lease recovery transitions, retry counter increments.
3. **Integration test** with real Postgres + real laptop-agent + a mock CC tab: INSERT a one_shot row, verify scheduler picks it up, dispatches, mock tab signals bound+done, row marked complete, mock tab closed.
4. **Integration test** for cred-refresher: stub Anthropic OAuth endpoint, verify file updates + failure escalation to kv_store after 3 fails.
5. **End-to-end test** for fire-shim → Postgres → scheduler → dispatch → real CC chat → coord.signal_done → row marked complete → tab closed. Run as a daily smoke test.
6. **Load test:** insert 50 rows with `next_run_at=now()`, verify scheduler drains them within 5 minutes without duplicate-dispatches, without stale leases, without `AllAccountsCappedError` cascading wrong.

## Open implementation questions (resolve in writing-plans)

(Hard prerequisites have been promoted out of this list into their own section at the top.)

- Exact identification heuristic for `current_account()`. Are tokens identifiable by jti claim? By account_id field? By a marker we add during rotate_to?
- How `coord.wait_for_signal_bound` and `coord.wait_for_signal_done` are implemented on laptop-agent. Polling? Websocket? EventEmitter on the coord bus?
- IDE-specific implementation of `cowork.close_tab({tab_id})`. Once IDE target is decided (prerequisite #1), the keybinding/sequence to close a specific tab needs to be confirmed.
- Whether `kv_store.incr` exists or needs implementation for the cred-refresher failure counter.
- The exact rendering library for fire-shim templates (mustache? handlebars? string interpolation?). Pick simplest.
- Whether the `New CC Chat` IDE keybinding can be routed through laptop-agent so manual chat creation also gets cred rotation. If not, document Example C's note that manual chats use whatever's currently in the file.

## Out of scope / v2+

- CDP focusless multi-tab parallelism (separate spec).
- Active-chat-rotation (seamless mid-conversation account swap with context transfer). Architecturally fragile; v2 once mechanism for graceful CC chat exit + rich context capture exists.
- Per-turn conversation streaming to Postgres. v2 once a clean turn-boundary capture mechanism is identified.
- Multi-machine federation (Mac mini, second VPS executor).
- Goal-based scheduling (open-ended goals decomposed into chats).
- Per-IDE account isolation (rejected by Tate).
- Mid-session cred swap for already-running chats.
- Reflexive self-improvement of the scheduler.
- Self-healing chat-handoff for chats that didn't get a graceful close.
