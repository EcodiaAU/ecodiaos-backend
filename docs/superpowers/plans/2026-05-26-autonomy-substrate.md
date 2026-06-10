# Autonomy Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the autonomous scheduling + sequential credential rotation substrate so EcodiaOS spawns scheduled and event-driven CC chats on Corazon without manual prompting, rotating Anthropic accounts as caps hit.

**Architecture:** A scheduler module inside `eos-laptop-agent` polls `os_scheduled_tasks` in Supabase Postgres every 30s, rotates `~/.claude/.credentials.json` to the healthiest account, calls `dispatch_worker` to spawn a CC chat tab in the configured IDE, and tracks completion via `coord.signal_done`. A PM2-supervised refresher daemon keeps three per-account OAuth tokens fresh in `/Users/ecodia/PRIVATE/ecodia-creds/`. VPS fire-shims write directly to Postgres for event-driven triggers. VPS watchdog SMSes Tate on substrate failures.

**Tech Stack:** Node.js (laptop-agent + VPS backend), plain Node test convention (`node tools/X.test.js`), Express HTTP, Supabase Postgres with `FOR UPDATE SKIP LOCKED` leasing, PM2 process supervision, atomic `fs.renameSync` for cred swaps.

**Source spec:** `/Users/ecodia/.code/ecodiaos/backend/docs/superpowers/specs/2026-05-26-autonomy-substrate-design.md`

---

## Notes for the executing engineer

- **Em-dashes are banned** in this codebase (the U+2014 character). Use hyphens or restructure. If you author code comments or commit messages, do not type that character. Validate before commit: `grep -c $'\xe2\x80\x94' <file>` must return 0.
- **Test convention:** plain Node, no jest. Pattern: `tools/X.test.js`, run with `node tools/X.test.js`. Exit code 0 means pass. Mock `fs` by monkey-patching, see `tools/usage.test.js` for the canonical example.
- **Working directory:** the canonical laptop-agent is at `D:/.code/eos-laptop-agent/` (NOT the stripped in-repo copy at `/Users/ecodia/.code/ecodiaos/backend/laptop-agent/`).
- **Cred file location:** `/Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json`. The path `/Users/ecodia/PRIVATE/` is the user's private store, already excluded from filesystem tools by `.blocked-paths`.
- **Refresh-clobber-watchdog.js MUST stay deleted.** It still exists on disk at `D:/.code/eos-laptop-agent/daemons/refresh-clobber-watchdog.js`. Task 0.6 removes it. Its existence is a regression. Any code path that watches `~/.claude/.credentials.json` is a regression.
- **Commit cadence:** commit after every passing test step or after every coherent code change. Frequent commits. Conventional commit prefixes: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
- **Plan files updated as you go:** when you finish a step, tick the checkbox. When you finish a phase, append a brief findings note to `/Users/ecodia/.code/ecodiaos/backend/docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md` so subsequent phases know what was decided.
- **Phase 0 is mandatory and resolves real unknowns.** Do not skip it. Phases 1+ assume Phase 0 outcomes are recorded in the findings doc.

---

## Phase 0: Verification of hard prerequisites + seed state

This phase has no production code. It resolves the four spec prerequisites and prepares the seed state. Output: `docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md` recording every decision.

### Task 0.1: Inventory existing coord + cowork + usage tools

**Files:**
- Read: `D:/.code/eos-laptop-agent/tools/coord.js`
- Read: `D:/.code/eos-laptop-agent/tools/cowork.js`
- Read: `D:/.code/eos-laptop-agent/tools/usage.js`
- Create: `/Users/ecodia/.code/ecodiaos/backend/docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md`

- [ ] **Step 1: Read coord.js and record what coord tools currently exist**

Read the file. List every exported tool name and its signature. Especially note whether these exist:
- `signal_bound` (or `signal_ready` or similar launch-confirmation signal)
- `signal_done` (or `signal_complete`)
- `wait_for_signal_bound` (listener side)
- `wait_for_signal_done` (listener side)
- Any pub/sub or EventEmitter pattern that lets a server-side consumer subscribe to coord events

- [ ] **Step 2: Read cowork.js and record dispatch_worker signature + IDE target**

In particular: which IDE does it target? What keybinding does it send? Does it return a `tab_id`? Is there an existing `close_tab` function?

- [ ] **Step 3: Read usage.js and record cap-state API surface**

Look for `get_usage_state`, `pick_account`, or any per-account headroom calculation. Record the data shape (5h_remaining_ms, weekly_remaining_ms, reset_at, etc).

- [ ] **Step 4: Create findings doc with sections for each prerequisite**

Create `/Users/ecodia/.code/ecodiaos/backend/docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md` with this structure:

```markdown
# Autonomy Substrate - Phase 0 Findings

## Inventory

### coord.js tools that exist today
- (list each)

### cowork.dispatch_worker signature
- target IDE: ...
- keybinding: ...
- returns: ...

### usage.js cap-state API
- function: ...
- returns shape: ...

## Prerequisite #1: IDE target decision

(filled in Task 0.4)

## Prerequisite #2: OAuth refresh endpoint

(filled in Task 0.3)

## Prerequisite #3: coord signal tools

(filled in Task 0.2)

## Prerequisite #4: MCP auto-connection in spawned chats

(filled in Task 0.5)

## Seed state checklist

(filled in Task 0.6 - 0.9)
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
git commit -m "docs: open phase 0 findings tracker for autonomy substrate"
```

### Task 0.2: Verify or build coord.signal_bound + coord.signal_done

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/coord.js` (only if signal_bound/signal_done don't exist)
- Update: findings doc with decision

- [ ] **Step 1: Probe whether signal_bound exists**

Use the MCP tool surface from any open CC chat. Call `mcp__coord__signal_bound` with a test task_id. If the tool name is unrecognised, it doesn't exist.

Record the outcome in findings doc under "Prerequisite #3".

- [ ] **Step 2: Probe whether signal_done exists**

Same test for `mcp__coord__signal_done`. Record outcome.

- [ ] **Step 3: Probe whether a consumer-side listener API exists**

Read coord.js. Look for any `EventEmitter`, `on(...)`, or `wait_for_...` pattern. If absent, the listener side needs building too. Record finding.

- [ ] **Step 4: If signal_bound is missing, write the failing test**

Skip if signal_bound exists. Otherwise create `D:/.code/eos-laptop-agent/tools/coord.test.js` (or extend if it exists):

```javascript
// coord.test.js - tests for signal_bound + signal_done
const fs = require('fs')
const path = require('path')
const os = require('os')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-test-'))
process.env.COORD_ROOT = TMP

const coord = require('./coord')

function test(name, fn) {
  try { fn(); console.log(`ok ${name}`) }
  catch (e) { console.error(`fail ${name}: ${e.message}`); process.exit(1) }
}

test('signal_bound writes a signal row a consumer can read', () => {
  const taskId = 'test-task-123'
  coord.signal_bound({ task_id: taskId })
  const signals = coord.list_signals({ task_id: taskId, kind: 'bound' })
  if (signals.length !== 1) throw new Error(`expected 1 bound signal, got ${signals.length}`)
})

test('signal_done writes a signal row with status + summary', () => {
  const taskId = 'test-task-456'
  coord.signal_done({ task_id: taskId, status: 'success', summary: 'did the thing' })
  const signals = coord.list_signals({ task_id: taskId, kind: 'done' })
  if (signals.length !== 1) throw new Error(`expected 1 done signal`)
  if (signals[0].status !== 'success') throw new Error('status not preserved')
  if (signals[0].summary !== 'did the thing') throw new Error('summary not preserved')
})
```

- [ ] **Step 5: Run test, expect FAIL with "signal_bound is not a function"**

```bash
node D:/.code/eos-laptop-agent/tools/coord.test.js
```

Expected: non-zero exit, error mentioning signal_bound undefined.

- [ ] **Step 6: Implement signal_bound + signal_done + list_signals in coord.js**

Add to `D:/.code/eos-laptop-agent/tools/coord.js`:

```javascript
const fs = require('fs')
const path = require('path')

const COORD_ROOT = process.env.COORD_ROOT || 'D:\\.code\\EcodiaOS\\coordination'
const SIGNALS_DIR = path.join(COORD_ROOT, 'signals')

function ensureSignalsDir() {
  if (!fs.existsSync(SIGNALS_DIR)) fs.mkdirSync(SIGNALS_DIR, { recursive: true })
}

function signalPath(taskId, kind) {
  ensureSignalsDir()
  return path.join(SIGNALS_DIR, `${taskId}.${kind}.json`)
}

exports.signal_bound = function ({ task_id }) {
  if (!task_id) throw new Error('signal_bound requires task_id')
  const row = { task_id, kind: 'bound', at: new Date().toISOString() }
  fs.writeFileSync(signalPath(task_id, 'bound'), JSON.stringify(row))
  return { ok: true }
}

exports.signal_done = function ({ task_id, status, summary }) {
  if (!task_id) throw new Error('signal_done requires task_id')
  if (!['success', 'fail'].includes(status)) throw new Error('status must be success or fail')
  const row = { task_id, kind: 'done', status, summary: summary || '', at: new Date().toISOString() }
  fs.writeFileSync(signalPath(task_id, 'done'), JSON.stringify(row))
  return { ok: true }
}

exports.list_signals = function ({ task_id, kind }) {
  ensureSignalsDir()
  const files = fs.readdirSync(SIGNALS_DIR)
  const out = []
  for (const f of files) {
    if (task_id && !f.startsWith(`${task_id}.`)) continue
    if (kind && !f.endsWith(`.${kind}.json`)) continue
    out.push(JSON.parse(fs.readFileSync(path.join(SIGNALS_DIR, f), 'utf8')))
  }
  return out
}
```

- [ ] **Step 7: Run test, expect PASS**

```bash
node D:/.code/eos-laptop-agent/tools/coord.test.js
```

Expected: `ok signal_bound writes a signal row...` and `ok signal_done writes a signal row...` followed by exit 0.

- [ ] **Step 8: Add wait helpers for consumer side**

```javascript
exports.wait_for_signal_bound = async function ({ task_id, timeout_ms = 30000, poll_ms = 250 }) {
  const start = Date.now()
  while (Date.now() - start < timeout_ms) {
    const signals = exports.list_signals({ task_id, kind: 'bound' })
    if (signals.length > 0) return signals[0]
    await new Promise(r => setTimeout(r, poll_ms))
  }
  throw new Error(`wait_for_signal_bound timeout for task ${task_id}`)
}

exports.wait_for_signal_done = async function ({ task_id, timeout_ms, poll_ms = 1000 }) {
  const deadline = timeout_ms ? Date.now() + timeout_ms : Infinity
  while (Date.now() < deadline) {
    const signals = exports.list_signals({ task_id, kind: 'done' })
    if (signals.length > 0) return signals[0]
    await new Promise(r => setTimeout(r, poll_ms))
  }
  throw new Error(`wait_for_signal_done timeout for task ${task_id}`)
}

exports.clear_signals = function ({ task_id }) {
  ensureSignalsDir()
  const files = fs.readdirSync(SIGNALS_DIR)
  for (const f of files) {
    if (f.startsWith(`${task_id}.`)) fs.unlinkSync(path.join(SIGNALS_DIR, f))
  }
}
```

- [ ] **Step 9: Add tests for wait + clear**

Append to coord.test.js:

```javascript
test('wait_for_signal_bound resolves when signal arrives', async () => {
  const taskId = 'wait-test-1'
  setTimeout(() => coord.signal_bound({ task_id: taskId }), 100)
  const result = await coord.wait_for_signal_bound({ task_id: taskId, timeout_ms: 1000 })
  if (result.task_id !== taskId) throw new Error('wrong task_id returned')
})

test('wait_for_signal_bound throws on timeout', async () => {
  try {
    await coord.wait_for_signal_bound({ task_id: 'never-arrives', timeout_ms: 200 })
    throw new Error('should have thrown')
  } catch (e) {
    if (!e.message.includes('timeout')) throw new Error(`wrong error: ${e.message}`)
  }
})

test('clear_signals removes both kinds', () => {
  const taskId = 'clear-test'
  coord.signal_bound({ task_id: taskId })
  coord.signal_done({ task_id: taskId, status: 'success', summary: '' })
  coord.clear_signals({ task_id: taskId })
  const remaining = coord.list_signals({ task_id: taskId })
  if (remaining.length !== 0) throw new Error('signals not cleared')
})
```

For async tests to actually run in this simple harness, wrap them and await inside the `test` runner. Adjust the test harness from Step 4:

```javascript
async function test(name, fn) {
  try { await fn(); console.log(`ok ${name}`) }
  catch (e) { console.error(`fail ${name}: ${e.message}`); process.exit(1) }
}
```

- [ ] **Step 10: Run all tests, expect PASS**

```bash
node D:/.code/eos-laptop-agent/tools/coord.test.js
```

Expected: 5 `ok` lines, exit 0.

- [ ] **Step 11: Register signal_bound + signal_done on the MCP surface**

Find the laptop-agent MCP-tool registration site (likely in `D:/.code/eos-laptop-agent/index.js` or a `routes/mcp.js`). Add entries for the two new tools so they appear as `mcp__coord__signal_bound` and `mcp__coord__signal_done` in any spawned chat.

Verification: open a fresh CC chat in the IDE that will be the dispatch target. Type `mcp__coord__signal_bound` - autocomplete should offer the tool. Run it with a test task_id, then call `coord.list_signals` on the laptop-agent to confirm the file was written.

- [ ] **Step 12: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/coord.js D:/.code/eos-laptop-agent/tools/coord.test.js D:/.code/eos-laptop-agent/index.js
git commit -m "feat(coord): add signal_bound + signal_done + wait helpers for scheduler dispatch tracking"
```

- [ ] **Step 13: Update findings doc**

Under "Prerequisite #3" record: signal_bound exists, signal_done exists, listener API uses file-poll (sufficient for v1, latency ~250ms-1s). MCP exposed.

### Task 0.3: Verify Anthropic OAuth refresh endpoint works for Max accounts

**Files:**
- Update: findings doc

- [ ] **Step 1: Locate the refresh endpoint Anthropic uses**

Open VS Code, sign out of CC, sign back in. Inspect the network traffic. Look for a request like `POST https://*.anthropic.com/oauth/token` with body containing `grant_type=refresh_token`. Capture: full URL, request headers, request body shape, response body shape.

If you cannot capture via DevTools (the extension runs in extension host context), inspect the CC extension source at `C:/Users/tjdTa/.vscode/extensions/anthropic.claude-code-*`. Grep for `refresh_token` or `oauth/token` in the bundled JS.

- [ ] **Step 2: Capture one account's tokens to a scratch file**

Read `~/.claude/.credentials.json` (your active account) and save its contents to `/Users/ecodia/PRIVATE/ecodia-creds/scratch-refresh-probe.json`. Note the `refresh_token` value.

- [ ] **Step 3: Make a manual refresh call**

Using PowerShell or curl, hit the refresh endpoint with the captured refresh_token:

```powershell
$body = @{
  grant_type = "refresh_token"
  refresh_token = "<REDACTED>"
  client_id = "<from CC extension>"
} | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri "<endpoint>" -Body $body -ContentType "application/json"
```

Record: HTTP status, response body (without printing tokens), whether the returned access_token works for a follow-up API call, whether the returned refresh_token is the SAME as the one you sent or a NEW one.

- [ ] **Step 4: Probe single-use behaviour**

Wait 10 seconds. Repeat the refresh call with the SAME refresh_token. If it returns 401 or `invalid_grant`, the refresh_token is single-use. If it returns new tokens again, it's reusable.

- [ ] **Step 5: Record findings**

Update findings doc under "Prerequisite #2":

```markdown
## Prerequisite #2: OAuth refresh endpoint

- Endpoint URL: <full URL>
- Request shape: { grant_type, refresh_token, client_id }
- Response shape: { access_token, refresh_token, expires_in, token_type }
- Refresh token behaviour: <single-use | reusable | rotates>
- Decision: <cred-refresher daemon viable as spec'd | needs headless PKCE re-flow fallback>
```

If single-use OR rotates: the daemon design changes. Each refresh REPLACES the stored refresh_token. Document this constraint - the cred-refresher MUST write back the new refresh_token to `/Users/ecodia/PRIVATE/ecodia-creds/{account}.json` atomically.

If unable to refresh at all (e.g., Max accounts don't expose refresh): the daemon design pivots to headless OAuth PKCE re-flow via CDP. Document the pivot and add Phase 2.5 to this plan to build the PKCE path.

- [ ] **Step 6: Delete scratch file + commit findings**

```bash
rm /Users/ecodia/PRIVATE/ecodia-creds/scratch-refresh-probe.json
git add docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
git commit -m "docs(phase0): record OAuth refresh endpoint findings"
```

### Task 0.4: Decide IDE target for dispatch_worker

**Files:**
- Update: findings doc

- [ ] **Step 1: Verify dispatch_worker's current target**

Read `D:/.code/eos-laptop-agent/tools/cowork.js`. Confirm whether the spawn keystroke targets Cursor (`Ctrl+Alt+Shift+C`) or something else.

- [ ] **Step 2: Test the existing dispatch_worker**

Call `cowork.dispatch_worker` with a trivial brief from an open CC chat. Observe which IDE receives the new tab. Record the actual behaviour.

- [ ] **Step 3: Probe VS Code Stable's CC extension for a "new chat" command**

In VS Code Stable, open the command palette (`Ctrl+Shift+P`). Search for "Claude Code" - list every command. Note any like "New Chat", "Start Chat", "Open Editor-Area Chat".

- [ ] **Step 4: Try binding the VS Code Stable "new chat" command to a keybinding**

In VS Code Stable `keybindings.json` (open with `Preferences: Open Keyboard Shortcuts (JSON)`), add:

```json
{ "key": "ctrl+alt+shift+c", "command": "claude-code.newChat" }
```

(adjust the command name to match what Step 3 surfaced). Reload window. Press the keybind. Does a new CC chat editor-area tab open?

- [ ] **Step 5: Record decision**

Update findings doc under "Prerequisite #1":

```markdown
## Prerequisite #1: IDE target

- Current dispatch_worker target: Cursor via Ctrl+Alt+Shift+C
- VS Code Stable equivalent: <command name found in Step 3, or "not found">
- Keybinding works: <yes | no>
- Decision: <"keep Cursor as single IDE" | "migrate dispatch_worker to VS Code Stable">
- Reason: <why>
```

- [ ] **Step 6: If migrating, update dispatch_worker target**

Skip if keeping Cursor. Otherwise edit `D:/.code/eos-laptop-agent/tools/cowork.js`'s `dispatch_worker` implementation. Change the IDE-focus + keybinding sequence to target VS Code Stable. Document the change in commit message.

- [ ] **Step 7: Smoke-test dispatch_worker on the chosen IDE**

```javascript
// run in node REPL on laptop-agent or via /api/tool POST
await cowork.dispatch_worker({ brief: "Echo this back. task_id=smoke-1", task_id: "smoke-1" })
```

A new chat tab should open in the target IDE with the brief pasted. Confirm visually.

- [ ] **Step 8: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/cowork.js docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
git commit -m "feat(cowork)|docs(phase0): pin dispatch_worker IDE target"
```

### Task 0.5: Verify laptop-agent MCP auto-connection in spawned chats

**Files:**
- Update: findings doc
- Possibly create: `<workspace>/.mcp.json`

- [ ] **Step 1: Identify which workspace dispatch_worker opens chats in**

Use cowork.js source: where does the new tab open relative to (workspace path)? Record in findings.

- [ ] **Step 2: Dispatch a smoke chat with explicit MCP probe brief**

```javascript
await cowork.dispatch_worker({
  brief: "List every mcp__coord__* tool available to you. Reply with the list and nothing else.",
  task_id: "mcp-probe-1"
})
```

Open the new tab. Read its response.

- [ ] **Step 3: Record outcome**

Three possible outcomes:
- (A) The chat lists `mcp__coord__signal_bound`, `mcp__coord__signal_done`, etc. MCP auto-connects in the dispatch workspace. Done.
- (B) The chat says no `mcp__coord__*` tools are available. The workspace doesn't have laptop-agent MCP configured.
- (C) The chat lists some MCP tools but not coord. Partial config.

- [ ] **Step 4: If (B) or (C), wire .mcp.json**

Create or edit `<dispatch-workspace>/.mcp.json`:

```json
{
  "mcpServers": {
    "eos-laptop-agent": {
      "url": "http://localhost:7456/api/mcp",
      "transport": "http"
    }
  }
}
```

(adjust URL + transport to match how laptop-agent actually exposes its MCP). Reload IDE. Re-run the probe brief from Step 2.

- [ ] **Step 5: Verify all four coord tools surface**

The probe response must include `mcp__coord__signal_bound`, `mcp__coord__signal_done`, plus any other coord tools the spec uses. If any are missing, return to Step 4.

- [ ] **Step 6: Record finding**

Update findings doc under "Prerequisite #4":

```markdown
## Prerequisite #4: MCP auto-connect in spawned chats

- Dispatch workspace path: <path>
- .mcp.json status: <existed | created in Step 4>
- coord tools verified present: signal_bound, signal_done, wait_for_signal_bound, wait_for_signal_done, list_signals
- Verified via probe brief mcp-probe-1
```

- [ ] **Step 7: Commit**

```bash
git add <workspace>/.mcp.json docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
git commit -m "chore(mcp): wire laptop-agent MCP into dispatch workspace + document"
```

### Task 0.6: Delete refresh-clobber-watchdog.js + clean stale backups

**Files:**
- Delete: `D:/.code/eos-laptop-agent/daemons/refresh-clobber-watchdog.js`
- Delete: stale backups at `~/.ecodia-creds/*` if present
- Update: findings doc

- [ ] **Step 1: Confirm refresh-clobber-watchdog.js is NOT running**

```powershell
pm2 list | Select-String "refresh-clobber-watchdog"
```

Expected: no match. If matched, stop and delete:

```powershell
pm2 stop refresh-clobber-watchdog
pm2 delete refresh-clobber-watchdog
pm2 save
```

- [ ] **Step 2: Delete the source file**

```powershell
Remove-Item D:/.code/eos-laptop-agent/daemons/refresh-clobber-watchdog.js
```

- [ ] **Step 3: Check for stale backups at old path**

```powershell
Test-Path "$env:USERPROFILE/.ecodia-creds"
```

If true: list contents, confirm they're stale (`code.json`, `money.json`, `money@ecodia.au.json`, `tate.json` from the May 2026 incident). Remove the directory:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE/.ecodia-creds"
```

- [ ] **Step 4: Verify nothing watches .credentials.json**

```bash
grep -r "credentials.json" D:/.code/eos-laptop-agent/ --include="*.js" | grep -v node_modules | grep -i "fs.watch\|chokidar\|watcher"
```

Expected: empty. Any match is a regression and must be removed.

- [ ] **Step 5: Commit deletion**

```bash
git add D:/.code/eos-laptop-agent/daemons/
git commit -m "chore: delete refresh-clobber-watchdog and stale ~/.ecodia-creds (regression source)"
```

- [ ] **Step 6: Update findings**

Update findings doc seed-state section noting: refresh-clobber-watchdog deleted, stale ~/.ecodia-creds removed, no fs.watch on .credentials.json found in tree.

### Task 0.7: Create /Users/ecodia/PRIVATE/ecodia-creds/ with three valid per-account files

**Files:**
- Create: `/Users/ecodia/PRIVATE/ecodia-creds/tate.json`
- Create: `/Users/ecodia/PRIVATE/ecodia-creds/code.json`
- Create: `/Users/ecodia/PRIVATE/ecodia-creds/money.json`

- [ ] **Step 1: Ensure /Users/ecodia/PRIVATE/ecodia-creds/ exists**

```powershell
if (-not (Test-Path "/Users/ecodia/PRIVATE/ecodia-creds")) { New-Item -ItemType Directory -Force -Path "/Users/ecodia/PRIVATE/ecodia-creds" }
```

- [ ] **Step 2: Sign in to tate@ecodia.au in CC, capture credentials**

In VS Code Stable, `Claude: Sign Out`. Then `Claude: Sign In`, choose tate@ecodia.au. After successful sign-in, copy `~/.claude/.credentials.json` to `/Users/ecodia/PRIVATE/ecodia-creds/tate.json`:

```powershell
Copy-Item "$env:USERPROFILE/.claude/.credentials.json" "/Users/ecodia/PRIVATE/ecodia-creds/tate.json"
```

- [ ] **Step 3: Verify the file shape matches expectations**

Open `/Users/ecodia/PRIVATE/ecodia-creds/tate.json`. Confirm it has `claudeAiOauth.accessToken`, `claudeAiOauth.refreshToken`, `claudeAiOauth.expiresAt`. Record the field names in findings (Task 0.3 may have used slightly different ones - normalise here).

- [ ] **Step 4: Repeat for code@ecodia.au**

`Claude: Sign Out`, `Claude: Sign In` as code@ecodia.au, copy:

```powershell
Copy-Item "$env:USERPROFILE/.claude/.credentials.json" "/Users/ecodia/PRIVATE/ecodia-creds/code.json"
```

- [ ] **Step 5: Repeat for money@ecodia.au**

```powershell
Copy-Item "$env:USERPROFILE/.claude/.credentials.json" "/Users/ecodia/PRIVATE/ecodia-creds/money.json"
```

- [ ] **Step 6: Sign back in to your normal working account (tate@)**

```powershell
Copy-Item "/Users/ecodia/PRIVATE/ecodia-creds/tate.json" "$env:USERPROFILE/.claude/.credentials.json"
```

Restart VS Code. Verify the IDE shows tate@ecodia.au.

- [ ] **Step 7: Verify all three files are valid JSON**

```powershell
foreach ($f in @("tate.json", "code.json", "money.json")) {
  $path = "/Users/ecodia/PRIVATE/ecodia-creds/$f"
  $content = Get-Content $path -Raw
  $parsed = $content | ConvertFrom-Json
  if (-not $parsed.claudeAiOauth.accessToken) { Write-Error "$f missing accessToken" }
  Write-Host "$f valid"
}
```

Expected: 3 "valid" lines.

- [ ] **Step 8: Update findings**

Record under seed state: all three cred files exist, schema matches `{ claudeAiOauth: { accessToken, refreshToken, expiresAt, ... } }`, files are readable by the laptop-agent process user.

Do NOT commit these files - `/Users/ecodia/PRIVATE/` is the private store and never goes into git.

### Task 0.8: Apply Postgres migration for new os_scheduled_tasks columns

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/db/migrations/130_os_scheduled_tasks_autonomy_substrate.sql`

(adjust number to next available - verify by listing the migrations dir first)

- [ ] **Step 1: List existing migrations to find next number**

```bash
ls /Users/ecodia/.code/ecodiaos/backend/src/db/migrations/ | tail -20
```

Take the highest number and add 1. Use that for the new file.

- [ ] **Step 2: Write the migration**

```sql
-- 130_os_scheduled_tasks_autonomy_substrate.sql
-- Adds columns + statuses for the autonomy substrate (scheduler module on eos-laptop-agent).

BEGIN;

ALTER TABLE os_scheduled_tasks
  ADD COLUMN IF NOT EXISTS preferred_account text,
  ADD COLUMN IF NOT EXISTS actual_account text,
  ADD COLUMN IF NOT EXISTS leased_by text,
  ADD COLUMN IF NOT EXISTS leased_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_tab_id text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_result text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Allow new status values. If a CHECK constraint exists, replace it.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'os_scheduled_tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE os_scheduled_tasks DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE os_scheduled_tasks
  ADD CONSTRAINT os_scheduled_tasks_status_check
  CHECK (status IN ('active', 'paused', 'dispatching', 'running', 'completed', 'failed', 'orphaned'));

CREATE UNIQUE INDEX IF NOT EXISTS os_scheduled_tasks_idempotency_key_idx
  ON os_scheduled_tasks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_due_idx
  ON os_scheduled_tasks (next_run_at, priority)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_lease_idx
  ON os_scheduled_tasks (leased_at)
  WHERE status IN ('dispatching', 'running');

COMMIT;
```

- [ ] **Step 3: Apply the migration**

Use the existing migration runner. If you're not sure how, check the project's `package.json` for a `db:migrate` script or use the Management API directly:

```bash
set -a; . /Users/ecodia/PRIVATE/ecodia-creds/supabase.env; set +a
MIGRATION=$(cat /Users/ecodia/.code/ecodiaos/backend/src/db/migrations/130_os_scheduled_tasks_autonomy_substrate.sql)
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "$MIGRATION" '{query: $q}')"
```

- [ ] **Step 4: Verify schema landed**

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''os_scheduled_tasks'\'' ORDER BY ordinal_position"}'
```

Expected: response includes the new columns (preferred_account, actual_account, leased_by, leased_at, dispatched_tab_id, retry_count, last_error, last_result, idempotency_key).

- [ ] **Step 5: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/src/db/migrations/130_os_scheduled_tasks_autonomy_substrate.sql
git commit -m "feat(db): migration 130 - autonomy substrate columns on os_scheduled_tasks"
```

### Task 0.9: Insert a seed cron row

**Files:**
- Insert: one row into `os_scheduled_tasks`

- [ ] **Step 1: Insert a daily morning-briefing seed row**

```bash
set -a; . /Users/ecodia/PRIVATE/ecodia-creds/supabase.env; set +a
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"INSERT INTO os_scheduled_tasks (type, name, prompt, cron_expression, next_run_at, status, priority, preferred_account) VALUES ('\''cron'\'', '\''morning-briefing'\'', '\''Compose Tate'\''s morning briefing email...'\'', '\''0 9 * * *'\'', NOW() + INTERVAL '\''1 minute'\'', '\''paused'\'', 2, '\''tate'\'') RETURNING id;"}'
```

Note the returned id. Insert as 'paused' so the new scheduler doesn't fire it before we're ready.

- [ ] **Step 2: Record findings**

Update findings doc seed-state section: seed cron row id `<uuid>`, status `paused`, will flip to `active` after Phase 4 lands.

---

## Phase 1: Cred-rotation module (creds.js)

### Task 1.1: Write the failing tests for pick_healthiest_account

**Files:**
- Create: `D:/.code/eos-laptop-agent/tools/creds.test.js`

- [ ] **Step 1: Write test scaffolding + first test**

```javascript
// creds.test.js - unit tests for cred-rotation module
const fs = require('fs')
const path = require('path')
const os = require('os')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-test-'))
const CREDS_DIR = path.join(TMP, 'ecodia-creds')
fs.mkdirSync(CREDS_DIR, { recursive: true })
process.env.CREDS_DIR = CREDS_DIR

const CLAUDE_DIR = path.join(TMP, 'claude')
fs.mkdirSync(CLAUDE_DIR, { recursive: true })
process.env.CLAUDE_CREDENTIALS_PATH = path.join(CLAUDE_DIR, '.credentials.json')

// Seed three account files
const TATE = { claudeAiOauth: { accessToken: 'AT-tate', refreshToken: 'RT-tate', expiresAt: 9999999999000 } }
const CODE = { claudeAiOauth: { accessToken: 'AT-code', refreshToken: 'RT-code', expiresAt: 9999999999000 } }
const MONEY = { claudeAiOauth: { accessToken: 'AT-money', refreshToken: 'RT-money', expiresAt: 9999999999000 } }
fs.writeFileSync(path.join(CREDS_DIR, 'tate.json'), JSON.stringify(TATE))
fs.writeFileSync(path.join(CREDS_DIR, 'code.json'), JSON.stringify(CODE))
fs.writeFileSync(path.join(CREDS_DIR, 'money.json'), JSON.stringify(MONEY))

// Mock the usage state source
const usageMock = {
  states: {
    tate:  { headroom_minutes: 200, reset_at: '2026-05-26T23:00:00Z' },
    code:  { headroom_minutes: 100, reset_at: '2026-05-26T22:00:00Z' },
    money: { headroom_minutes: 50,  reset_at: '2026-05-27T00:00:00Z' },
  },
  get_usage_state(account) { return this.states[account] }
}

const creds = require('./creds')
creds._setUsageSource(usageMock)  // dependency injection seam for tests

async function test(name, fn) {
  try { await fn(); console.log(`ok ${name}`) }
  catch (e) { console.error(`fail ${name}: ${e.message}`); process.exit(1) }
}

test('pick_healthiest_account returns tate when it has most headroom', async () => {
  const pick = await creds.pick_healthiest_account({})
  if (pick !== 'tate') throw new Error(`expected tate, got ${pick}`)
})

test('pick_healthiest_account honours preferred when above threshold', async () => {
  const pick = await creds.pick_healthiest_account({ preferred: 'code' })
  if (pick !== 'code') throw new Error(`expected code (preferred), got ${pick}`)
})

test('pick_healthiest_account falls back from preferred when below threshold', async () => {
  // override money to be below threshold
  usageMock.states.money.headroom_minutes = 5
  const pick = await creds.pick_healthiest_account({ preferred: 'money', required_headroom_minutes: 15 })
  if (pick !== 'tate') throw new Error(`expected tate (fallback), got ${pick}`)
  usageMock.states.money.headroom_minutes = 50
})

test('pick_healthiest_account throws AllAccountsCappedError when none have headroom', async () => {
  usageMock.states.tate.headroom_minutes = 5
  usageMock.states.code.headroom_minutes = 5
  usageMock.states.money.headroom_minutes = 5
  try {
    await creds.pick_healthiest_account({ required_headroom_minutes: 15 })
    throw new Error('should have thrown')
  } catch (e) {
    if (e.name !== 'AllAccountsCappedError') throw new Error(`wrong error: ${e.name}`)
    if (!e.resets) throw new Error('error missing reset info')
  }
  usageMock.states.tate.headroom_minutes = 200
  usageMock.states.code.headroom_minutes = 100
  usageMock.states.money.headroom_minutes = 50
})
```

- [ ] **Step 2: Run, expect FAIL with "Cannot find module './creds'"**

```bash
node D:/.code/eos-laptop-agent/tools/creds.test.js
```

Expected: failure mentioning creds module not found.

### Task 1.2: Implement pick_healthiest_account

**Files:**
- Create: `D:/.code/eos-laptop-agent/tools/creds.js`

- [ ] **Step 1: Create creds.js with pick_healthiest_account**

```javascript
// creds.js - per-account cred-rotation module for the autonomy substrate
//
// HARD INVARIANTS:
// - Never reads ~/.claude/.credentials.json to react to changes.
// - Never watches ~/.claude/.credentials.json with fs.watch (or any other mechanism).
// - The only writes to ~/.claude/.credentials.json come from rotate_to() below.
// - Any code path that "restores" the file from a backup is a regression.

const fs = require('fs')
const path = require('path')
const os = require('os')

const CREDS_DIR = process.env.CREDS_DIR || '/Users/ecodia/PRIVATE/ecodia-creds'
const CLAUDE_CREDENTIALS_PATH = process.env.CLAUDE_CREDENTIALS_PATH || path.join(os.homedir(), '.claude', '.credentials.json')

class AllAccountsCappedError extends Error {
  constructor(resets) {
    super('all three accounts capped')
    this.name = 'AllAccountsCappedError'
    this.resets = resets
  }
}

// Default usage source pulls from tools/usage.js; tests inject a mock.
let _usageSource = null
function getUsageSource() {
  if (!_usageSource) _usageSource = require('./usage')
  return _usageSource
}
exports._setUsageSource = function (source) { _usageSource = source }

const ACCOUNTS = ['tate', 'code', 'money']

exports.pick_healthiest_account = async function ({ preferred = null, required_headroom_minutes = 15 } = {}) {
  const usage = getUsageSource()
  const states = {}
  for (const acct of ACCOUNTS) {
    states[acct] = await usage.get_usage_state(acct)
  }
  // honour preferred if it has enough headroom
  if (preferred && states[preferred] && states[preferred].headroom_minutes > required_headroom_minutes) {
    return preferred
  }
  // otherwise pick highest headroom above threshold
  const eligible = ACCOUNTS
    .filter(a => states[a].headroom_minutes > required_headroom_minutes)
    .sort((a, b) => states[b].headroom_minutes - states[a].headroom_minutes)
  if (eligible.length > 0) return eligible[0]
  // none eligible: throw with reset times
  const resets = {}
  for (const a of ACCOUNTS) resets[a] = states[a].reset_at
  throw new AllAccountsCappedError(resets)
}

exports.AllAccountsCappedError = AllAccountsCappedError
```

- [ ] **Step 2: Run tests, expect 4 PASS**

```bash
node D:/.code/eos-laptop-agent/tools/creds.test.js
```

Expected: 4 `ok` lines, exit 0.

- [ ] **Step 3: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/creds.js D:/.code/eos-laptop-agent/tools/creds.test.js
git commit -m "feat(creds): pick_healthiest_account with preferred + headroom threshold"
```

### Task 1.3: Add rotate_to + atomic file swap

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/creds.js`
- Modify: `D:/.code/eos-laptop-agent/tools/creds.test.js`

- [ ] **Step 1: Write failing tests for rotate_to**

Append to creds.test.js:

```javascript
test('rotate_to copies the right account file to claude credentials path', async () => {
  await creds.rotate_to('code')
  const content = JSON.parse(fs.readFileSync(process.env.CLAUDE_CREDENTIALS_PATH, 'utf8'))
  if (content.claudeAiOauth.accessToken !== 'AT-code') throw new Error('wrong account written')
})

test('rotate_to is atomic - never writes partial file', async () => {
  // Write a corrupted .tmp file should not affect the real path
  fs.writeFileSync(process.env.CLAUDE_CREDENTIALS_PATH + '.tmp', 'CORRUPT')
  await creds.rotate_to('tate')
  const content = JSON.parse(fs.readFileSync(process.env.CLAUDE_CREDENTIALS_PATH, 'utf8'))
  if (content.claudeAiOauth.accessToken !== 'AT-tate') throw new Error('partial write leaked through')
})

test('rotate_to throws on unknown account', async () => {
  try {
    await creds.rotate_to('eve')
    throw new Error('should have thrown')
  } catch (e) {
    if (!e.message.includes('unknown account')) throw new Error(`wrong error: ${e.message}`)
  }
})

test('rotate_to throws on missing per-account file', async () => {
  // temporarily remove tate.json
  const tatePath = path.join(process.env.CREDS_DIR, 'tate.json')
  const backup = fs.readFileSync(tatePath)
  fs.unlinkSync(tatePath)
  try {
    await creds.rotate_to('tate')
    throw new Error('should have thrown')
  } catch (e) {
    if (!e.message.includes('not found')) throw new Error(`wrong error: ${e.message}`)
  } finally {
    fs.writeFileSync(tatePath, backup)
  }
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
node D:/.code/eos-laptop-agent/tools/creds.test.js
```

Expected: pick_healthiest_account tests still pass, rotate_to tests fail with "rotate_to is not a function".

- [ ] **Step 3: Implement rotate_to**

Add to creds.js:

```javascript
exports.rotate_to = async function (account) {
  if (!ACCOUNTS.includes(account)) throw new Error(`unknown account: ${account}`)
  const source = path.join(CREDS_DIR, `${account}.json`)
  if (!fs.existsSync(source)) throw new Error(`per-account cred file not found: ${source}`)
  const previous = exports.current_account()
  const content = fs.readFileSync(source)
  const tmp = CLAUDE_CREDENTIALS_PATH + '.tmp'
  // ensure target dir exists
  const dir = path.dirname(CLAUDE_CREDENTIALS_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // write tmp + atomic rename (NTFS atomic on same volume)
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, CLAUDE_CREDENTIALS_PATH)
  return { previous, current: account }
}
```

- [ ] **Step 4: Implement current_account (stub) so rotate_to compiles**

Add to creds.js (before rotate_to or after, doesn't matter):

```javascript
exports.current_account = function () {
  if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) return 'unknown'
  let content
  try {
    content = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, 'utf8')
  } catch (e) {
    return 'unknown'
  }
  let parsed
  try { parsed = JSON.parse(content) } catch (e) { return 'unknown' }
  const token = parsed?.claudeAiOauth?.accessToken
  if (!token) return 'unknown'
  // identify by matching against per-account files
  for (const acct of ACCOUNTS) {
    const file = path.join(CREDS_DIR, `${acct}.json`)
    if (!fs.existsSync(file)) continue
    try {
      const acctParsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (acctParsed?.claudeAiOauth?.accessToken === token) return acct
    } catch (_) {}
  }
  return 'unknown'
}
```

- [ ] **Step 5: Run, expect 8 PASS (4 existing + 4 new)**

```bash
node D:/.code/eos-laptop-agent/tools/creds.test.js
```

- [ ] **Step 6: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/creds.js D:/.code/eos-laptop-agent/tools/creds.test.js
git commit -m "feat(creds): atomic rotate_to + current_account identification"
```

### Task 1.4: Add the fs.watch regression test

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/creds.test.js`

- [ ] **Step 1: Write the regression-protection test**

Append to creds.test.js (at the top, BEFORE requiring creds.js):

```javascript
// REGRESSION GUARD: this module must never call fs.watch on the credentials file.
// The previous refresh-clobber-watchdog.js used fs.watch and self-DOSed the system
// (see incident May 2026, 2-day debug). This test fails if creds.js ever introduces it.
const watchCalls = []
const realFsWatch = fs.watch
fs.watch = function (filename, ...rest) {
  watchCalls.push(filename)
  return realFsWatch.apply(fs, [filename, ...rest])
}

// (move existing `const creds = require('./creds')` to AFTER this monkey-patch)
```

And add a test at the END of the file:

```javascript
test('REGRESSION: creds module never calls fs.watch', () => {
  if (watchCalls.length > 0) {
    throw new Error(`fs.watch was called for: ${watchCalls.join(', ')}. This is the refresh-clobber-watchdog regression. Remove the watcher.`)
  }
})
```

- [ ] **Step 2: Run, expect PASS**

```bash
node D:/.code/eos-laptop-agent/tools/creds.test.js
```

Expected: 9 `ok` lines.

- [ ] **Step 3: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/creds.test.js
git commit -m "test(creds): regression guard against fs.watch on .credentials.json"
```

---

## Phase 2: Cred-refresher daemon

### Task 2.1: Write refresher daemon with TDD

**Files:**
- Create: `D:/.code/eos-laptop-agent/daemons/cred-refresher.js`
- Create: `D:/.code/eos-laptop-agent/daemons/cred-refresher.test.js`

- [ ] **Step 1: Read findings to know the OAuth refresh shape**

Open `/Users/ecodia/.code/ecodiaos/backend/docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md`. Pull out: refresh endpoint URL, request body shape, response body shape, refresh-token reuse behaviour.

- [ ] **Step 2: Write failing tests for refresh logic**

```javascript
// cred-refresher.test.js
const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'refresher-test-'))
const CREDS_DIR = path.join(TMP, 'ecodia-creds')
fs.mkdirSync(CREDS_DIR, { recursive: true })
process.env.CREDS_DIR = CREDS_DIR

// Stub OAuth endpoint
let refreshCallCount = 0
const stubServer = http.createServer((req, res) => {
  refreshCallCount++
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    const parsed = JSON.parse(body)
    if (parsed.refresh_token === 'invalid') {
      res.writeHead(401); res.end('{"error":"invalid_grant"}'); return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      access_token: 'new-' + parsed.refresh_token,
      refresh_token: 'rotated-' + parsed.refresh_token,
      expires_in: 3600,
      token_type: 'Bearer',
    }))
  })
})
const stubPort = 17890
stubServer.listen(stubPort)
process.env.OAUTH_REFRESH_URL = `http://127.0.0.1:${stubPort}/oauth/token`
process.env.OAUTH_CLIENT_ID = 'test-client'

// Seed a stale token (expired)
const stale = {
  claudeAiOauth: {
    accessToken: 'AT-stale',
    refreshToken: 'RT-tate',
    expiresAt: Date.now() - 1000,
  }
}
fs.writeFileSync(path.join(CREDS_DIR, 'tate.json'), JSON.stringify(stale))

const refresher = require('./cred-refresher')

async function test(name, fn) {
  try { await fn(); console.log(`ok ${name}`) }
  catch (e) { console.error(`fail ${name}: ${e.message}`); process.exit(1) }
}

(async () => {
  await test('refreshes stale token and writes new file', async () => {
    refreshCallCount = 0
    await refresher.refresh_account('tate')
    if (refreshCallCount !== 1) throw new Error(`expected 1 call, got ${refreshCallCount}`)
    const updated = JSON.parse(fs.readFileSync(path.join(CREDS_DIR, 'tate.json'), 'utf8'))
    if (updated.claudeAiOauth.accessToken !== 'new-RT-tate') throw new Error('access token not updated')
    if (updated.claudeAiOauth.refreshToken !== 'rotated-RT-tate') throw new Error('refresh token not rotated')
  })

  await test('skips refresh when token has plenty of TTL', async () => {
    const fresh = {
      claudeAiOauth: {
        accessToken: 'AT-fresh',
        refreshToken: 'RT-fresh',
        expiresAt: Date.now() + 3600_000,
      }
    }
    fs.writeFileSync(path.join(CREDS_DIR, 'code.json'), JSON.stringify(fresh))
    refreshCallCount = 0
    await refresher.refresh_account('code')
    if (refreshCallCount !== 0) throw new Error(`expected 0 calls (skip), got ${refreshCallCount}`)
  })

  await test('throws on invalid refresh_token', async () => {
    const broken = {
      claudeAiOauth: {
        accessToken: 'AT',
        refreshToken: 'invalid',
        expiresAt: Date.now() - 1000,
      }
    }
    fs.writeFileSync(path.join(CREDS_DIR, 'money.json'), JSON.stringify(broken))
    try {
      await refresher.refresh_account('money')
      throw new Error('should have thrown')
    } catch (e) {
      if (!e.message.match(/401|invalid_grant/i)) throw new Error(`wrong error: ${e.message}`)
    }
  })

  stubServer.close()
  process.exit(0)
})()
```

- [ ] **Step 3: Run, expect FAIL (module not found)**

```bash
node D:/.code/eos-laptop-agent/daemons/cred-refresher.test.js
```

- [ ] **Step 4: Implement cred-refresher.js**

```javascript
// cred-refresher.js - PM2-supervised daemon that keeps per-account OAuth tokens fresh.
//
// HARD INVARIANTS:
// - Reads + writes ONLY to /Users/ecodia/PRIVATE/ecodia-creds/{account}.json.
// - Never reads, writes, or watches ~/.claude/.credentials.json.
// - Logs every refresh to /Users/ecodia/PRIVATE/ecodia-creds/refresh.log.

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const CREDS_DIR = process.env.CREDS_DIR || '/Users/ecodia/PRIVATE/ecodia-creds'
const LOG_PATH = process.env.REFRESH_LOG_PATH || path.join(CREDS_DIR, 'refresh.log')
const OAUTH_REFRESH_URL = process.env.OAUTH_REFRESH_URL  // from findings 0.3
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID

const REFRESH_THRESHOLD_MS = 20 * 60 * 1000  // 20 min
const POLL_INTERVAL_MS = 30 * 60 * 1000      // 30 min
const ACCOUNTS = ['tate', 'code', 'money']

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`
  try { fs.appendFileSync(LOG_PATH, line) } catch (_) {}
  process.stdout.write(line)
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const data = JSON.stringify(body)
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let chunks = ''
      res.on('data', c => chunks += c)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(chunks))
        } else {
          reject(new Error(`${res.statusCode}: ${chunks}`))
        }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function readAccount(account) {
  const file = path.join(CREDS_DIR, `${account}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeAccountAtomic(account, payload) {
  const file = path.join(CREDS_DIR, `${account}.json`)
  fs.writeFileSync(file + '.tmp', JSON.stringify(payload))
  fs.renameSync(file + '.tmp', file)
}

exports.refresh_account = async function (account) {
  const creds = await readAccount(account)
  const expiresAt = creds.claudeAiOauth?.expiresAt
  const ttlMs = expiresAt - Date.now()
  if (ttlMs > REFRESH_THRESHOLD_MS) {
    log(`${account}: skip (TTL ${Math.floor(ttlMs / 60000)}min)`)
    return { skipped: true, ttl_ms: ttlMs }
  }
  log(`${account}: refreshing (TTL ${Math.floor(ttlMs / 1000)}s)`)
  const refreshToken = creds.claudeAiOauth.refreshToken
  const response = await postJson(OAUTH_REFRESH_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OAUTH_CLIENT_ID,
  })
  const updated = {
    ...creds,
    claudeAiOauth: {
      ...creds.claudeAiOauth,
      accessToken: response.access_token,
      refreshToken: response.refresh_token || refreshToken,
      expiresAt: Date.now() + (response.expires_in * 1000),
    }
  }
  writeAccountAtomic(account, updated)
  log(`${account}: refreshed, new TTL ${response.expires_in}s`)
  return { refreshed: true, new_ttl_s: response.expires_in }
}

exports.start_loop = function () {
  log('cred-refresher daemon started')
  const run = async () => {
    for (const account of ACCOUNTS) {
      try { await exports.refresh_account(account) }
      catch (e) { log(`${account}: refresh FAILED ${e.message}`) }
    }
  }
  run()  // immediate first run
  setInterval(run, POLL_INTERVAL_MS)
}

if (require.main === module) {
  exports.start_loop()
}
```

- [ ] **Step 5: Run tests, expect 3 PASS**

```bash
node D:/.code/eos-laptop-agent/daemons/cred-refresher.test.js
```

- [ ] **Step 6: Add failure-escalation logic for the watchdog to see**

Edit refresh_account in cred-refresher.js. After the try/catch in start_loop, count consecutive failures per account and write to kv_store:

(Actually keep counter in cred-refresher's own state for v1; the watchdog can read the refresh.log directly. Simpler.)

In the run loop:

```javascript
const failCounts = { tate: 0, code: 0, money: 0 }
const run = async () => {
  for (const account of ACCOUNTS) {
    try {
      await exports.refresh_account(account)
      failCounts[account] = 0
    } catch (e) {
      log(`${account}: refresh FAILED ${e.message}`)
      failCounts[account]++
      if (failCounts[account] >= 3) {
        // write kv_store row that watchdog SMSes on
        try { await writeKvStore(`creds.refresh_failure.${account}`, { last_error: e.message, at: new Date().toISOString(), consecutive_fails: failCounts[account] }) }
        catch (kvErr) { log(`${account}: kv_store escalation also failed: ${kvErr.message}`) }
      }
    }
  }
}
```

Add a `writeKvStore` helper using Supabase REST + the service key from env, OR (simpler for laptop-agent) call into the existing `mcp__claude_ai_EcodiaOS_Cowork_V2__kv_store_set` endpoint via HTTP.

Choose the simplest path: write to a local file (`/Users/ecodia/PRIVATE/ecodia-creds/refresh-failures.json`) and have the watchdog probe that file via Tailscale through the existing laptop-agent `/api/status` endpoint OR via direct Supabase write using SUPABASE_SERVICE_KEY env var (load from /Users/ecodia/PRIVATE/ecodia-creds/supabase.env).

For v1, go with Supabase REST direct from the daemon (one less hop):

```javascript
const SUPABASE_URL = process.env.SUPABASE_URL  // load via process env (PM2 ecosystem config)
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

async function writeKvStore(key, value) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    log(`kv_store write skipped (no creds): ${key}`)
    return
  }
  const body = { key, value: JSON.stringify(value), updated_at: new Date().toISOString() }
  return postJson(`${SUPABASE_URL}/rest/v1/kv_store`, body)  // upsert via on_conflict
}
```

(Real implementation needs a proper UPSERT - use `apikey` + `Authorization` headers, `Prefer: resolution=merge-duplicates` header for upsert.)

- [ ] **Step 7: Add test for kv_store escalation after 3 fails**

```javascript
await test('kv_store row written after 3 consecutive failures', async () => {
  // Substitute writeKvStore with a spy
  const kvWrites = []
  refresher._setKvWriter((key, value) => { kvWrites.push({key, value}); return Promise.resolve() })

  const broken = {
    claudeAiOauth: { accessToken: 'AT', refreshToken: 'invalid', expiresAt: Date.now() - 1000 }
  }
  fs.writeFileSync(path.join(CREDS_DIR, 'money.json'), JSON.stringify(broken))

  await refresher._runOnce()  // expose private helper
  await refresher._runOnce()
  await refresher._runOnce()

  if (kvWrites.length !== 1) throw new Error(`expected 1 kv_store write after 3 fails, got ${kvWrites.length}`)
  if (!kvWrites[0].key.endsWith('money')) throw new Error('wrong key')
})
```

Add `_setKvWriter` and `_runOnce` exports for testability:

```javascript
let _kvWriter = writeKvStore
exports._setKvWriter = function (fn) { _kvWriter = fn }
exports._runOnce = async function () { return run() }  // bind run via module-level ref
```

- [ ] **Step 8: Run, expect 4 PASS**

```bash
node D:/.code/eos-laptop-agent/daemons/cred-refresher.test.js
```

- [ ] **Step 9: Add cred-refresher to PM2 ecosystem**

Edit `D:/.code/eos-laptop-agent/ecosystem.config.js`. Add an `apps` entry:

```javascript
{
  name: 'cred-refresher',
  script: './daemons/cred-refresher.js',
  cwd: 'D:/.code/eos-laptop-agent',
  autorestart: true,
  watch: false,
  max_memory_restart: '100M',
  env: {
    CREDS_DIR: '/Users/ecodia/PRIVATE/ecodia-creds',
    REFRESH_LOG_PATH: '/Users/ecodia/PRIVATE/ecodia-creds/refresh.log',
    OAUTH_REFRESH_URL: '<from findings 0.3>',
    OAUTH_CLIENT_ID: '<from findings 0.3>',
    SUPABASE_URL: '<from /Users/ecodia/PRIVATE/ecodia-creds/supabase.env>',
    SUPABASE_SERVICE_KEY: '<from /Users/ecodia/PRIVATE/ecodia-creds/supabase.env>',
  },
}
```

(Do NOT inline secrets in the file. Pull from process.env via `dotenv` or PM2's env-file support.)

- [ ] **Step 10: Start the daemon under PM2**

```powershell
pm2 start D:/.code/eos-laptop-agent/ecosystem.config.js --only cred-refresher
pm2 save
```

Verify it's running:

```powershell
pm2 list | Select-String cred-refresher
```

Tail logs and confirm a real refresh fired (or that all three accounts are skipped due to fresh TTLs):

```powershell
Get-Content /Users/ecodia/PRIVATE/ecodia-creds/refresh.log -Tail 20
```

- [ ] **Step 11: Commit**

```bash
git add D:/.code/eos-laptop-agent/daemons/cred-refresher.js D:/.code/eos-laptop-agent/daemons/cred-refresher.test.js D:/.code/eos-laptop-agent/ecosystem.config.js
git commit -m "feat(daemons): cred-refresher daemon with PM2 supervision + kv_store escalation"
```

---

## Phase 3: Scheduler module - dispatch loop

### Task 3.1: Set up scheduler.js scaffolding + DB client

**Files:**
- Create: `D:/.code/eos-laptop-agent/tools/scheduler.js`
- Create: `D:/.code/eos-laptop-agent/tools/scheduler.test.js`
- Modify: `D:/.code/eos-laptop-agent/package.json` (add `pg` if not present, `node-cron` for cron parsing)

- [ ] **Step 1: Add dependencies**

```bash
cd D:/.code/eos-laptop-agent
npm install pg cron-parser
```

- [ ] **Step 2: Create scheduler.js skeleton**

```javascript
// scheduler.js - autonomous scheduler module.
// Polls os_scheduled_tasks every 30s, leases due rows, rotates creds, dispatches CC chats.

const { Pool } = require('pg')
const cronParser = require('cron-parser')

const creds = require('./creds')
const coord = require('./coord')

const DB_URL = process.env.SUPABASE_DB_URL  // from PM2 env
const POLL_INTERVAL_MS = 30 * 1000
const STALE_LEASE_INTERVAL_MS = 60 * 1000
const DISPATCH_LIMIT = 5
const SIGNAL_BOUND_TIMEOUT_MS = 30 * 1000
const ORPHAN_TIMEOUT_MS = 6 * 60 * 60 * 1000

let pool = null
function getPool() {
  if (!pool) pool = new Pool({ connectionString: DB_URL, max: 4 })
  return pool
}
exports._setPool = function (p) { pool = p }

let dispatcher = null  // injected for testing
function getDispatcher() {
  if (!dispatcher) dispatcher = require('./cowork')
  return dispatcher
}
exports._setDispatcher = function (d) { dispatcher = d }

// launch-lock: in-memory mutex serializing the cred-rotation + dispatch_worker window
const launchLock = (() => {
  let queue = Promise.resolve()
  return {
    acquire: () => {
      let release
      const wait = new Promise(r => { release = r })
      const prev = queue
      queue = queue.then(() => wait)
      return prev.then(() => release)
    }
  }
})()
exports._launchLock = launchLock

exports.buildBrief = function (row) {
  return [
    `Call mcp__coord__signal_bound now with { task_id: "${row.id}" }. Do this before anything else, including reading any files or thinking about the task. This is the only way the scheduler knows you launched successfully.`,
    '',
    'Once you have signalled bound, your task is:',
    '',
    row.prompt,
    '',
    'When you finish (whether you succeeded, partially succeeded, or failed), call mcp__coord__signal_done with {',
    `  task_id: "${row.id}",`,
    '  status: "success" | "fail",',
    '  summary: "<one paragraph summary of what happened, what changed on disk or in substrate, and what the next chat would need to know>"',
    '}',
    '',
    `You are running as a scheduled task on account ${row.actual_account || 'unknown'}. The scheduler will not know your task finished until signal_done arrives. If you exit without signalling, you will be marked orphaned in 6 hours and a recovery probe will investigate.`,
  ].join('\n')
}
```

- [ ] **Step 3: Test the launch-lock and buildBrief**

```javascript
// scheduler.test.js
const fs = require('fs')
const path = require('path')
const os = require('os')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-test-'))
process.env.COORD_ROOT = TMP

const scheduler = require('./scheduler')

async function test(name, fn) {
  try { await fn(); console.log(`ok ${name}`) }
  catch (e) { console.error(`fail ${name}: ${e.message}`); process.exit(1) }
}

(async () => {
  await test('buildBrief includes signal_bound as first instruction', () => {
    const row = { id: 'task-1', prompt: 'do the thing', actual_account: 'tate' }
    const brief = scheduler.buildBrief(row)
    const firstLine = brief.split('\n')[0]
    if (!firstLine.includes('signal_bound now with { task_id: "task-1"')) {
      throw new Error('signal_bound not the first instruction')
    }
    if (!brief.includes('signal_done')) throw new Error('signal_done missing')
    if (!brief.includes('do the thing')) throw new Error('task prompt missing')
  })

  await test('launchLock serializes concurrent acquires', async () => {
    const order = []
    const a = scheduler._launchLock.acquire().then(rel => {
      order.push('a-in')
      return new Promise(r => setTimeout(() => { order.push('a-out'); rel(); r() }, 50))
    })
    const b = scheduler._launchLock.acquire().then(rel => {
      order.push('b-in')
      rel()
    })
    await Promise.all([a, b])
    if (JSON.stringify(order) !== JSON.stringify(['a-in', 'a-out', 'b-in'])) {
      throw new Error(`wrong order: ${order.join(',')}`)
    }
  })

  process.exit(0)
})()
```

- [ ] **Step 4: Run, expect 2 PASS**

```bash
node D:/.code/eos-laptop-agent/tools/scheduler.test.js
```

- [ ] **Step 5: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js D:/.code/eos-laptop-agent/tools/scheduler.test.js D:/.code/eos-laptop-agent/package.json D:/.code/eos-laptop-agent/package-lock.json
git commit -m "feat(scheduler): module scaffold, launch-lock mutex, buildBrief"
```

### Task 3.2: Lease loop with SKIP LOCKED + dispatchOne

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.js`
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.test.js`

- [ ] **Step 1: Implement leaseDueRows**

Add to scheduler.js:

```javascript
exports.leaseDueRows = async function (limit = DISPATCH_LIMIT) {
  const sql = `
    WITH due AS (
      SELECT id FROM os_scheduled_tasks
      WHERE status = 'active' AND next_run_at <= now()
      ORDER BY priority ASC, next_run_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE os_scheduled_tasks t
    SET status='dispatching',
        leased_by='corazon-laptop-agent',
        leased_at=now()
    FROM due
    WHERE t.id = due.id
    RETURNING t.*;
  `
  const { rows } = await getPool().query(sql, [limit])
  return rows
}
```

- [ ] **Step 2: Implement dispatchOne with launch-lock**

```javascript
exports.dispatchOne = async function (row) {
  const release = await launchLock.acquire()
  try {
    const account = await creds.pick_healthiest_account({
      preferred: row.preferred_account,
      required_headroom_minutes: 15,
    })
    await creds.rotate_to(account)
    const dispatcher = getDispatcher()
    const result = await dispatcher.dispatch_worker({
      brief: exports.buildBrief({ ...row, actual_account: account }),
      task_id: row.id,
    })
    const tabId = result.tab_id
    await coord.wait_for_signal_bound({
      task_id: row.id,
      timeout_ms: SIGNAL_BOUND_TIMEOUT_MS,
    })
    await getPool().query(`
      UPDATE os_scheduled_tasks
      SET status='running',
          actual_account=$1,
          dispatched_tab_id=$2,
          leased_at=now()
      WHERE id=$3
    `, [account, tabId, row.id])
    return { ok: true, account, tab_id: tabId }
  } catch (err) {
    await exports.markFailed(row, err)
    return { ok: false, error: err.message }
  } finally {
    release()
  }
}

exports.markFailed = async function (row, err) {
  if (err.name === 'AllAccountsCappedError') {
    const earliestReset = Math.min(...Object.values(err.resets).map(r => new Date(r).getTime()))
    await getPool().query(`
      UPDATE os_scheduled_tasks
      SET status='active',
          next_run_at=$1,
          leased_by=NULL, leased_at=NULL,
          last_error=$2
      WHERE id=$3
    `, [new Date(earliestReset + 60_000), 'all_accounts_capped', row.id])
    return
  }
  await getPool().query(`
    UPDATE os_scheduled_tasks
    SET status='active',
        retry_count=retry_count+1,
        leased_by=NULL, leased_at=NULL,
        last_error=$1
    WHERE id=$2
  `, [err.message, row.id])
}
```

- [ ] **Step 3: Write tests with a mocked Pool**

Append to scheduler.test.js:

```javascript
// stub Pool
let lastSql = null
let lastParams = null
const stubPool = {
  query: async (sql, params) => {
    lastSql = sql; lastParams = params
    if (sql.includes('WITH due AS')) {
      return { rows: [{ id: 'row-1', prompt: 'task one', preferred_account: 'tate', retry_count: 0 }] }
    }
    return { rows: [] }
  }
}
scheduler._setPool(stubPool)

// stub creds + dispatcher
const fakeCreds = require('./creds')
fakeCreds._setUsageSource({
  get_usage_state: () => ({ headroom_minutes: 200, reset_at: '2026-12-31T00:00:00Z' })
})

const stubDispatcher = {
  dispatch_worker: async ({ task_id }) => {
    // immediately fire signal_bound to unblock the wait
    const coord = require('./coord')
    setTimeout(() => coord.signal_bound({ task_id }), 50)
    return { tab_id: `tab-${task_id}` }
  }
}
scheduler._setDispatcher(stubDispatcher)

await test('leaseDueRows runs the right SQL', async () => {
  const rows = await scheduler.leaseDueRows(5)
  if (!lastSql.includes('FOR UPDATE SKIP LOCKED')) throw new Error('missing SKIP LOCKED')
  if (lastParams[0] !== 5) throw new Error('limit not passed')
  if (rows.length !== 1) throw new Error('rows not returned')
})

await test('dispatchOne happy path acquires lock, rotates, dispatches, signals bound', async () => {
  // ensure creds dir is seeded for rotate_to
  // (re-using TMP from coord test setup is fine)
  const result = await scheduler.dispatchOne({ id: 'row-1', prompt: 'task one', preferred_account: 'tate', retry_count: 0 })
  if (!result.ok) throw new Error(`dispatch failed: ${result.error}`)
  if (result.account !== 'tate') throw new Error('account not tate')
  if (result.tab_id !== 'tab-row-1') throw new Error('tab_id missing')
})
```

(Note: the test setup needs to seed `/Users/ecodia/PRIVATE/ecodia-creds/tate.json`-equivalent in TMP. Reuse the seed-tate / seed-code / seed-money pattern from creds.test.js.)

- [ ] **Step 4: Run tests, expect PASS for the new tests**

```bash
node D:/.code/eos-laptop-agent/tools/scheduler.test.js
```

- [ ] **Step 5: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js D:/.code/eos-laptop-agent/tools/scheduler.test.js
git commit -m "feat(scheduler): leaseDueRows + dispatchOne with launch-lock, cred rotation, signal_bound wait"
```

### Task 3.3: Completion tracker (polling-based)

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.js`
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.test.js`

- [ ] **Step 1: Implement completion tracker as a poller**

Since coord.signal_done writes a file on disk, the simplest tracker is a poll loop that scans for running rows and checks for matching done-signals.

Add to scheduler.js:

```javascript
exports.completionPass = async function () {
  // Find rows in 'running' state
  const { rows } = await getPool().query(`
    SELECT * FROM os_scheduled_tasks
    WHERE status='running'
    ORDER BY leased_at ASC
    LIMIT 50
  `)
  for (const row of rows) {
    const signals = coord.list_signals({ task_id: row.id, kind: 'done' })
    if (signals.length === 0) continue
    const sig = signals[0]
    await exports.markComplete(row, sig)
  }
}

exports.markComplete = async function (row, signal) {
  if (signal.status === 'success') {
    if (row.type === 'cron') {
      const next = cronParser.parseExpression(row.cron_expression).next().toDate()
      await getPool().query(`
        UPDATE os_scheduled_tasks
        SET status='active',
            last_run_at=now(),
            next_run_at=$1,
            run_count=run_count+1,
            last_result=$2,
            retry_count=0,
            leased_by=NULL, leased_at=NULL,
            dispatched_tab_id=NULL
        WHERE id=$3
      `, [next, signal.summary, row.id])
    } else {
      await getPool().query(`
        UPDATE os_scheduled_tasks
        SET status='completed',
            last_run_at=now(),
            last_result=$1
        WHERE id=$2
      `, [signal.summary, row.id])
    }
  } else {
    await exports.markFailed(row, new Error(`task reported fail: ${signal.summary}`))
  }
  // Close the tab
  if (row.dispatched_tab_id) {
    try { await getDispatcher().close_tab({ tab_id: row.dispatched_tab_id }) }
    catch (e) { /* log + continue */ }
  }
  // Clear coord signals for this task to prevent re-processing
  coord.clear_signals({ task_id: row.id })
}
```

- [ ] **Step 2: Add test for completion tracker**

```javascript
await test('completionPass marks success + computes next_run_at for cron', async () => {
  // Stub Pool to return a running row
  const updates = []
  scheduler._setPool({
    query: async (sql, params) => {
      updates.push({sql, params})
      if (sql.includes("status='running'")) {
        return { rows: [{ id: 'cron-row-1', type: 'cron', cron_expression: '0 9 * * *', dispatched_tab_id: 'tab-x' }] }
      }
      return { rows: [] }
    }
  })
  coord.signal_done({ task_id: 'cron-row-1', status: 'success', summary: 'done' })
  await scheduler.completionPass()
  const updateSql = updates.find(u => u.sql.includes("status='active'"))
  if (!updateSql) throw new Error('cron row not marked active for next run')
  if (!updateSql.params[0]) throw new Error('next_run_at missing')
})

// stub close_tab on dispatcher
scheduler._setDispatcher({
  ...stubDispatcher,
  close_tab: async ({tab_id}) => { /* noop */ }
})
```

- [ ] **Step 3: Run tests, expect PASS**

```bash
node D:/.code/eos-laptop-agent/tools/scheduler.test.js
```

- [ ] **Step 4: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js D:/.code/eos-laptop-agent/tools/scheduler.test.js
git commit -m "feat(scheduler): completionPass marks complete, computes next_run_at, closes tab, clears signals"
```

### Task 3.4: Stale-lease recovery + main loops

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.js`

- [ ] **Step 1: Implement stale-lease recovery**

```javascript
exports.staleLeaseRecovery = async function () {
  // dispatching too long -> reset for retry (if under retry_count limit)
  await getPool().query(`
    UPDATE os_scheduled_tasks
    SET status='active',
        leased_by=NULL, leased_at=NULL,
        retry_count=retry_count+1,
        last_error='dispatch_lease_stale'
    WHERE status='dispatching'
      AND leased_at < now() - interval '10 minutes'
      AND retry_count < 3
  `)
  // dispatching retried too many times -> failed
  await getPool().query(`
    UPDATE os_scheduled_tasks
    SET status='failed',
        last_error='dispatch_loop_max_retries'
    WHERE status='dispatching' AND retry_count >= 3
  `)
  // running too long -> orphaned (no auto-reset)
  await getPool().query(`
    UPDATE os_scheduled_tasks
    SET status='orphaned',
        last_error='no_signal_done_within_6h'
    WHERE status='running' AND leased_at < now() - interval '6 hours'
  `)
}
```

- [ ] **Step 2: Implement main loops + start()**

```javascript
exports.start = function () {
  console.log('scheduler: starting dispatch loop + completion poller + stale-lease recovery')

  // Dispatch loop
  setInterval(async () => {
    try {
      const rows = await exports.leaseDueRows()
      for (const row of rows) {
        await exports.dispatchOne(row)
      }
    } catch (e) { console.error('dispatch loop:', e.message) }
  }, POLL_INTERVAL_MS)

  // Completion poller (every 5s for fast turnaround on short tasks)
  setInterval(async () => {
    try { await exports.completionPass() }
    catch (e) { console.error('completion pass:', e.message) }
  }, 5_000)

  // Stale-lease recovery (every 60s)
  setInterval(async () => {
    try { await exports.staleLeaseRecovery() }
    catch (e) { console.error('stale-lease recovery:', e.message) }
  }, STALE_LEASE_INTERVAL_MS)
}

if (require.main === module) {
  exports.start()
}
```

- [ ] **Step 3: Wire scheduler.start() into laptop-agent boot**

Edit `D:/.code/eos-laptop-agent/index.js`. After the Express server starts, require + start scheduler:

```javascript
const scheduler = require('./tools/scheduler')
scheduler.start()
```

Wrap in try/catch so a scheduler failure doesn't tank the whole agent.

- [ ] **Step 4: Restart laptop-agent**

```powershell
pm2 restart eos-laptop-agent
pm2 logs eos-laptop-agent --lines 50
```

Expect: log line `scheduler: starting dispatch loop + completion poller + stale-lease recovery`.

- [ ] **Step 5: Flip seed cron row to active**

```bash
set -a; . /Users/ecodia/PRIVATE/ecodia-creds/supabase.env; set +a
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"UPDATE os_scheduled_tasks SET status='\''active'\'' WHERE name='\''morning-briefing'\'' RETURNING id, status, next_run_at"}'
```

- [ ] **Step 6: Wait up to 30s, verify scheduler picked it up**

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT id, name, status, actual_account, dispatched_tab_id, last_result FROM os_scheduled_tasks WHERE name='\''morning-briefing'\''"}'
```

Expected: status transitions through `active -> dispatching -> running -> active` (cron resets), `actual_account` populated, `dispatched_tab_id` populated.

Also visually: a new CC chat tab opened in the dispatch IDE, ran the brief, called signal_done, and closed.

- [ ] **Step 7: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js D:/.code/eos-laptop-agent/index.js
git commit -m "feat(scheduler): stale-lease recovery + main loops + boot wiring"
```

---

## Phase 4: Tab cleanup + dispatch_worker.close_tab

### Task 4.1: Add close_tab to cowork.js

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/cowork.js`
- Modify: `D:/.code/eos-laptop-agent/tools/cowork.test.js` (or create)

- [ ] **Step 1: Read current cowork.js, find dispatch_worker implementation**

Locate how it focuses the IDE + sends keystrokes. Reuse the same primitives for close_tab.

- [ ] **Step 2: Implement close_tab**

```javascript
// In cowork.js - new export
exports.close_tab = async function ({ tab_id }) {
  // Strategy: focus the IDE, then send Ctrl+W (close active editor) repeatedly with
  // tab navigation to find the matching tab.
  //
  // SIMPLER v1: VS Code Stable command "workbench.action.closeActiveEditor" via keybind
  // requires the right tab to be active. Track tab_id -> position when dispatched,
  // then send Ctrl+<position> to focus, then Ctrl+W.
  //
  // For now: log + noop. Implementation deferred until dispatch_worker proves stable.
  console.log(`cowork.close_tab: ${tab_id} (noop in v1 - tabs accumulate)`)
  return { ok: true, noop: true }
}
```

(v1 ships with close_tab as noop. Tab accumulation is tolerable for the first week of operation; v1.1 implements the real close keybinding once the dispatch IDE choice is locked.)

- [ ] **Step 3: Update scheduler to tolerate noop close_tab gracefully**

The existing `markComplete` already wraps close_tab in try/catch, so noop is fine. Verify by code inspection.

- [ ] **Step 4: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/cowork.js
git commit -m "feat(cowork): close_tab stub (noop in v1, real impl deferred)"
```

### Task 4.2: Startup tab cleanup scan

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.js`

- [ ] **Step 1: Add startup cleanup function**

```javascript
exports.startupCleanup = async function () {
  // On boot: scan for completed rows in the last 24h with dispatched_tab_id still set.
  // These tabs may still be open. close_tab them, then NULL out dispatched_tab_id.
  const { rows } = await getPool().query(`
    SELECT id, dispatched_tab_id FROM os_scheduled_tasks
    WHERE status IN ('completed', 'failed', 'orphaned')
      AND dispatched_tab_id IS NOT NULL
      AND last_run_at > now() - interval '24 hours'
  `)
  for (const row of rows) {
    try { await getDispatcher().close_tab({ tab_id: row.dispatched_tab_id }) }
    catch (_) {}
    await getPool().query('UPDATE os_scheduled_tasks SET dispatched_tab_id=NULL WHERE id=$1', [row.id])
  }
  if (rows.length > 0) console.log(`scheduler: startup cleanup closed ${rows.length} stale tabs`)
}
```

Call `exports.startupCleanup()` from `exports.start()` at the top.

- [ ] **Step 2: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js
git commit -m "feat(scheduler): startup tab cleanup pass"
```

---

## Phase 5: Producers - VPS fire-shim rewrites

### Task 5.1: Choose a template engine + helper

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/eventTemplates.js`
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/templates/gmail_arrived.md`
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/templates/vercel_deploy_failed.md`
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/templates/status_alert.md`

- [ ] **Step 1: Pick the template engine**

Use plain string-replace with `{{payload.field}}` lookup. No new dependency. If a payload field is missing, the placeholder stays as the literal `{{payload.field}}` which is observable in logs.

- [ ] **Step 2: Write the template helper**

```javascript
// src/services/eventTemplates.js
const fs = require('fs')
const path = require('path')

const TEMPLATE_DIR = path.join(__dirname, '..', 'routes', 'webhooks', 'templates')

function lookup(payload, key) {
  // key like "payload.message_id" -> payload.message_id
  // dot-path traversal
  const parts = key.split('.')
  let cur = { payload }
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

exports.render = function (templateName, payload) {
  const file = path.join(TEMPLATE_DIR, `${templateName}.md`)
  const tpl = fs.readFileSync(file, 'utf8')
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const v = lookup(payload, key.trim())
    return v != null ? String(v) : `{{${key}}}`
  })
}
```

- [ ] **Step 3: Write three template files**

`gmail_arrived.md`:

```
A new email arrived. Triage it.

message_id: {{payload.message_id}}
from: {{payload.from}}
subject: {{payload.subject}}

Read backend/CLAUDE.md and ~/CLAUDE.md if needed for triage doctrine. Decide whether to: archive (low value), draft a reply for Tate's review, send a reply on your own (only for clearly transactional exchanges), escalate via sms.tate (urgent), or leave in inbox for Tate. Update status_board if this email represents new client work or a status change on existing work.
```

`vercel_deploy_failed.md`:

```
Vercel deploy failed.

project: {{payload.project_name}}
deployment_url: {{payload.deployment_url}}
git_branch: {{payload.git_branch}}
commit: {{payload.commit_sha}}

Investigate the failure. Read the deployment logs at {{payload.deployment_url}}, identify the root cause, decide whether to: retry (transient), roll back to previous deployment, fix and redeploy (push a fix commit), or escalate. Update status_board with the project + status.
```

`status_alert.md`:

```
A status_board row hit an alert threshold and needs attention.

row_id: {{payload.row_id}}
name: {{payload.name}}
reason: {{payload.alert_reason}}
current_status: {{payload.current_status}}

Investigate this row, decide and take action, then update the row's status + next_action accordingly.
```

- [ ] **Step 4: Test the template helper**

```javascript
// src/services/eventTemplates.test.js
const t = require('./eventTemplates')

const out = t.render('gmail_arrived', { message_id: 'abc', from: 'kurt@example.com', subject: 'hi' })
if (!out.includes('abc')) { console.error('fail: message_id not interpolated'); process.exit(1) }
if (!out.includes('kurt@example.com')) { console.error('fail: from not interpolated'); process.exit(1) }
console.log('ok render gmail_arrived')

const missing = t.render('gmail_arrived', { from: 'x' })  // message_id absent
if (!missing.includes('{{payload.message_id}}')) { console.error('fail: missing field not preserved'); process.exit(1) }
console.log('ok missing field preserved')
```

Run:

```bash
node /Users/ecodia/.code/ecodiaos/backend/src/services/eventTemplates.test.js
```

- [ ] **Step 5: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/src/services/eventTemplates.js /Users/ecodia/.code/ecodiaos/backend/src/services/eventTemplates.test.js /Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/templates/
git commit -m "feat(events): template engine + 3 starter event templates"
```

### Task 5.2: Rewrite gmail-fire-shim

**Files:**
- Modify: `/Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/gmail-fire-shim.js` (or whatever the actual file is named)
- Find: existing fire-shim location with `find ... -name "*gmail*fire*"`

- [ ] **Step 1: Locate the existing gmail fire-shim**

```bash
find /Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/ -iname "*gmail*"
```

- [ ] **Step 2: Read the current implementation**

Identify: how is the webhook payload parsed? How does the current code POST to `/api/routines/fire`?

- [ ] **Step 3: Rewrite to INSERT into os_scheduled_tasks**

```javascript
// gmail-fire-shim.js (rewritten)
const express = require('express')
const { Pool } = require('pg')
const router = express.Router()

const eventTemplates = require('../../services/eventTemplates')

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 4 })

router.post('/gmail/push', async (req, res) => {
  try {
    const payload = req.body  // expected: { message_id, from, subject, ... }
    if (!payload.message_id) return res.status(400).json({ error: 'message_id required' })
    const prompt = eventTemplates.render('gmail_arrived', payload)
    await pool.query(`
      INSERT INTO os_scheduled_tasks (type, name, prompt, next_run_at, status, priority, preferred_account, idempotency_key)
      VALUES ('one_shot', $1, $2, now(), 'active', 2, 'tate', $3)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      `gmail_arrived_${payload.message_id}`,
      prompt,
      `gmail_arrived_${payload.message_id}`,
    ])
    res.json({ ok: true, task_name: `gmail_arrived_${payload.message_id}` })
  } catch (err) {
    console.error('gmail-fire-shim:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 4: Test the rewrite locally with a mock payload**

```bash
curl -X POST http://localhost:3001/api/webhooks/gmail/push \
  -H "Content-Type: application/json" \
  -d '{"message_id":"smoke-1","from":"test@example.com","subject":"smoke test"}'
```

Then verify a row landed:

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT id, name, status, preferred_account FROM os_scheduled_tasks WHERE name='\''gmail_arrived_smoke-1'\''"}'
```

- [ ] **Step 5: Test idempotency by sending the same webhook twice**

```bash
curl -X POST http://localhost:3001/api/webhooks/gmail/push \
  -H "Content-Type: application/json" \
  -d '{"message_id":"smoke-1","from":"test@example.com","subject":"smoke test"}'
```

Verify still only one row:

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT count(*) FROM os_scheduled_tasks WHERE name='\''gmail_arrived_smoke-1'\''"}'
```

Expected: count = 1.

- [ ] **Step 6: Clean up smoke row**

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"DELETE FROM os_scheduled_tasks WHERE name='\''gmail_arrived_smoke-1'\''"}'
```

- [ ] **Step 7: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/gmail-fire-shim.js
git commit -m "feat(webhooks): gmail-fire-shim writes directly to os_scheduled_tasks (no Tailscale dependency)"
```

### Task 5.3: Rewrite vercel-fire-shim + status-alert producer

**Files:**
- Modify: existing vercel-fire-shim
- Create: status-alert webhook handler (or call site)

- [ ] **Step 1: Rewrite vercel-fire-shim**

Mirror gmail-fire-shim's shape. Endpoint `POST /api/webhooks/vercel/event`. On deploy-failed events, INSERT a task with template `vercel_deploy_failed`. Use `preferred_account: 'code'` and `priority: 1` (high).

- [ ] **Step 2: Create status_alert producer**

This is internal-only (no external webhook). The status_board hygiene system already fires alerts via observer signals. Add a function that, when fired, ALSO inserts an `os_scheduled_tasks` row so an autonomous chat can act on the alert.

In `/Users/ecodia/.code/ecodiaos/backend/src/services/statusBoardAlerts.js` (or wherever alerts are produced):

```javascript
async function enqueueStatusAlert({ row_id, name, alert_reason, current_status }) {
  await pool.query(`
    INSERT INTO os_scheduled_tasks (type, name, prompt, next_run_at, status, priority, idempotency_key)
    VALUES ('one_shot', $1, $2, now(), 'active', 1, $3)
    ON CONFLICT (idempotency_key) DO NOTHING
  `, [
    `status_alert_${row_id}_${Date.now()}`,
    eventTemplates.render('status_alert', { row_id, name, alert_reason, current_status }),
    `status_alert_${row_id}_${alert_reason}`,
  ])
}
```

- [ ] **Step 3: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/src/routes/webhooks/vercel-fire-shim.js /Users/ecodia/.code/ecodiaos/backend/src/services/statusBoardAlerts.js
git commit -m "feat(webhooks+alerts): vercel-fire-shim + status_alert producer write to os_scheduled_tasks"
```

---

## Phase 6: VPS watchdog

### Task 6.1: Implement corazonWatchdog.js

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/corazonWatchdog.js`
- Modify: VPS PM2 ecosystem to include the watchdog

- [ ] **Step 1: Write the watchdog**

```javascript
// corazonWatchdog.js - VPS-resident, monitors Corazon laptop-agent + scheduler health
const http = require('http')
const { Pool } = require('pg')

const LAPTOP_AGENT_URL = process.env.LAPTOP_AGENT_URL || 'http://100.114.219.69:7456'
const HEALTH_PATH = '/api/health'
const POLL_INTERVAL_MS = 5 * 60 * 1000
const FAILURE_THRESHOLD = 3
const OVERDUE_TASK_THRESHOLD = 20

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL })

let consecutiveFailures = 0
const alertedKeys = new Set()

async function smsTate(msg) {
  // Use existing sms.tate service. Either via direct SMS or via existing MCP. For
  // VPS-resident service, call into the existing Twilio integration.
  const sms = require('./smsTate')  // assume existing module
  await sms.send(msg)
}

async function pingLaptopAgent() {
  return new Promise((resolve) => {
    const req = http.get(LAPTOP_AGENT_URL + HEALTH_PATH, { timeout: 10000 }, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function checkQueueBackup() {
  const { rows } = await pool.query(`
    SELECT count(*)::int as n FROM os_scheduled_tasks
    WHERE status='active' AND next_run_at < now() - interval '30 minutes'
  `)
  return rows[0].n
}

async function checkOrphaned() {
  const { rows } = await pool.query(`SELECT count(*)::int as n FROM os_scheduled_tasks WHERE status='orphaned'`)
  return rows[0].n
}

async function checkRefreshFailures() {
  // Reads kv_store rows with prefix creds.refresh_failure.
  const { rows } = await pool.query(`SELECT key, value FROM kv_store WHERE key LIKE 'creds.refresh_failure.%'`)
  return rows.map(r => ({ key: r.key, value: typeof r.value === 'string' ? JSON.parse(r.value) : r.value }))
}

async function pass() {
  // 1. Health
  const healthy = await pingLaptopAgent()
  if (!healthy) {
    consecutiveFailures++
    if (consecutiveFailures === FAILURE_THRESHOLD) {
      await smsTate('EcodiaOS alert: laptop-agent unreachable for 15+ min')
    }
  } else {
    consecutiveFailures = 0
  }

  // 2. Queue backup
  const overdue = await checkQueueBackup()
  if (overdue > OVERDUE_TASK_THRESHOLD && !alertedKeys.has('queue_backup')) {
    await smsTate(`EcodiaOS alert: ${overdue} scheduled tasks overdue`)
    alertedKeys.add('queue_backup')
    setTimeout(() => alertedKeys.delete('queue_backup'), 60 * 60 * 1000)  // reset after 1h
  }

  // 3. Refresh failures
  const refreshFails = await checkRefreshFailures()
  for (const f of refreshFails) {
    if (alertedKeys.has(f.key)) continue
    const account = f.key.split('.').pop()
    await smsTate(`EcodiaOS alert: cred refresh failing for ${account} (${f.value.last_error})`)
    alertedKeys.add(f.key)
    setTimeout(() => alertedKeys.delete(f.key), 60 * 60 * 1000)
  }

  // 4. Orphaned
  const orphaned = await checkOrphaned()
  if (orphaned > 0 && !alertedKeys.has('orphaned')) {
    await smsTate(`EcodiaOS alert: ${orphaned} orphaned tasks (>6h running, no signal_done)`)
    alertedKeys.add('orphaned')
    setTimeout(() => alertedKeys.delete('orphaned'), 60 * 60 * 1000)
  }
}

exports.start = function () {
  console.log('corazonWatchdog: started')
  pass().catch(e => console.error('initial pass:', e))
  setInterval(() => pass().catch(e => console.error('pass error:', e)), POLL_INTERVAL_MS)
}

if (require.main === module) {
  exports.start()
}
```

- [ ] **Step 2: Add to VPS PM2 ecosystem**

Edit the VPS-side `ecosystem.config.js` (likely at `/Users/ecodia/.code/ecodiaos/backend/ecosystem.config.js` or remote `~/ecodiaos/ecosystem.config.js`). Add:

```javascript
{
  name: 'corazon-watchdog',
  script: './src/services/corazonWatchdog.js',
  cwd: '/home/tate/ecodiaos',
  autorestart: true,
  watch: false,
  max_memory_restart: '100M',
  env: {
    SUPABASE_DB_URL: '...',
    LAPTOP_AGENT_URL: 'http://100.114.219.69:7456',
  },
}
```

- [ ] **Step 3: Deploy watchdog to VPS**

```bash
ssh tate@100.103.227.90 'cd ~/ecodiaos && git pull && pm2 reload ecosystem.config.js --only corazon-watchdog'
```

- [ ] **Step 4: Verify watchdog is running**

```bash
ssh tate@100.103.227.90 'source ~/.nvm/nvm.sh && pm2 list | grep corazon-watchdog'
```

Expected: status `online`.

- [ ] **Step 5: Smoke-test by stopping laptop-agent briefly**

```powershell
pm2 stop eos-laptop-agent
```

Wait 15+ minutes. Confirm SMS received. Then:

```powershell
pm2 start eos-laptop-agent
```

- [ ] **Step 6: Disable old VPS schedulerPollerService**

Now that the watchdog is running and the new scheduler is taking over from Corazon, the old VPS scheduler poller must be stopped to prevent double-dispatch:

```bash
ssh tate@100.103.227.90 'source ~/.nvm/nvm.sh && pm2 stop scheduler-poller && pm2 save'
```

(Adjust the name to match the actual PM2 process name on VPS.)

- [ ] **Step 7: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/src/services/corazonWatchdog.js /Users/ecodia/.code/ecodiaos/backend/ecosystem.config.js
git commit -m "feat(watchdog): VPS corazonWatchdog with 4 health checks + SMS escalation; stop old scheduler-poller"
```

---

## Phase 7: Usage-cap observer

### Task 7.1: Add usage-cap observer to scheduler

**Files:**
- Modify: `D:/.code/eos-laptop-agent/tools/scheduler.js`

- [ ] **Step 1: Implement observer**

```javascript
// In scheduler.js
const HEADROOM_WARN_THRESHOLD_MIN = 15

let lastCapWarning = { account: null, at: 0 }

exports.checkCapWarning = async function () {
  const current = creds.current_account()
  if (current === 'unknown') return

  const usage = require('./usage')
  const state = await usage.get_usage_state(current)
  if (!state || state.headroom_minutes > HEADROOM_WARN_THRESHOLD_MIN) return

  // Anti-spam: only re-warn after 1h of same-account state
  const now = Date.now()
  if (lastCapWarning.account === current && now - lastCapWarning.at < 60 * 60 * 1000) return
  lastCapWarning = { account: current, at: now }

  // Pick next-healthiest
  let next
  try {
    next = await creds.pick_healthiest_account({ required_headroom_minutes: 30 })
  } catch (e) {
    next = null
  }
  if (next === current) return  // no useful alternative

  const nextState = next ? await usage.get_usage_state(next) : null
  const msg = next
    ? `Current account (${current}) is capping in ${Math.floor(state.headroom_minutes)} minutes. Next-healthiest account (${next}) has ${Math.floor(nextState.headroom_minutes)} minutes of headroom. When convenient, finish your turn and open a new chat - it will land on ${next} automatically.`
    : `Current account (${current}) is capping in ${Math.floor(state.headroom_minutes)} minutes. All other accounts are also low. Reduce non-urgent work until reset.`

  // Write to observer_signals substrate
  await getPool().query(`
    INSERT INTO observer_signals (kind, source, message, target_chat_id, created_at)
    VALUES ('usage_cap_warning', 'autonomy-substrate', $1, NULL, now())
  `, [msg])
}
```

Wire it into `start()`:

```javascript
setInterval(() => exports.checkCapWarning().catch(e => console.error('cap warning:', e)), 5 * 60 * 1000)
```

- [ ] **Step 2: Verify observer_signals table exists**

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='\''observer_signals'\''"}'
```

If table doesn't exist, see migrations for the canonical schema and add a migration. (CLAUDE.md references observer_signals as already-shipped.)

- [ ] **Step 3: Restart laptop-agent + verify check fires**

```powershell
pm2 restart eos-laptop-agent
```

Wait 5min. Tail logs. If your current account has >15min headroom, observer won't fire - that's correct.

- [ ] **Step 4: Commit**

```bash
git add D:/.code/eos-laptop-agent/tools/scheduler.js
git commit -m "feat(scheduler): usage-cap observer warns when current account approaches cap"
```

---

## Phase 8: Manual New CC Chat dispatch path

### Task 8.1: Add manual_chat endpoint + rebound keybinding

**Files:**
- Modify: `D:/.code/eos-laptop-agent/index.js` (or routes/) - add /api/scheduler/manual_chat
- Modify: VS Code Stable keybindings.json - rebind "new chat" to a custom command

- [ ] **Step 1: Add endpoint to laptop-agent**

```javascript
// In index.js or a new routes/scheduler.js
app.post('/api/scheduler/manual_chat', async (req, res) => {
  try {
    const creds = require('./tools/creds')
    const cowork = require('./tools/cowork')
    const account = await creds.pick_healthiest_account({})
    await creds.rotate_to(account)
    const brief = req.body.brief || 'New manual chat.'
    const result = await cowork.dispatch_worker({ brief, task_id: `manual-${Date.now()}` })
    res.json({ ok: true, account, tab_id: result.tab_id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 2: Smoke-test the endpoint**

```bash
curl -X POST http://localhost:7456/api/scheduler/manual_chat \
  -H "Content-Type: application/json" \
  -d '{"brief":"This is a manual smoke test. Reply with the account you are on."}'
```

A new tab should open with cred rotation applied. The chat replies with which account it's on.

- [ ] **Step 3: Decide path A vs path B**

Per spec Component 7. The cleanest path is to remap your IDE's "new chat" keybinding to instead trigger this endpoint. The implementation depends on the IDE:

- For VS Code Stable: the existing keybinding can call a registered extension command that POSTs to localhost:7456/api/scheduler/manual_chat. This requires a tiny custom VS Code extension OR using a "Run a Command" extension that supports HTTP triggers.
- Alternative (path B): Document that manual chats bypass the rotation. The observer signal (Phase 7) tells Tate to use a slash command instead.

For v1: ship the HTTP endpoint. Document path A as future work. Document path B in the README at `D:/.code/eos-laptop-agent/README.md`: "if you open a manual chat from the IDE UI, it will use whichever account is currently in .credentials.json. To get rotation, POST to /api/scheduler/manual_chat instead."

- [ ] **Step 4: Commit**

```bash
git add D:/.code/eos-laptop-agent/index.js D:/.code/eos-laptop-agent/README.md
git commit -m "feat(scheduler): manual_chat endpoint for cred-rotated manual chat spawn"
```

---

## Phase 9: Migration + cutover

### Task 9.1: Disable Anthropic Routines that the new scheduler replaces

**Files:**
- (External) claude.ai/code/routines UI

- [ ] **Step 1: List Anthropic Routines currently firing**

In claude.ai/code/routines for each of tate@, code@, money@: list every scheduled routine. Cross-reference against `backend/routines/*.md`.

- [ ] **Step 2: Migrate each routine to an os_scheduled_tasks cron row**

For each routine identified:
- Read the routine's prompt body.
- INSERT a cron row into os_scheduled_tasks with the same schedule + that prompt as `prompt` field + appropriate `preferred_account`.
- Disable the Anthropic Routine.

Do this one at a time, watching that the cron row fires correctly on the new scheduler before disabling the Anthropic version.

- [ ] **Step 3: Document migration progress**

In findings doc, add a migration log:

```markdown
## Routine migration log

| Routine name | Anthropic acct | New cron row id | Status |
|---|---|---|---|
| meta-loop | tate@ | <uuid> | migrated 2026-05-27 |
| email-triage | tate@ | <uuid> | migrated 2026-05-27 |
| ... | ... | ... | ... |
```

- [ ] **Step 4: Commit findings update**

```bash
git add docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
git commit -m "docs(phase9): routine migration log"
```

### Task 9.2: 48-hour soak test

**Files:**
- (None) - operational task

- [ ] **Step 1: Set a checkpoint marker**

Record in findings doc: soak test started `<timestamp>`. Initial state: laptop-agent uptime, count of active os_scheduled_tasks rows, count of running tabs, current account.

- [ ] **Step 2: Let the system run for 48 hours**

Don't touch the scheduler. Use the IDE normally. Send manual chats via the endpoint.

- [ ] **Step 3: Monitor for issues**

Every 12h, query:

```bash
curl -X POST "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT status, count(*) FROM os_scheduled_tasks GROUP BY status ORDER BY 2 DESC"}'
```

Look for: orphaned > 0 (investigate each), failed > 0 (investigate), running > 5 (stuck dispatches).

- [ ] **Step 4: Record findings**

After 48h: append soak-test findings to findings doc with totals, any incidents, any tabs accumulated.

---

## Phase 10: Documentation pass

### Task 10.1: Update CLAUDE.md + memory + patterns

**Files:**
- Modify: `/Users/ecodia/.code/ecodiaos/backend/CLAUDE.md` (relevant sections)
- Create: `/Users/ecodia/.code/ecodiaos/backend/patterns/autonomous-scheduler-on-laptop-agent-2026-05-26.md`
- Create: `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/reference_autonomy_substrate_2026-05-26.md`

- [ ] **Step 1: Write the pattern file**

```markdown
---
triggers: autonomy, scheduler, cron-cc-chat, autonomous-fire, account-rotation, cred-rotation, dispatch_worker, signal_bound, signal_done, os_scheduled_tasks, refresh-clobber-watchdog, never-fs-watch-credentials
description: The autonomous scheduling substrate that fires CC chats on schedule and on events. Where to look + what to never do.
---

# Autonomy substrate - scheduler on eos-laptop-agent (2026-05-26)

The substrate that spawns CC chats autonomously. Lives in eos-laptop-agent, polls os_scheduled_tasks in Postgres, rotates per-account creds at chat-launch time only.

(... include the architectural summary + non-negotiables + cross-refs to design spec ...)

## Non-negotiable invariants

1. Nothing watches ~/.claude/.credentials.json with fs.watch (or any other mechanism).
2. The cred-refresher daemon reads + writes ONLY to /Users/ecodia/PRIVATE/ecodia-creds/{account}.json.
3. Mid-session credential swap for already-running chats is impossible. Don't try.
4. Sequential rotation only. No multi-IDE binding (rejected by Tate).

## Where to look

- Design spec: docs/superpowers/specs/2026-05-26-autonomy-substrate-design.md
- Implementation plan: docs/superpowers/plans/2026-05-26-autonomy-substrate.md
- Findings: docs/superpowers/plans/2026-05-26-autonomy-substrate-findings.md
- Scheduler module: D:/.code/eos-laptop-agent/tools/scheduler.js
- Cred-rotation: D:/.code/eos-laptop-agent/tools/creds.js
- Refresher daemon: D:/.code/eos-laptop-agent/daemons/cred-refresher.js
- VPS watchdog: /Users/ecodia/.code/ecodiaos/backend/src/services/corazonWatchdog.js

## Past failure to NOT recreate

refresh-clobber-watchdog.js (May 2026 incident, 2 days of debugging). The file watcher restored stale tokens within 300ms of every fresh login. Killed by deletion + cleaning ~/.ecodia-creds/. The new substrate exists in part to make this class of bug impossible by construction.
```

- [ ] **Step 2: Update backend/CLAUDE.md with new section**

Add a section near the existing scheduler doctrine pointing at this new pattern + the new substrate. Note the deprecation of the old VPS poller path.

- [ ] **Step 3: Write the auto-memory reference**

`C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/reference_autonomy_substrate_2026-05-26.md`:

```markdown
---
name: reference-autonomy-substrate-2026-05-26
description: Autonomy substrate (scheduler + cred rotation) lives on eos-laptop-agent. os_scheduled_tasks is the durable queue. /Users/ecodia/PRIVATE/ecodia-creds/ holds per-account OAuth files. Refresh-clobber-watchdog.js is forbidden.
metadata:
  type: reference
---

Autonomy substrate shipped 2026-05-26. Scheduler module in D:/.code/eos-laptop-agent/tools/scheduler.js polls Supabase os_scheduled_tasks every 30s, rotates ~/.claude/.credentials.json from /Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json at chat-launch only, dispatches via cowork.dispatch_worker, tracks via coord.signal_done. VPS watchdog at backend/src/services/corazonWatchdog.js SMSes on substrate failures. Sequential account rotation only (no parallel IDEs - rejected by Tate). Mid-session swap impossible by design. Never fs.watch the credentials file - that's the refresh-clobber regression. See [[design-spec-link]] + [[implementation-plan-link]] + [[findings-doc-link]].
```

- [ ] **Step 4: Update MEMORY.md index**

Add line:

```markdown
- [reference_autonomy_substrate_2026-05-26.md](reference_autonomy_substrate_2026-05-26.md) - **AUTONOMY 2026-05-26** Scheduler + cred rotation on eos-laptop-agent. Sequential rotation, never fs.watch creds.
```

- [ ] **Step 5: Commit**

```bash
git add /Users/ecodia/.code/ecodiaos/backend/patterns/autonomous-scheduler-on-laptop-agent-2026-05-26.md /Users/ecodia/.code/ecodiaos/backend/CLAUDE.md
git commit -m "docs(autonomy): pattern + CLAUDE.md update for autonomous scheduler"
```

(Memory file is outside git scope - just save it.)

### Task 10.2: Write Neo4j Decision + Episode

**Files:**
- (External) Neo4j via mcp tools

- [ ] **Step 1: Write a Decision node**

```
graph_merge_node(label="Decision", properties={
  name: "Autonomy substrate: sequential cred rotation in single VS Code Stable",
  description: "Built scheduler on eos-laptop-agent that polls os_scheduled_tasks, rotates ~/.claude/.credentials.json at chat-launch, fires via dispatch_worker. Sequential rotation between accounts only - parallel-different-accounts via multi-IDE explicitly rejected by Tate. Refresh-clobber-watchdog regression prevented by architecture (zero file-watching).",
  date: "2026-05-26",
  supersedes: "refresh-clobber-watchdog.js architecture"
})
```

- [ ] **Step 2: Write an Episode node**

```
graph_merge_node(label="Episode", properties={
  name: "Autonomy substrate shipped",
  description: "Brainstormed + spec'd + planned + shipped scheduler + cred-rotation substrate over <N> days. Two review passes from sister chats sharpened the design before implementation. v1 cut active-chat-rotation + per-turn conversation streaming. Phase 0 verification gates resolved 4 hard prerequisites (IDE target, OAuth refresh shape, coord signals, MCP auto-connect). 48h soak test passed.",
  created_at: "<implementation completion timestamp>"
})
```

- [ ] **Step 3: Confirm writes succeeded**

```
neo4j_search(mode="cypher", query="MATCH (d:Decision) WHERE d.name CONTAINS 'Autonomy substrate' RETURN d")
```

- [ ] **Step 4: Done**

This phase is complete when both Neo4j nodes are written and verified, the pattern file is on disk + committed, and the auto-memory reference is on disk.

---

## Self-review checklist

After executing the plan, run through this list before declaring done:

- [ ] Phase 0 findings doc has all four prerequisite sections filled in with real values.
- [ ] `/Users/ecodia/PRIVATE/ecodia-creds/{tate,code,money}.json` all exist + are valid OAuth files.
- [ ] `refresh-clobber-watchdog.js` does NOT exist on disk + is not in PM2.
- [ ] `os_scheduled_tasks` table has all new columns + status values per migration 130.
- [ ] `node tools/creds.test.js` exits 0 with the fs.watch regression test passing.
- [ ] `node tools/scheduler.test.js` exits 0.
- [ ] `node daemons/cred-refresher.test.js` exits 0.
- [ ] `pm2 list` shows `eos-laptop-agent` + `cred-refresher` both `online` on Corazon.
- [ ] `pm2 list` on VPS shows `corazon-watchdog` online + the old scheduler-poller stopped.
- [ ] Seed cron row (`morning-briefing`) has fired at least once with `actual_account` populated.
- [ ] At least one gmail event has triggered an autonomous triage chat end-to-end.
- [ ] 48-hour soak test completed with no orphaned tasks accumulating + no manual interventions.
- [ ] Pattern file + auto-memory + Neo4j Decision/Episode all written.
- [ ] CLAUDE.md updated.

---

## Open items deferred to v1.1+

- close_tab implementation (currently noop) - real keybinding for the chosen IDE.
- Manual New CC Chat keybinding routed through laptop-agent (currently HTTP-only).
- Per-turn conversation streaming (cut from v1).
- Active-chat-rotation with context handoff (cut from v1).
- Goal-based scheduling (open-ended goals decomposed into chats).
- CDP focusless multi-tab parallelism - has its own spec.
