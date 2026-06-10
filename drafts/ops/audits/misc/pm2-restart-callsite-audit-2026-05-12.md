# pm2 restart ecodia-api Callsite Audit
**Date:** 12 May 2026  
**Author:** fork_mp1xbay8_19c59d  
**Trigger:** 4-fork SIGTERM cascade at 10:50 AEST (00:50 UTC) caused by fork_mp1wwwl0_6d2263

---

## Grep command used

```bash
grep -rn "pm2 restart ecodia-api\|pm2_restart\|pmRestart\|pm2\.restart" \
  ~/ecodiaos/src/ ~/ecodiaos/scripts/ 2>/dev/null
```

---

## Callsite inventory

### 1. `src/services/osSessionService.js:826`

**Code:**
```javascript
exec('pm2 restart ecodia-api', { timeout: 10000 }, (err, stdout, stderr) => { ... })
```

**Context:** Emergency auto-restart after N consecutive turn failures. Fires when the conductor's
own turn loop has failed repeatedly and the process appears wedged.

**Fork-reachable?** No. This runs inside the main OS session handler (conductor-side). Forks
cannot trigger this code path directly.

**Classification:** Allowlisted emergency bypass. Updated in this fork to call
`conductedRestart.request()` for audit trail before firing. Still executes immediately -
this is an emergency recovery path that cannot wait for the meta-loop.

**Action taken:** Added `conductedRestart.request()` audit call before the `exec()`. Row will
show `status='pending'` briefly then the conductor immediately proceeds with the restart.

---

### 2. `src/services/nightlyRestartService.js` (multiple lines)

**Code:**
```javascript
const child = spawn('pm2', ['restart', PM2_PROCESS], { detached: true, stdio: 'ignore' })
child.unref()
```

**Context:** Nightly scheduled restart at 03:00 AEST. Runs in ecodia-conductor process
(loaded by `conductor.js` when `CONDUCTOR_OWNS_WORKERS=true`). Has T-5min warning broadcast,
busy-check grace window (10 min default), and snapshot handoff.

**Fork-reachable?** No. Runs in the conductor process, not in ecodia-api or any fork.
The conductor IS the coordinator here.

**Classification:** Allowlisted. Conductor-owned with full safety checks already implemented.

**Action taken:** None. Already safe. Added to allowlist documentation in pattern file.

---

### 3. `src/conductor.js:390` and `:457`

**Code:** These are COMMENTS only - not executable code paths:
```
//   Step 4 - pm2 restart ecodia-api --update-env
// Schedules pm2 restart ecodia-api at 03:00 AEST.
```

**Fork-reachable?** N/A - comments only.

**Classification:** Documentation. Line 390 is in the Phase 3 activation manual procedure
(the procedure that fork_mp1wwwl0_6d2263 was executing when it caused the cascade).
Line 457 refers to nightlyRestartService.

**Action taken:** None. The comments are accurate - they describe the conductor-level
procedure. The fork that executed Step 4 should have used conductedRestart.request() instead
of issuing the restart directly.

---

### 4. `scripts/api-watchdog.sh:103`

**Code:**
```bash
pm2 restart ecodia-api 2>/dev/null || log "pm2_failed" "restart_error"
```

**Context:** External health watchdog. Runs from host-level cron (not inside ecodia-api).
Fires only after sustained unhealthy period (30s blip window). Sends SMS alert if still down
after restart.

**Fork-reachable?** No. Runs from the OS cron daemon, completely outside the ecodia-api
process tree.

**Classification:** Allowlisted. Runs at OS level with blip detection; if ecodia-api is
so broken that the watchdog fires, the process is already dead and there are no forks to protect.

**Action taken:** None. Already safe.

---

## Summary

| Callsite | File | Fork-reachable | Action |
|---|---|---|---|
| auto-restart emergency | `osSessionService.js:826` | No (conductor-side) | Added audit trail call |
| nightly restart | `nightlyRestartService.js` | No (conductor process) | None - already safe |
| Phase 3 procedure comments | `conductor.js:390,457` | N/A (comments) | None |
| OS watchdog | `scripts/api-watchdog.sh:103` | No (host cron) | None - already safe |

**Conclusion:** No existing SOURCE CODE callsite is directly fork-callable. Today's cascade
was caused by a fork using `mcp__vps__pm2_restart` or `mcp__vps__shell_exec` MCP tools
directly - these are primitive MCP tool calls, not tracked code paths.

The structural fix is therefore:
1. The `conductedRestart.js` chokepoint + REST endpoint provides the correct fork-callable path
2. The pattern file prohibits MCP tool calls that bypass it
3. The CLAUDE.md cultural rule ensures fork briefs never include direct restart steps

---

## The culprit fork

**`fork_mp1wwwl0_6d2263`** - "CONDUCTOR SIBLING ACTIVATION - Phase 3 completion"  
Started: 2026-05-12 00:48:37 UTC  
Ended: 2026-05-12 00:51:31 UTC  

Brief included Phase 3 activation which referenced `pm2 restart ecodia-api --update-env`
as Step 4. The fork executed this directly via MCP pm2_restart or shell_exec, without:
- Checking `<forks_rollup>` for active siblings
- Writing to a coordination table
- Waiting for conductor approval

Concurrent forks killed in the same restart window:
- `fork_mp1ww91a_bde15b` (KG embedding) - ended 00:49:37 UTC
- `fork_mp1wygib_046e05` (transcript feature) - crashed 00:49:57 UTC
- `fork_mp1wz62q_06fa0e` (Neo4j keep-alive) - killed during run
- `fork_mp1wzihc_9ad276` (KG consolidation) - ended 00:51:40 UTC (likely killed mid-work)

---

## Chokepoint migration

**`src/services/conductedRestart.js`** shipped in this fork (fork_mp1xbay8_19c59d).

REST endpoint: `POST /api/os-session/request-restart` (added to `src/routes/osSession.js`).

Migration: `pending_restart_requests` table created via db_execute.

Future forks receiving Phase 3 / deployment / config-reload activation briefs must include:
- DO NOT issue `pm2 restart` directly
- Write to `pending_restart_requests` via endpoint or db_execute
- Note in FORK_REPORT that restart was requested
