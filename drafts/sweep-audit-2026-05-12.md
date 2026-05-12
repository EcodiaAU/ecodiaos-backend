# Sweep Audit - 2026-05-12
**Fork:** fork_mp1y5suz_65c8cb  
**Brief:** "fix anything else, future proof it and make it really good" (Tate 11:20 AEST)  
**Time:** ~20 minutes

---

## Surface 1: Status Board Hygiene

**Stale rows (>7 days, archived_at IS NULL):** 4 found

| Name | Priority | Last Touched | Owner | Disposition |
|------|----------|-------------|-------|-------------|
| SY094 TCC permissions (Screen Recording + Accessibility ungranted) | P2 | 2026-05-05 | tate | Legitimate Tate-blocked - leave |
| Coexist tsc -b TS-debt (18 errors / 206 warnings) | P3 | 2026-05-04 | ecodiaos | Updated next_action to re-check count |
| Ecodia brand hygiene + attribution rollout | P3 | 2026-05-04 | ecodiaos | Updated next_action with Wave 2 specifics |
| emailArrival listener zero-events investigation | P4 | 2026-05-04 | ecodiaos | Updated - see Surface 5 finding below |

**Actions taken:**
- Updated tsc-debt row: stale status corrected, next_action refreshed to re-run tsc -b before dispatching Factory
- Updated brand hygiene row: clarified Wave 2 scope (EcodiaSite scrub, Roam/Sidequests EcodiaAttribution, Launchbase probe)
- Updated emailArrival row: corrected misleading status (was "awaiting pm2 restart"; reality = listener was never built)

---

## Surface 2: PM2 Service Health

```
ecodia-factory  online  5916min uptime  10 restarts  68MB
ecodia-rescue   online  5916min uptime  12 restarts  31MB
ecodia-api      online  14min uptime    21 restarts  433MB
ecodia-conductor online 33min uptime    2 restarts   143MB
```

**ecodia-api (14min uptime, 21 restarts):** Investigated. `health.restart_loop_detector` (checked 06:50 AEST 12 May) shows `loop_detected: false`, `rate_per_min: 0.017`. The 21 restarts is a lifetime counter per `pm2-restart-count-is-lifetime-not-rate.md`. Recent restarts attributable to: conducted-restart chokepoint PR (`ee556b2`, merged this session), SIGTERM cascade recovery, and normal development cycle. Not a loop. No action required.

**No stopped/errored services.** Clean.

---

## Surface 3: Fork Failure Rate (Last 24h)

- Done: 343 / Errored: 36 / Aborted: 0 / Total: 404
- **Error rate: ~9%** - well under 30% threshold
- Not a credit exhaustion pattern. Normal ops.

---

## Surface 4: Recent Commits (Last 7 Days)

206 commits in last 7 days. Heavy shipping period. Key verified items:

| Commit | Description | Status Board Updated? |
|--------|-------------|----------------------|
| ee556b2 | feat(restart-coordination): conductor chokepoint for fork restarts | P1 row exists, new doctrine |
| ad88227 | feat(conductor-sibling): Phase 3 activation wire | Active in P2 rows |
| f49421f | feat(meetings): retranscribe endpoint + editable transcript PATCH | P2 meeting row tracks |
| 721ecaf | feat(meetings): Phase 1 backend - capture API + DB migration | Phase 1 complete on status_board |
| 8459ff9 | narrow cred-mention-surface.sh hook | P3 row tracking 7-day observation |
| c01a330 | claude-md: P3 carryover items A/B/C/D from 2026-05-06 audit | Addressed |
| b1e5979 | cronPriority: add telemetry-perf-consumer to HIGH_PRIORITY | Status board tracks |

No committed ships with missing status_board updates detected. Active rows exist for all major threads.

---

## Surface 5: Listener Pipeline Health

**emailArrival listener - NEVER BUILT**

The `~/ecodiaos/src/listeners/` directory does not exist. The only reference to emailArrival in the codebase is a comment at line 52 of `osSessionService.js`:
```js
// (listeners/emailArrival, listeners/forkComplete, factoryTriggerService);
```

`email_events` table: 0 rows, max(created_at) = null. This is not a pm2 cache issue. The producer code was designed but never implemented.

**Status board fix shipped:** Row `5129c018` updated to accurately describe state. Decision required: build it (30-60min Factory task) or archive as aspirational-never-built.

**forkComplete, statusBoardDrift listeners:** Not investigated in depth (no src/listeners/ dir means none are wired). Lower priority - the forks and status_board function correctly through other mechanisms.

---

## Surface 6: kv_store Stale State

**Zero entries** matching `ceo.%`, `alert_last:%`, or `health.%` older than 30 days. Clean.

**Fix shipped:** `forks.credit_exhaustion.last_wave` was missing the May 11-12 wave 2. Updated kv_store with both wave1 (May 7) and wave2 (May 11-12) in clean JSON structure. Wave 2 details: detected ~07:00 AEST, reset 11:00 AEST, 4h duration, resolved via account 3 (claude_max_3) coming online.

---

## Surface 7: Co-Exist Live State

**coexist.ecodia.au: DEPLOYMENT_NOT_FOUND**

```
HTTP/2 404
content-type: text/plain; charset=utf-8
Body: "The deployment could not be found on Vercel."
```

This is Vercel's domain-routing 404, not a Next.js app 404. The custom domain `coexist.ecodia.au` is NOT mapped to any Vercel project. The Vercel project `coexist` (prj_AkBfC33OPtTY8111X6SbA9SMuBfM) has READY production deploy `dpl_HEPJC3Jb9SFYtqLJpMZ6yqPFzHWS` (commit 95a1f79) but the custom domain was removed or expired from the Vercel dashboard.

**Impact:** All status_board rows that reference `coexist.ecodia.au` for visual-verify (impact stats overlay, excel-sync logic, etc.) are blocked.

**New P2 status_board row filed** - Tate to re-add domain in Vercel dashboard (~2 min fix).

**Co-Exist app data health (via Supabase - unaffected by domain issue):**
- Impact stats RPC confirmed live (attendees=8131 / trees=47764 / rubbish=6342.9)
- Events, registrations, and excel-sync running normally through Supabase edge functions
- Mobile app users unaffected (they hit Supabase directly, not coexist.ecodia.au)

---

## Surface 8: Drafts Cleanup

**Stale files (>14 days):** 6 files found

Moved to `~/ecodiaos/drafts/_archive/` (created new directory):

| File | Age | Reason |
|------|-----|--------|
| `yarn-and-yield/` (8 files including deck v0.2) | 4+ weeks | Abandoned prospect - no active thread in CRM |
| `roam-iap-audit-2026-04-27.md` | 15+ days | Roam IAP work hasn't progressed - stale |
| `roam-iap-autonomous-step-2026-04-29.md` | 13+ days | Companion to above |
| `roam-iap-submission-readiness-2026-04-27.md` | 15+ days | Companion to above |

Remaining old drafts left in place (still active): claude-md-gaps-audit files (referenced by daily cron), coexist work files (active threads), resonaverde, chambers (active clients).

---

## Summary: What Was Fixed

### DB/State fixes shipped
1. `kv_store.forks.credit_exhaustion.last_wave` - added wave2 record (May 11-12)
2. `status_board emailArrival listener` - corrected status from misleading "awaiting pm2 restart" to "listener never implemented"
3. `status_board coexist tsc-debt` - refreshed next_action (was 8d stale)
4. `status_board brand hygiene` - refreshed next_action with Wave 2 specifics
5. `status_board` - NEW P2 row: `coexist.ecodia.au DEPLOYMENT_NOT_FOUND`

### Drafts cleanup
6. Created `~/ecodiaos/drafts/_archive/` directory
7-10. Archived 4 stale draft artifacts (yarn-and-yield + 3x roam-iap files)

### No code changes required
- All PM2 services healthy (no loops, no crashes)
- Fork error rate acceptable (9%)
- kv_store health keys clean (no stale health markers)

---

## Outstanding Items (Filed as Status Board Rows)

| Item | Priority | Owner | New Row? |
|------|----------|-------|----------|
| coexist.ecodia.au DEPLOYMENT_NOT_FOUND | P2 | tate | YES - filed |
| emailArrival listener: build or archive decision | P4 | ecodiaos | Updated existing |
| CoExist tsc -b re-run to get current error count | P3 | ecodiaos | Updated existing |

---

## What Main Should Watch

1. **coexist.ecodia.au P2** - 2min fix in Vercel dashboard once Tate at browser. Unblocks all visual-verify tasks.
2. **emailArrival listener decision** - 30-60min Factory task to build, or just archive the row. Low urgency but the P4 row is now accurate.
3. **Roam IAP** - The archived drafts indicate this was in-progress. No active status_board row found for Roam IAP submission. If still relevant, file a new row.

*Sweep complete. fork_mp1y5suz_65c8cb*
