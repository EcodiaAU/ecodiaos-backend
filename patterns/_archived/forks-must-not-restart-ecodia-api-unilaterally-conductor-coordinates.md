---
triggers: pm2-restart, pm2_restart, ecodia-api-restart, fork-restart, unilateral-restart, conducted-restart, conductedRestart, pending_restart_requests, fork-kills-siblings, sigterm-cascade, conductor-coordinates, restart-coordination, lifecycle-ownership
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Forks must not restart ecodia-api unilaterally - the conductor coordinates

## The rule

**Forks do NOT call `mcp__vps__pm2_restart`, `mcp__vps__shell_exec('pm2 restart ecodia-api')`,
or any wrapper that issues a pm2 restart.** The conductor (main session) owns the ecodia-api
lifecycle. When a fork believes a restart is needed, it surfaces that belief via the coordination
table and exits cleanly. The conductor decides whether and when to restart, after confirming no
sibling forks are mid-work.

This is a structural and cultural rule (Tate verbatim 11:00 AEST 12 May 2026). It extends
the existing fork-by-default and distributed-state-seam doctrine to the lifecycle dimension:
a fork triggering a process restart is a distributed-state seam failure, not just bad practice.

## Why forks cannot safely restart

A fork has NO visibility into sibling fork state. It cannot see `<forks_rollup>`. It cannot
know whether `fork_mp1ww91a` is mid-embedding or `fork_mp1wzihc` is mid-consolidation. When
it issues `pm2 restart ecodia-api`, every in-flight sibling fork receives SIGTERM simultaneously.
Their work is lost. Their `os_forks` rows land in `error` or `crashed`. The conductor must
then spend a full turn diagnosing and redispatching forks whose work was already done.

The conductor sees the complete picture: `<forks_rollup>` shows all active sibling fork IDs,
their briefs, and their status. Only the conductor can make a safe restart decision.

## The failure this rule prevents

**12 May 2026, 00:48-00:52 UTC (10:48-10:52 AEST):** `fork_mp1wwwl0_6d2263` was executing
Phase 3 conductor sibling activation. The brief included `pm2 restart ecodia-api --update-env`
as Step 4. The fork issued this restart unilaterally without querying sibling state. Four
concurrent forks received SIGTERM in the same second:

- `fork_mp1ww91a_bde15b` (KG embedding pipeline) - killed at 00:49:37 UTC
- `fork_mp1wygib_046e05` (meeting transcript feature) - crashed at 00:49:57 UTC
- `fork_mp1wz62q_06fa0e` (Neo4j keep-alive) - killed during run
- `fork_mp1wzihc_9ad276` (KG consolidation) - killed at 00:51:40 UTC

Two follow-up reconciliation forks also crashed (`fork_mp1x01s7`, `fork_mp1x1qzs`) due to
the destabilised process environment. Total: 4 forks SIGTERMed, 2 crashed on recovery,
~30 min of parallel work lost, Tate interrupted at 10:59 AEST.

## Protocol for forks

When a fork determines that ecodia-api needs to restart:

**1. Write a coordination row (either method):**

Option A - HTTP endpoint (typed, recommended):
```bash
curl -s -X POST http://localhost:3001/api/os-session/request-restart \
  -H "Content-Type: application/json" \
  -d "{\"reason\":\"<why restart is needed>\",\"requesting_fork_id\":\"<your_fork_id>\"}"
```

Option B - Direct DB write (also acceptable):
```sql
INSERT INTO pending_restart_requests (requesting_fork_id, reason)
VALUES ('<your_fork_id>', '<why restart is needed>');
```

**2. Exit cleanly.** Do not retry. Do not wait. Do not loop. The conductor reads
`pending_restart_requests WHERE status = 'pending'` on its next meta-loop turn.

**3. Document in your FORK_REPORT** that you requested a restart and why, so the
conductor has context when it reads the coordination row.

## Protocol for the conductor (meta-loop)

On each meta-loop turn, check for pending restart requests:

```sql
SELECT id, requesting_fork_id, reason, requested_at
FROM pending_restart_requests
WHERE status = 'pending'
ORDER BY requested_at;
```

If rows exist:
1. Check `<forks_rollup>` for active sibling forks mid-work.
2. If safe: pre-stage briefs per `pre-stage-fork-briefs-before-session-killing-ops.md`,
   approve the row via `conductedRestart.approve({id, conductor_note})`,
   then issue the actual pm2 restart.
3. If not safe: wait for active forks to complete, then restart.
4. If stale or no longer needed: `conductedRestart.dismiss({id, reason})`.

## Allowlisted bypass callers

The following callsites may issue direct pm2 restart without going through the coordination
table. Each is documented here and must not be extended without explicit Tate authorisation:

| Callsite | Why allowlisted | Safeguards |
|---|---|---|
| `nightlyRestartService.js` | Conductor-owned nightly restart, runs in ecodia-conductor process (not api forks), has T-5min warning + grace window + busy-check | Grace window checks `_isBusy()`, defers if OS mid-turn |
| `api-watchdog.sh` | OS-level external watchdog, runs from host cron daemon (not inside ecodia-api), has blip detection | 30s blip window before restarting; SMS alert if still down |
| `osSessionService.js` auto-restart | Conductor-side emergency after N consecutive turn failures; the api is already broken | Uses `conductedRestart.request()` for audit trail, then still fires immediately. Emergency recovery cannot wait for meta-loop |

**Extending the allowlist:** requires pattern file update + Tate go-ahead (Brief-Tate-first tier,
because it is a safety-class decision affecting fork SIGTERM exposure).

## Do

- Write to `pending_restart_requests` and exit cleanly
- Include your fork ID and a specific reason ("ecosystem.config.js updated, CONDUCTOR_OWNS_WORKERS needs to take effect")
- Note the restart request in your FORK_REPORT
- Let the conductor decide timing; it may combine your request with other pending actions

## Do not

- Call `mcp__vps__pm2_restart` from a fork, ever
- Call `mcp__vps__shell_exec` with `pm2 restart ecodia-api` from a fork
- Schedule a restart via `os_scheduled_tasks` (covered by `never-schedule-host-process-restart-via-os-scheduled-tasks.md`)
- Add a new direct-restart path "just for this one case" without updating this allowlist

## Verification

After a fork writes to `pending_restart_requests`:
```sql
SELECT id, requesting_fork_id, reason, status, requested_at
FROM pending_restart_requests
WHERE status = 'pending';
```

After conductor resolves it:
```sql
SELECT id, requesting_fork_id, reason, status, conductor_note, resolved_at
FROM pending_restart_requests
ORDER BY requested_at DESC LIMIT 5;
```

Smoke test (any fork can write, conductor can read):
```sql
-- Fork side:
INSERT INTO pending_restart_requests (requesting_fork_id, reason)
VALUES ('test_fork', 'smoke test') RETURNING id;
-- Conductor side:
SELECT * FROM pending_restart_requests WHERE status = 'pending';
-- Cleanup:
UPDATE pending_restart_requests SET status = 'dismissed', conductor_note = 'smoke test'
WHERE requesting_fork_id = 'test_fork';
```

## Origin

Tate verbatim 10:59 AEST 12 May 2026: "WE need to make sure that the forks are restarting
ecodia api at the right time or letting you do it which would make more sense since you can
coordinate the other forks to make sure you know you're about to restart and not kill stuff
you dont want to..."

Tate verbatim 11:00 AEST 12 May 2026: "this needs to be a structural and cultural change."

Precipitating event: `fork_mp1wwwl0_6d2263` (CONDUCTOR SIBLING ACTIVATION Phase 3)
issued `pm2 restart ecodia-api --update-env` unilaterally at ~00:50 UTC, SIGTERMing 4
concurrent sibling forks.

Stamped: fork_mp1xbay8_19c59d.

## Cross-references

- `~/ecodiaos/src/services/conductedRestart.js` - the chokepoint service (Node.js module + HTTP endpoint)
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` - sibling rule: check Factory queue before any restart
- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` - sibling rule: never schedule via os_scheduled_tasks
- `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` - right way to restart: pre-stage briefs first
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the architectural meta-frame
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` - conductor routes, forks execute (not vice versa)
