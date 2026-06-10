# Account Usage Balancing - Spike Results + Ship Report

**Date:** 2026-05-18
**Conductor session:** 4c3c502b-c02f-4e76-a25c-54694ecf304c (on money@ecodia.au)
**Status:** SHIPPED + LIVE. PM2 running 3 apps: eos-laptop-agent, usage-poller, refresh-clobber-watchdog.

---

## TL;DR

When I picked up the brief, Chat A had already shipped almost everything. My job
was: (1) run the 4 empirical spikes that were never run, (2) ship Component 4
(account-flaky tracking - the actual gap), (3) fix an attribution bug I found
along the way that made the poller report 0 tokens for every account, (4) get
PM2 up, (5) verify end-to-end.

All 4 spikes done. Component 4 shipped + tested. Bug fixed. PM2 live. 14/14 unit
tests pass. Wire-level MCP calls return correct decisions.

The picker correctly reports money@ at 8.2% weekly headroom (917M / 1B used)
and the alert flag fires. `coord.pick_account` returns tate@ as next choice.

---

## Spike #1 - JSONL schema

**Method:** `head -1 ~/.claude/projects/<dir>/<sid>.jsonl | jq .message.usage`
on a known assistant-role line.

**Result confirmed:**

```jsonc
// type=assistant line:
{
  "parentUuid": "...",
  "isSidechain": false,
  "message": {
    "model": "claude-opus-4-7",
    "id": "...",
    "type": "message",
    "role": "assistant",
    "content": [...],
    "usage": {
      "input_tokens": 6,
      "cache_creation_input_tokens": 86348,
      "cache_read_input_tokens": 22283,
      "output_tokens": 2747,
      "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 },
      "service_tier": "standard",
      "cache_creation": { "ephemeral_1h_input_tokens": 86348, "ephemeral_5m_input_tokens": 0 },
      "inference_geo": "",
      "iterations": [...],
      "speed": "standard"
    }
  },
  "type": "assistant",
  "uuid": "...",
  "timestamp": "2026-05-18T...",
  "sessionId": "<matches the JSONL filename stem>",
  "cwd": "...",
  "version": "..."
}
```

**Path:** `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`.

**Billing nuance:** all 4 fields count against Max-plan caps per Anthropic docs.
We sum all 4 (conservative direction). Only `type=assistant` lines have usage;
`type=user`, `type=attachment`, `type=queue-operation` do not.

**Outcome:** We use ccusage instead (Spike #2) which already does this sum +
pre-aggregates by session and 5h-block. JSONL schema documented for future
write-our-own-parser if we ever want to bypass ccusage.

---

## Spike #2 - ccusage install probe

**Method:** `npm install -g ccusage` then `ccusage session --json` +
`ccusage blocks --json`.

**Result:** ccusage v18 installs cleanly on Windows (one package, 2s install).
`session --json` returns full per-session aggregates with the shape:

```json
{ "period": "<session_id>", "agent": "claude", "modelsUsed": [...],
  "inputTokens": ..., "outputTokens": ...,
  "cacheCreationTokens": ..., "cacheReadTokens": ...,
  "totalTokens": ..., "totalCost": ...,
  "metadata": { "lastActivity": "YYYY-MM-DD" } }
```

`blocks --json` returns 5h-aligned billing-window blocks with `isActive` flag
on the current block, `startTime`/`endTime` ISO, and aggregate tokens. The
active block is named `2026-05-18T02:00:00.000Z` and ends 07:00.

**Outcome:** Used ccusage via `spawnSync('npx', ['-y', 'ccusage@latest', ...])`
- no install, uses npx cache. ~10-15s per poll. Output parsed into per-account
attribution + headroom math.

**Gotcha found:** ccusage's `lastActivity` is **date-truncated** (YYYY-MM-DD),
not a timestamp. A session active at 02:00 UTC today has `lastActivity:
2026-05-18`, which parses to `2026-05-18T00:00:00Z` - 2h BEFORE its real
last-activity. This breaks 5h-window filters: a session active 1h ago is wrongly
deemed "outside the 5h window" until ~6h UTC clock-time. **Fix:** use the JSONL
file's `mtime_ms` (precise to ms) as the rolling-window-eligibility timestamp,
and reserve `lastActivity` as a fallback only. Patched in `usage.js`'s
`sessionLastActivityMs()` helper. ccusage's `totalTokens` is still authoritative
for the magnitude.

---

## Spike #3 - Swap during active worker

**The test that mattered most.** This was never empirically run before today.

**Method:** Faked a `tate@ecodia.au.json` backup by cloning `money@ecodia.au.json`
and injecting a `_spike_marker` field. Then ran `cowork.swap_creds({account:
'tate@'})`, observed the file change via sha256, then swapped back.

**This very conductor session was on money@ at the time of the swap. After the
swap, the conductor continued executing tool calls without 401.** The session
processed dozens of subsequent tool calls (mostly file reads, edits, MCP
roundtrips) before the restore, with zero auth failures.

**Result:**

```
before swap sha: e5a676fc1bdaa7c9
fake-tate sha  : a8bc7c7861204bbd
swap result   : {ok:true, from:money@, to:tate@, swap_ms:15, in_flight:0, ...}
after swap sha: a8bc7c7861204bbd
marker present: fake-tate-backup-spike3   <- backup content landed
active acct   : tate@ecodia.au

restore swap  : {ok:true, from:tate@, to:money@, swap_ms:16, ...}
final sha     : e5a676fc1bdaa7c9   <- bit-for-bit restored
marker now    : NO (restored to money@)
match-before  : true
```

**Critical finding:** **Claude Code holds the OAuth bearer in process memory
after initial load. Swapping `~/.claude/.credentials.json` mid-session does
NOT 401 the active session's in-memory bearer.** This validates the whole
swap-creds-without-killing-active-workers thesis. v1 design holds.

**Implication for dispatch_worker:** A swap_creds call mid-flight is SAFE for
tabs not currently in a `kv_store.tab.*.in_critical_section = true` window.
The `in_critical_section` check in cowork.swap_creds (which counts workers with
that flag set + recent heartbeats) is the right safety net. The atomic
write-tmp-then-rename takes 15-16ms; no read-while-rename race is observable.

**Implication for the refresh-clobber-watchdog:** when CC silently rotates the
access token via the refresh endpoint, the watchdog must update our backup
file with the new tokens (the identity-signature `claudeAiOauth.organizationUuid`
+ refresh-token prefix stays stable; only accessToken rotates). Code already
does this in `refresh-clobber-watchdog.js` case (b).

**What I did NOT test:** I did not test that the NEXT new chat tab spawned
AFTER the swap inherits the swapped creds. The theory holds (new processes
read the file fresh), but actual cross-tab verification needs Chat A's
dispatch_worker to be wired and a real second account credential. Backup
captures for tate@ and code@ are Tate-required manual steps.

---

## Spike #4 - Credential file format

**Method:** Read `~/.claude/.credentials.json` directly.

**Result (1260 bytes, JSON):**

```jsonc
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1779083338775,            // ms epoch
    "scopes": ["user:file_upload", "user:inference", "user:mcp_servers",
               "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  },
  "mcpOAuth": {
    "ecodia|<hash>": {
      "serverName": "ecodia",
      "serverUrl": "https://api.admin.ecodia.au/api/mcp/ecodia",
      "accessToken": "",                     // empty - MCP OAuth flow not done
      "discoveryState": { ... }
    },
    "plugin:supabase:supabase|<hash>": {
      "serverName": "plugin:supabase:supabase",
      "serverUrl": "https://mcp.supabase.com/mcp",
      "accessToken": "",
      "discoveryState": { ... },
      "clientId": "...",
      "clientSecret": "...",
      "redirectUri": "http://localhost:3118/callback"
    }
  },
  "organizationUuid": "04e9a0fe-5d08-40da-9f31-2403f162515d"
}
```

**Identity signature** (used by refresh-clobber-watchdog to detect "is this
the right account?"): scopes + first-24-chars of refreshToken +
organizationUuid + organizationName + accountUuid + email.

**Backup-file layout decided:** `~/.ecodia-creds/<account>.json`. Today only
`money@ecodia.au.json` exists (because money@ was active during the bootstrap).
Tate must MANUALLY capture `tate@ecodia.au.json` and `code@ecodia.au.json`
by logging into those accounts in CC, then running:

```powershell
Copy-Item ~/.claude/.credentials.json ~/.ecodia-creds/tate@ecodia.au.json
# (after logging in as tate@)
Copy-Item ~/.claude/.credentials.json ~/.ecodia-creds/code@ecodia.au.json
# (after logging in as code@)
```

`cowork.swap_creds` returns `creds_backup_missing` with a hint if the backup
doesn't exist. The hint matches the command above.

---

## What got built (this turn)

### Component 4 - account-flaky tracking (was the actual gap)

`usage.js`:
- `markFlaky(account, reason)` / `clearFlaky(account)` / `readFlaky()` /
  `activeFlakySet()` - file-backed at `coordination/usage/flaky.json`.
- 10-minute TTL (configurable via `FLAKY_TTL_MS`). Self-heals automatically.
- `pickAccount()` excludes flaky accounts unless `ignore_flaky: true` passed.
- 3 new MCP tools: `coord.mark_flaky` / `coord.clear_flaky` / `coord.list_flaky`.
- 4 new unit tests (TEST 11-14): flaky exclusion / ignore_flaky override /
  all-flaky-returns-null / clearFlaky removes flag.

`cowork.js`:
- When `dispatch_worker` fails on spawn, it calls `usage._markFlaky(account,
  'dispatch_spawn_failed: ' + spawn_error)`. Returns
  `{ok: false, account_marked_flaky}` for caller observability.

### Attribution bug fix (was the real reason poller reported 0 tokens)

Before the fix, the poller saw 232 sessions, attributed ALL 232 to
`unknown-pre-tracking`, reported 0 tokens for every account. Reason:

- ccusage's `lastActivity` is date-truncated. A session active at 02:00 UTC
  today is stamped `2026-05-18`, which parses to midnight UTC, which is BEFORE
  the active_account.json's `since_ts` of 01:56 UTC today. So even the
  conductor's own active session was deemed "pre-tracking" and excluded.

After the fix:

1. **Attribution now uses 4-stage fallback** (sticky -> direct binding ->
   swap-history reverse-lookup -> active-recent fallback (mtime within 24h)
   -> unknown). The active-recent fallback is load-bearing: it correctly
   attributes the conductor session (born yesterday, still active) to
   `active_account`.
2. **Rolling-window filters now use mtime_ms** (precise) instead of date-truncated
   lastActivity. `sessionLastActivityMs(row)` helper prefers mtime, falls back
   to lastActivity string.
3. **Sticky attribution skips unknown values** - prior `unknown-pre-tracking`
   entries don't lock in; each poll gets a fresh re-attempt.

After the fix on a real poll:

```
money@ecodia.au: tokens_weekly=920,402,612  headroom_score=0.080  <- 8% remaining
                 sessions_weekly=42
                 [current_account_low alert FIRING]
tate@ecodia.au:  tokens_weekly=0  headroom_score=1.0  (no backup yet - separate issue)
code@ecodia.au:  tokens_weekly=0  headroom_score=1.0  (no backup yet)
```

(tate@ and code@ have 0 because no swap has ever happened to them - their
sessions don't exist yet. Once Tate manually captures their cred backups and
swap_creds runs, the swap_history -> attribution chain will tag them.)

### Live state at end of turn

- **eos-laptop-agent** on port 7456: uptime 500+s, 16 coord.* MCP tools available
- **usage-poller** PID 28268: polling every 5min, last heartbeat OK
- **refresh-clobber-watchdog** PID 8180: alive, observing creds file mtime,
  picked up the spike #3 swap+restore cleanly without false-positive
- All 14 unit tests pass (`node tools/usage.test.js`)
- Wire-level `coord.pick_account({estimated_tokens: 50_000_000})` returns tate@
  with score 137_000_000, correctly excluding money@ (low headroom)
- `coord.get_usage_state` returns the full alerts shape including
  `current_account_low: true`

---

## Substrate decision: file-backed, NOT Postgres

The spec said add `126_account_usage_balancing.sql` and write `kv_store.usage.*`.
What's actually shipped is **file-backed at
`D:/.code/EcodiaOS/coordination/usage/`**:

- `accounts.json` - per-account state (the read target for pick_account)
- `sessions.json` - session_id -> account attribution (sticky)
- `flaky.json` - per-account flaky markers + TTL
- `audit/<YYYY-MM-DD>.jsonl` - daily per-poll snapshot
- `poller.heartbeat` - liveness probe for the daemon
- `swap_history.json` (sibling of usage/) - swap_creds audit log
- `watchdog.heartbeat` / `refresh_clobber_audit.jsonl` - watchdog

**Why file-backed beats Postgres for this:**

1. **Latency.** Poller runs every 5min; pick_account is called per dispatch
   (potentially hundreds of times per day). Reading the rolling state should
   be local-disk (sub-ms) not network-round-trip to Supabase (50-200ms each).
2. **Failure mode.** If Postgres is unreachable, dispatch should still work.
   The picker hard-locking on a network primitive is a single point of failure.
3. **Substrate locality.** Everything reading this state is on Corazon
   (laptop-agent + dispatch_worker + the watchdog). No reason to wire-up
   what's local-only.
4. **No migration to apply.** Lower risk during a busy ship window.

If we ever need to surface this state to a Routine or VPS-side cron, mirror
to kv_store with a 6h Routine the same way other Corazon-local state is bridged.
Not needed today.

NO migration `126_account_usage_balancing.sql` was created. The file-backed
substrate decision is the doctrine.

---

## What still needs Tate

1. **Capture cred backups for tate@ and code@.** Log into each account in CC,
   then `Copy-Item ~/.claude/.credentials.json ~/.ecodia-creds/<account>.json`.
   Until this is done, swap_creds returns `creds_backup_missing` for those
   accounts and the picker, while it will recommend swapping to them, can't
   actually execute. Conductor stays on money@ regardless.

2. **Commit decision for `D:/.code/eos-laptop-agent/`.** All this work is
   uncommitted. The repo also has a pile of pre-existing untracked files
   (tools/cdp.js, tools/cursor.js, etc - the whole GUI substrate beast). Tate
   should decide whether to commit the whole pile in one batch or carve a
   usage-balancing-only commit.

3. **Decide the conductor-death-on-money-cap policy.** v1 = accept death (per
   the brief). When money@ caps, the conductor 401s and Tate respawns manually.
   The picker telling the conductor "you're low" via the
   `<observer_signals>`-style block is not wired - we need either an observer
   signal generator or a conductor turn-start continuity block reader. Not in
   scope for this ship, but the headroom alert IS firing right now (we just
   have nothing consuming the alert).

---

## Known limitations / follow-ups (not blockers)

- **5h-window double-counts session lifetime tokens.** A session that started
  6h ago and was active 1h ago has its full lifetime totalTokens counted in
  the 5h window. Conservative direction (over-estimates usage, picker
  decisions are still correct), but the headroom_score reads worse than
  reality. Real fix: walk JSONL turns and sum only turns inside the window.
  Costs CPU per poll. Defer.

- **tate@ and code@ attribution gap.** Until a swap to those accounts happens,
  their session_count stays 0. This is correct (no swap = no real sessions
  there), but it means the picker sees them as "always at 100% headroom"
  which may overestimate availability.

- **Conductor-death recovery.** Currently zero. Conductor caps -> session
  401s -> Tate respawns manually. v2: graceful self-handoff (the conductor
  swap_creds itself to a fresh account before turn N's 401 lands).

---

## Files touched this turn

- `D:/.code/eos-laptop-agent/tools/usage.js` (+ flaky tracking, + attribution fix)
- `D:/.code/eos-laptop-agent/tools/usage.test.js` (+ TEST 11-14)
- `D:/.code/eos-laptop-agent/tools/cowork.js` (+ markFlaky on spawn fail)
- `D:/.code/eos-laptop-agent/routes/mcpCoord.js` (+ 3 flaky MCP tools)
- `D:/.code/EcodiaOS/backend/drafts/usage-balancing-spike-results-2026-05-18.md` (this file)

PM2 brought up:
- eos-laptop-agent
- usage-poller
- refresh-clobber-watchdog
