---
triggers: cred-rotation, cred-switching, rotate_to, current_account, pick_healthiest_account, multi-account-routing, CREDS_DIR, claude-max-account, cred-refresher, account-switching, laptop-agent-mac-port, multi-account-credit-state-model
status: active
---

# Credential rotation now ships on Mac (was Windows-only no-op for the entire Mac-port window)

**Rule.** Multi-account Claude Max credential switching via `creds.rotate_to` /
`creds.current_account` / `creds.pick_healthiest_account` on the laptop-agent works
end-to-end on the Mac mini as of 2026-06-08. Three load-bearing bugs were silently
no-opping the entire rotation surface throughout the Mac-day window. All three are
patched. Future reaches for "the scheduler should pick the least-loaded account" or
"rotate creds before this fire" are now valid; previously they returned `current-process`
and rotation never happened.

**Why this matters.** The 24x7 autonomy substrate plan (Africa Oct-Dec 2026) assumes the
scheduler will pick the healthiest of three Max accounts (`tate@`, `code@`, `money@`)
per cron fire so a single account's 5h or weekly cap never blocks the substrate. With
rotation a no-op, every cron fire was burning tate@ tokens; the other two accounts'
headroom was theoretical. Tate verbatim 2026-06-08: "the credentials switching that we
have still never actually successfully built." It worked in tests on Corazon and never
worked on the Mac.

**How to apply.** When touching the rotation substrate, the bug pattern is "Windows
default path silently wrong on Mac." Search for the same shape in adjacent daemons
before declaring a port complete.

## The three bugs (all in `/Users/ecodia/.code/eos-laptop-agent/`)

### 1. `tools/creds.js` - `CREDS_DIR` default is Windows-only

```js
// before (line 26)
const CREDS_DIR = process.env.CREDS_DIR || 'D:/PRIVATE/ecodia-creds'
```

On Mac `fs.existsSync('D:/PRIVATE/ecodia-creds')` is false, so `pick_healthiest_account`
returns `'current-process'` (the no-rotation fallback at line 110-116), and `rotate_to`
no-ops. The Mac-day no-rotation fallback was correct hedging; the bug is that it
fires unconditionally because the default path is unreachable, not because the user
opted out.

**Fix.** Platform-aware default:

```js
const CREDS_DIR = process.env.CREDS_DIR || (
 process.platform === 'win32'
 ? 'D:/PRIVATE/ecodia-creds'
 : path.join(os.homedir(), 'PRIVATE', 'ecodia-creds')
)
```

### 2. `daemons/cred-refresher.js` - same `CREDS_DIR` default + Windows dotenv path

`require('dotenv').config({ path: 'D:/PRIVATE/ecodia-creds/supabase.env' })` silently
no-ops on Mac. SUPABASE_URL + SUPABASE_SERVICE_KEY then unset; `defaultKvWriter`
escalation to `creds.refresh_failure.<account>` is skipped. The daemon's own
`CREDS_DIR` default has the same Windows-path bug.

**Fix.** Compute the default once at module top, then use it for both the dotenv
path and the CREDS_DIR default. Both paths are now mac-aware.

### 3. `tools/creds.js::rotate_to` - function signature does not match agent dispatcher shape

```js
// before
exports.rotate_to = async function (account) { ... }
```

The laptop-agent `/api/tool` dispatcher passes the full `params` object as the first
argument to every tool function. Most tools destructure (`async function ({ x }) {}`),
but `rotate_to` took a positional string. The dispatcher then called
`rotate_to({account: 'code'})` → `account === {account: 'code'}` → `ACCOUNTS.includes`
fails → `unknown account: [object Object]`.

**Fix.** Accept either shape (object with `.account`, OR a bare string for CLI/test
callers):

```js
exports.rotate_to = async function (accountOrParams) {
 const account = (accountOrParams && typeof accountOrParams === 'object')
 ? accountOrParams.account
 : accountOrParams
 ...
}
```

## Why this took until 2026-06-08

The Mac-day fallback (`current-process` when CREDS_DIR doesn't exist) was correct
hedging for an ungrounded transition but it silenced the diagnosis. `pick_healthiest_account`
always returned `current-process`, `rotate_to('current-process')` always succeeded as a
no-op, and `current_account` returned `'unknown'`. There was no error, no exception,
no kv_store escalation - just silent absence of rotation. The dispatcher signature
mismatch only surfaces once the path bug is fixed and `rotate_to` is actually called
with a real account name. The two bugs masked each other.

## Belt-and-braces: launchd plist env override

`ecosystem.config.js` is dead substrate on Mac because the agent runs under launchd
(`au.ecodia.laptop-agent.plist`), not pm2. The plist now sets `CREDS_DIR` +
`REFRESH_LOG_PATH` explicitly. Even if a future regression reverts the code default
to the Windows path, the env override holds the line.

## How to apply (verification protocol)

After any future change to the cred-rotation substrate:

```bash
AGENT=/Users/ecodia/.code/ecodiaos/backend/scripts/agent
$AGENT creds.current_account '{}' # expect "tate"|"code"|"money", never "unknown"
$AGENT creds.pick_healthiest_account '{"required_headroom_minutes":0}' # expect short-form name, never "current-process"
$AGENT creds.rotate_to '{"account":"code"}' # expect {previous, current}, current must equal "code"
md5sum ~/.claude/.credentials.json ~/PRIVATE/ecodia-creds/code.json
$AGENT creds.rotate_to '{"account":"tate"}' # ALWAYS restore the live interactive account before exit
```

The md5 of the live credentials must match the per-account file after rotation. If it
does not, the rotation wrote a stale or wrong file. If `current_account` returns
`"unknown"`, the live OAuth access token does not match any per-account file - 
investigate before rotating.

**ALWAYS rotate back to the account hosting the live interactive Claude Code session
before the verification script exits.** Leaving the live session pointed at another
account's tokens forces Tate to re-login.

## Live state (2026-06-08 ship)

- `current_account` returns the short-form account name correctly on Mac.
- `pick_healthiest_account` returns highest-headroom short name when usage data is
 available, `'current-process'` only when CREDS_DIR is genuinely empty.
- `rotate_to` accepts `{account: "tate"|"code"|"money"}` from the agent dispatcher.
- All three per-account files exist at `/Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json`,
 each carrying a distinct OAuth credential set (verified by md5 distinctness).
- The agent runs under launchd, not pm2. `ecosystem.config.js` was updated for
 hygiene but is not the active config; the plist is.

## Anti-patterns

- Do NOT add a `CREDS_DIR` default that picks a path based on `__dirname` or relative
 to the agent install dir. The canonical location is the user's `PRIVATE` store, not
 inside the agent repo, because the agent repo is git-tracked and the creds are not.
- Do NOT write a fresh OAuth dance into `rotate_to`. Rotation is a file swap, not a
 token request. The OAuth refresh is `cred-refresher.js`'s job (separate daemon).
- Do NOT call `rotate_to` from the live interactive Claude Code session as anything
 other than a verification probe. The live session's refresh_token is single-use;
 rotating away from `tate` (or whichever account hosts the live session) and back
 during a verification cycle is safe, but rotating away mid-task without rotating
 back forces a re-login.
- Do NOT depend on `ecosystem.config.js` env on Mac. The agent runs under launchd.
 Mirror any env change into the plist or it has no effect.

## Real-world testing surfaced two more layers (all now shipped 2026-06-08)

### Layer 4: ccusage hard-coded Windows path

`tools/usage.js::CCUSAGE_CLI_JS` and `COORD_ROOT` were Windows-only paths.
`usage.poll_now` returned a 500 with "Cannot find module" on Mac, so
`accounts.json` was empty, every account looked like infinity headroom, and
`pick_healthiest_account` deterministically returned tate (alphabetic first).
Fix in commit `8b2cf9f`: platform-aware defaults plus `npm install -g ccusage`.

### Layer 5: dual COORD_ROOT seam between the agent and the daemons

The agent's `.env` overrides `COORD_ROOT=/Users/ecodia/.ecodiaos/coordination`
via dotenv at startup. The cred-rotation pattern's first daemon plists set
`COORD_ROOT=/Users/ecodia/.code/ecodiaos/coordination` (the in-code default).
Result: agent and daemons wrote to two different `accounts.json` files. The
agent's `pick_healthiest_account` read the agent-written one (stale), while
the daemon refreshed the OTHER one (fresh). pick_healthiest then returned
"tate" with full-headroom defaults because it never saw the daemon's real
poll results.

The canonical Mac path is `~/.ecodiaos/coordination` (per the agent's `.env`
line 9). Both daemon plists now set `COORD_ROOT=/Users/ecodia/.ecodiaos/coordination`
explicitly to match.

### Layer 6: cred-refresher live-session detection

The daemon at `daemons/cred-refresher.js` correctly skips the account hosting
the live interactive Claude Code session ("[cred-refresher] skipped tate -
active interactive session owns its refresh") to avoid the 2026-05-28
single-use refresh_token collision. Verified live on the first daemon tick.

### Layer 7: per-account refresh_token hygiene

`code.json`'s refresh_token was invalid at first run ("HTTP 400 invalid_grant").
That account was used in another CC session that already burned the
single-use refresh_token. Operational fix: have Tate re-login Claude Code as
code@ to re-seed `code.json` with a fresh refresh_token. Not a substrate
bug; a per-account hygiene step.

## Substrate that landed under launchd

| Service | Plist | Reads/Writes |
|---|---|---|
| `eos-laptop-agent` | `~/Library/LaunchAgents/au.ecodia.laptop-agent.plist` | rotates `.credentials.json`; reads `~/.ecodiaos/coordination/usage/accounts.json` |
| `eos-cred-refresher` | `~/Library/LaunchAgents/au.ecodia.cred-refresher.plist` | refreshes OAuth tokens in `~/PRIVATE/ecodia-creds/{tate,code,money}.json` every 30 min; skips live session |
| `eos-usage-poller` | `~/Library/LaunchAgents/au.ecodia.usage-poller.plist` | polls `ccusage session --json` every 5 min; writes `~/.ecodiaos/coordination/usage/accounts.json` |

All three under launchd, NOT pm2 (per [[pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27]]).
`ecosystem.config.js` is preserved for hygiene + reference, but is dead substrate on Mac.

## Operational follow-up

- The `cred-refresher.js` daemon is NOT currently running on the Mac. The plist
 launches the agent (`index.js`) only; pm2 is absent. Access tokens will expire on
 their 8h cadence with nothing refreshing them. Status_board row tracks the
 daemon-launch ship.
- `usage-poller.js` likewise not under daemon supervision; `pick_healthiest_account`
 has no live usage data so it currently always returns the same account.

**Origin.** Tate verbatim 2026-06-08 in the patterns-index-regen worker tab
(`tab_1780878019677_b0dccefd`) after the cron prompt rewrite + tab-close diagnosis:
"really important... which is the credentials switching that we have still never
actually successfully built." Diagnosis + three-bug fix + verification end-to-end
shipped in the same tab arc. Commit hash to follow.

**Cross-refs.**
- [[cred-rotation-must-propagate-to-all-consumers]]
- [[cred-switcher-first-when-multi-account-breaks]]
- [[claude-max-account-routing-is-vscode-extension-driven]]
- [[multi-account-credit-state-model]]
- [[24x7-autonomy-architecture-invariants-2026-05-27]]
- [[pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27]]
- [[laptop-agent-helper-not-inline-token-load]]
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]]
- [[supabase-access-via-org-pat-local-store-2026-05-20]]

## Layer 8 (the real one): Mac Claude Code reads Keychain, not .credentials.json

Layers 1-7 were the credential-rotation substrate as designed for the
Windows model: ~/.claude/.credentials.json IS the file Claude Code reads,
so file-swap rotation changes the authenticated account. That model is
wrong on Mac.

The empirical proof (2026-06-08 12:30 AEST): Tate logged into code@ then
money@ via the Claude Code UI. Both logins changed the macOS Keychain
entry (security find-generic-password mdat moved each time) and left
~/.claude/.credentials.json completely unchanged (mtime stuck at 11:42).
The Mac binary used the Keychain token regardless of what the file said.

Fix in commit fd3ce3c: rotate_to and current_account now use the macOS
Keychain on darwin via the `security` CLI. Per-account files at
/Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json remain the
canonical backup store; the rotation reads them and writes the content
to Keychain instead of to .credentials.json.

### One subtle pitfall worth knowing

`security -w` silently hex-encodes the stored blob if the input contains
embedded newlines or non-printable bytes. A hex-encoded blob breaks
Claude Code's read (it does not parse as JSON). The fix: minify the JSON
via JSON.stringify(JSON.parse(...)) before passing to security. Verified:
pretty-printed tate.json (with internal `\n`'s) round-tripped as hex
junk; minified content round-trips byte-clean.

### What the new state model looks like

  Anthropic auth source: macOS Keychain (service "Claude Code-credentials",
    account "ecodia")
  Backup store: /Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json
  Live mirror (vestigial): ~/.claude/.credentials.json (best-effort mirror
    so cred-refresher's live-session detection still works)
  Rotation: rotate_to(account) reads per-account file, writes to Keychain,
    mirrors to .credentials.json. Returns {previous, current, target: 'keychain'}.
  Identity: current_account() reads Keychain blob, hash-matches accessToken
    against per-account files, returns short name or "unknown".

### What still needs Tate's hands

- code@ refresh_token is invalid (single-use was burnt before transfer).
  Tate's UI re-login to code@ regenerates it. After re-login, sync the
  Keychain blob back to code.json with
    security find-generic-password -s "Claude Code-credentials" -a "ecodia" -w > code.json
- cred-refresher writes refreshed access tokens back to the per-account
  file only. When the refreshed account IS the live Keychain identity,
  the refresher should ALSO update the Keychain so the live session
  picks up the fresh token. Not yet implemented; next ship.

## Layer 9: rotation safety gate (only switch when no chats are working)

Tate verbatim 2026-06-08 after the first Keychain rotation kicked his
running chats out with 401s: "I never wanted multi account parallelism.
It was always just to switch when a usage cap was approaching. So what
we really need to do is just make sure we switch when no chats are
open/working. Then all ones after that will use the new creds."

On Mac the macOS Keychain entry `Claude Code-credentials/ecodia` is a
single shared resource across every Claude Code process on the machine.
Any rotation forcibly affects every other running session.

Fix (commit 4cf476a + scheduler patch ff7b1e8):
- `creds._countActiveWorkers(excludeTabId)` reads
  `~/.ecodiaos/coordination/workers/` and counts files lacking
  `terminated_at`.
- `creds.rotate_to` now accepts `{account, force?, caller_tab_id?}` and
  refuses with `{deferred: true, reason: 'active_workers_present',
  active_count, active_tabs}` when other workers are present. Same-account
  rotation bypasses the gate (it's a no-op).
- `scheduler.dispatchOne` detects the deferred result, logs it, and
  dispatches the cron fire on the currently-authenticated account. The
  next cron fire retries rotation when the registry is idle.

This gives Tate exactly what he asked for: rotation only fires when no
other chats are working, all subsequent chats use the new creds.

### What to do when you actually want to rotate

The safety gate's `force: true` is meant for the deliberate human-driven
switch, never for autonomous dispatch. To rotate when capping out:
1. Wait for the registry to drain (close active worker tabs).
2. Call `creds.rotate_to({account: '<name>'})` without force; gate passes.
3. Or pass `force: true` if you're knowingly accepting the 401 fan-out.

### What to do when you want to capture a fresh Keychain blob

Each time Tate logs into an account via the Claude Code UI, the Keychain
gets a fresh refresh_token and access_token. To save them back into the
per-account file (so the cred-refresher can keep them alive):

```bash
security find-generic-password -s "Claude Code-credentials" -a "ecodia" -w > ~/PRIVATE/ecodia-creds/<account>.json
```

The blob is already minified JSON; no transformation needed.
