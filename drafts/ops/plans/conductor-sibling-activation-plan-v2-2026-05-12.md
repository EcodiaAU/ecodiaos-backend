# Conductor Sibling Activation Plan v2
# Updated: 12 May 2026 - fork_mp1n7bm3_a5d11f
# Supersedes: drafts/conductor-sibling-activation-plan-2026-05-08.md (Phase 3 section)

## Status

- Phase 1 (fork_mol0vfnr_78c3e4): DONE - conductor.js process detached, PM2 entry added
- Phase 2 (fork_mp1mrgs4_f2ba17, commit 092e4bc): DONE - HTTP loopback bridge shipped
- Phase 2 follow-up (fork_mp1n7bm3_a5d11f, commit 041646a): DONE - two bugs fixed (see below)
- Phase 3: READY TO ACTIVATE (main session op)

## Bugs fixed in 041646a

### Bug 1: Bearer always 401 with correct token

Root cause: `kv_store.value` column is `TEXT`, not `JSONB`. The Postgres driver
returns the raw JSON string `'{"value":"<hex>","note":"...","created_at":"..."}'`.

Old code (broken):
```javascript
const val = rows[0].value
_loopbackSecret = typeof val === 'string' ? val : val.value
// typeof raw JSON string === 'string' -> assigned 130-char JSON blob as secret
// checkBearer: token.length (64) !== secret.length (130) -> immediate false
```

New code (fixed):
```javascript
const raw = rows[0].value
let parsed
try { parsed = JSON.parse(raw) } catch { parsed = raw }
_loopbackSecret = typeof parsed === 'string' ? parsed : parsed.value
// parsed is now the object -> parsed.value is the 64-char hex secret
```

Verification: unit test confirmed old=130 chars (broken), new=64 chars (correct).

### Bug 2: Workers double-running when conductor started before api restart

Root cause: all 7 background workers started unconditionally in conductor.js boot
sequence. Starting ecodia-conductor before running `pm2 restart ecodia-api --update-env`
caused both processes to own the same workers simultaneously (double cron fires,
heartbeat bounce, token refresh race).

Fix: all 7 worker starts are now gated on `CONDUCTOR_OWNS_WORKERS=true` env var.
Without it, conductor boots ONLY the HTTP loopback bridge. This makes Phase 2
(pre-activation) completely safe - no state corruption from running conductor
alongside api.

## Phase 3 Atomic Activation Sequence

### Prerequisites
- 041646a is on origin/main (verified pushed)
- ecodia-conductor is currently STOPPED (verified)
- ecodia-api is running WITHOUT CONDUCTOR_DETACHED active (ecosystem.config.js
  has it set but api was started before that commit landed - it will pick it up
  on the next restart in Step 4)

### Steps

**Step 1 - git pull**
```bash
cd /home/tate/ecodiaos && git pull
```
Ensure 041646a is present on disk.

**Step 2 - Start conductor in bridge-only mode**
```bash
pm2 start ecosystem.config.js --only ecodia-conductor
```
CONDUCTOR_OWNS_WORKERS is absent from the ecosystem entry -> conductor starts
ONLY the HTTP loopback bridge on 127.0.0.1:3002. No workers start. No
double-running with ecodia-api.

Expected pm2 logs within 5s:
```
[conductor] starting (Phase 2 HTTP loopback bridge - fork_mp1mrgs4_f2ba17)
[conductor] CONDUCTOR_OWNS_WORKERS not set - HTTP bridge only (Phase 2 mode, no worker double-run)
[conductor] HTTP loopback server listening on 127.0.0.1:3002
[conductor] boot complete - conductor ready
```

**Step 3 - Smoke /status with bearer**
```bash
SECRET=$(node -e "const db=require('./src/config/db');db\`SELECT value FROM kv_store WHERE key='creds.conductor_loopback_secret'\`.then(r=>{console.log(JSON.parse(r[0].value).value);db.end()})")
curl -s -H "Authorization: Bearer $SECRET" http://127.0.0.1:3002/status | jq .conductor
```
Expected response: `{"pid": N, "uptime_s": N, "active_fork_count": 0}`

If this returns 401 -> stop, investigate. Do NOT proceed to Step 4.

**Step 4 - Restart ecodia-api with --update-env**
```bash
pm2 restart ecodia-api --update-env
```
CONDUCTOR_DETACHED=true is already in ecosystem.config.js for ecodia-api. On
restart, ecodia-api picks it up and:
- Skips starting its own workers (schedulerPoller, messageQueue, osHeartbeat,
  claudeTokenRefresh, nightlyRestart, claimVerifier, proactivityEngine)
- Routes POST /message, POST /abort, GET /status, POST /save-state through
  the loopback bridge to conductor

Workers are now briefly unowned (conductor bridge-only, api skipped them). This
window is short (seconds) and safe - no cron fires are lost, the scheduler
poller will resume on the next 30s tick after Step 6.

**Step 5 - Confirm api healthy**
```bash
pm2 list
curl -s http://localhost:3001/api/health | jq .status
```
Expected: api online, health returns ok/healthy.

If api is restart-looping -> check pm2 logs ecodia-api, likely a require() error
from a service that couldn't init. CONDUCTOR_DETACHED=true is guarded in server.js
so known-good path.

**Step 6 - Add CONDUCTOR_OWNS_WORKERS to ecosystem.config.js**

Edit `/home/tate/ecodiaos/ecosystem.config.js`, find the ecodia-conductor entry,
change:
```javascript
env: { ...COMMON.env, CONDUCTOR_PROCESS: 'true', OS_CONV_LOG_ENABLED: 'true',
       KG_CONTEXT_MAX_DEPTH: '3', KG_CONTEXT_MAX_SEEDS: '8', CONDUCTOR_LOOPBACK_PORT: '3002' }
```
to:
```javascript
env: { ...COMMON.env, CONDUCTOR_PROCESS: 'true', OS_CONV_LOG_ENABLED: 'true',
       KG_CONTEXT_MAX_DEPTH: '3', KG_CONTEXT_MAX_SEEDS: '8', CONDUCTOR_LOOPBACK_PORT: '3002',
       CONDUCTOR_OWNS_WORKERS: 'true' }
```
Then commit that change so it persists across pm2 restarts.

**Step 7 - Restart conductor to activate worker ownership**
```bash
pm2 restart ecodia-conductor --update-env
```
Conductor picks up CONDUCTOR_OWNS_WORKERS=true and starts all 7 workers.

Expected pm2 logs within 10s:
```
[conductor] CONDUCTOR_OWNS_WORKERS=true - starting all background workers
[conductor] scheduler poller started
[conductor] message queue sweep started
[conductor] OS heartbeat started
[conductor] Claude token refresh started
[conductor] nightly restart service started
[conductor] claim verifier worker started
[conductor] proactivity engine started
[conductor] HTTP loopback server listening on 127.0.0.1:3002
[conductor] boot complete - conductor ready
```

**Step 8 - Final verification**
```bash
pm2 logs ecodia-conductor --lines 30
pm2 list
curl -s -H "Authorization: Bearer $SECRET" http://127.0.0.1:3002/status | jq
```
Expect: all 7 worker started log lines visible, pm2 list shows both
ecodia-api and ecodia-conductor online, /status returns conductor.pid.

## Rollback

If any step fails after Step 4 (api restarted without workers):
```bash
# Remove CONDUCTOR_DETACHED from api env temporarily by editing ecosystem.config.js
# and reverting, then:
pm2 restart ecodia-api --update-env  # api picks up workers again
pm2 stop ecodia-conductor
```
The codebase is backward-compatible - CONDUCTOR_DETACHED absent = api runs
in-process as before.

## Consumer audit (cred-rotation-must-propagate rule)

The bearer at kv_store.creds.conductor_loopback_secret has two consumers:
1. conductor.js - reads via getLoopbackSecret() (fixed in 041646a)
2. osSession.js routes - reads from kv_store to proxy requests (should use
   same JSON.parse path; verify before Phase 3 if not already confirmed)

Both consumers must parse the TEXT column the same way. If osSession.js uses
a different read pattern, it may also have this bug. Check before activating.

## Key files

- src/conductor.js (fixes: 041646a)
- ecosystem.config.js (fixes: 041646a; Step 6 adds CONDUCTOR_OWNS_WORKERS)
- src/routes/osSession.js (proxy logic shipped in 092e4bc)
- docs/secrets/conductor-loopback-secret.md (rotation instructions)
- tests/smoke-conductor-loopback.js (18 tests, all pass)
