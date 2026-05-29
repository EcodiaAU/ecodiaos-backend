# Anthropic Routines -> native scheduler migration manifest (2026-05-29)

status_board 2bf2c734. Authority: Tate verbatim 2026-05-29 - "I want everything to be YOU native... using our scheduler, our mcp servers etc" + "[webhook routines] should be migrated to local, get triggered by the vps webhook... and open a new chat with the prompt using our scheduler".

This manifest is the backup-of-record before any teardown. The routine prompt bodies themselves are already durable in git at `backend/routines/*.md`; this file is the mapping that git does not capture: routine -> native cron row -> live status -> disposition.

## The key finding (changes the shape of the work)

The native scheduler (`os_scheduled_tasks` poller + `cowork.dispatch_worker`) is ALREADY running the scheduled routines. The poller dispatch path was patched to route through `cowork.dispatch_worker` on the laptop-agent (commit 49618b9f, per [[scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28]]) and that patch is live. There is NO dead os-session:3001 route in play.

Every failed native cron fails for one of two NON-architectural reasons:
- `dispatch_worker failed: spawn failed: VS Code not running` - Corazon's VS Code was closed at fire time (the sometimes-on-host constraint)
- `per-account cred file not found: D:\PRIVATE\ecodia-creds\tate.json` - cred-rotation files, since reseeded healthy 2026-05-27 (status_board 1227ffc0)

So "migrate the scheduled routines to native" is largely ALREADY DONE. The remaining work is: dedupe, clean failed-status rows, confirm each routine has a healthy native cron, then delete the Anthropic cloud layer.

## The hard dependency to hold (Africa trip Oct-Dec 2026)

Native dispatch needs Corazon awake with VS Code open. The Anthropic Routines ran in Anthropic's cloud (always available). Moving everything to native-dispatch means: when Corazon sleeps, nothing fires. For workloads that MUST run while Tate travels and Corazon is off, the always-on path is the VPS (a VPS-side execution mode, or a wake signal), not a CC tab on a sleeping laptop. Decide per-workload before the trip. This is the same caveat as Phase 2 of the migration brief.

## Inventory: 27 routines

### A. Scheduled (cron) - 20. Target: native os_scheduled_tasks cron. Most already exist.

| routine .md | account | schedule | native cron exists? | native status (2026-05-29) |
|---|---|---|---|---|
| meta-loop | tate@ | every 1h | yes | failed (VS Code not running), 552 runs |
| system-health | tate@ | every 4h | yes | failed (VS Code not running), 146 runs |
| morning-briefing | tate@ | daily 09:00 | yes | active, 35 runs |
| deep-research | tate@ | every 3h | yes | failed (cred file), 211 runs |
| self-evolution | tate@ | every 4h | yes | failed (cred file), 146 runs |
| strategic-thinking | tate@ | daily 14:00 | yes | failed (clipboard/paste), 33 runs |
| inner-life | tate@ | every 6h | yes | failed (VS Code not running), 113 runs |
| claude-md-reflection | tate@ | daily 20:00 | yes | failed at dispatch but DID deliverable (audit written), 33 runs |
| vercel-deploy-monitor | tate@ | every 2h | yes | failed (VS Code not running), 295 runs |
| pattern-corpus-health-check | tate@ | weekly Sun 21:00 | yes | active, 2 runs |
| daily-index-regen | tate@ | daily 22:00 | yes | orphaned (cred file), 20 runs |
| kg-consolidation | tate@ | every 6h | yes | failed (cred file), 107 runs |
| email-triage | code@ | every 1h | yes | failed (VS Code not running), 618 runs |
| outreach-engine | code@ | every 8h | yes (+ many delayed follow-ups) | mixed |
| parallel-builder | money@ | every 2h | unconfirmed | check |
| marketing-outreach | money@ | every 72h | unconfirmed | check |
| marketing-cadence-monitor | money@ | every 6h | unconfirmed | check |
| weekly-financial-review | money@ | weekly Mon 10:00 | yes | active, 4 runs |
| auto-memory-promotion-audit | tate@ | daily 09:00 | unconfirmed | check |
| neo4j-stale-node-audit | tate@ | weekly Sun 06:00 | unconfirmed | check |

Native crons present that are NOT in the routine .md set (extra native-only work, keep): external-blocker-freshness-probe, coexist-stats-drift-check, coexist-dupe-suspect-check, peer-monitor, weekly-mum-text, weekly-doctrine-synthesis, the bookkeeping-* family, neo4j-keepalive, kg-embedding, telemetry-* consumers, decision-quality-*, status-board-reconciliation.

Known duplicate to fix: `bookkeeping-fx-rates-import` exists twice (both active, identical next_run).

### B. Webhook / API-triggered - 6. Target: VPS webhook receives event -> opens a CC chat with the prompt via our scheduler/dispatch. NOT cron.

| routine .md | account | external trigger | live fire-shim | Tate's read |
|---|---|---|---|---|
| inbound-email-handler | code@ | Gmail push | src/routes/webhooks/gmail-push.js | "never done anything of measure" |
| stripe-event-handler | money@ | Stripe webhook | src/routes/webhooks/stripe-fire-shim.js | same |
| apple-asn-handler | tate@ | Apple ASN | src/routes/webhooks/apple-asn-fire-shim.js | same |
| vercel-deploy-handler | tate@ | Vercel deploy | src/routes/webhooks/vercel-fire-shim.js | same |
| inbound-sms-handler | tate@ | Twilio SMS | ALREADY migrated to Corazon reflex 2026-05-16 (REGISTRY note) | already local |
| factory-cloud | money@ | api | src/services/factoryDispatch.js | Factory dead |

Disposition (Tate): migrate to local. The VPS stays the always-on webhook ingress (it must - third parties POST to a stable public URL). On receipt, instead of POSTing to the Anthropic `/fire` endpoint, the shim writes a native scheduled/immediate task that `cowork.dispatch_worker` picks up and opens a CC chat for. Each shim rewrite touches a live revenue/comms path, so each is verified individually before its cloud routine is deleted. factory-cloud just dies (Factory is dead).

### C. Already dead / removed
- inbound-sms-handler routed to Corazon reflex 2026-05-16 (REGISTRY note); the cloud routine row can be deleted.

## Teardown sequence (safe order)

1. [done-this-session] Record this manifest (backup).
2. [done-this-session] Detrack `backend/.mcp.json` (secret out of git; already in .gitignore).
3. Dedupe + clean native crons: cancel the duplicate bookkeeping-fx-rates-import; reset failed routine crons to active once the env cause (VS Code / cred files) is confirmed resolved.
4. Confirm every scheduled routine in set A has exactly one healthy native cron (create the unconfirmed ones if missing).
5. Rewrite the 5 live webhook fire-shims (B, minus factory) to dispatch via native instead of Anthropic /fire. Verify each against its live path before cutover.
6. Delete the Anthropic Routines across all 3 accounts (claude.ai/code/routines). GUI/CDP or Tate's hands, same as the Cowork V2 connector deletion.
7. Unmount /api/mcp/cowork + /api/mcp/ecodia-full gateways (app.js) + src cleanup once Routines are gone and nothing else rides them.
8. The cowork + ecodia-full bearers die with the servers. coord bearer (still needed by the live laptop-agent) rotates separately + lockstep.

## Why bearers are NOT rotated before teardown

The live Anthropic Routines authenticate to the substrate with the cowork / ecodia-full bearers right now. Rotating them before the Routines are deleted would 401 every fire mid-migration. Teardown invalidates them anyway. Order: delete consumers first, then the servers + bearers go together.
