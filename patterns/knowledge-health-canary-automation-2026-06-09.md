---
triggers: knowledge-health, knowledge-health-canary, retrieval-integrity-canary, knowledge-maintenance-automation, eval-recall-regression, dedup-scan-drift, doctrine-trigger-coverage, enforcement-gate-unwired, index-freshness-canary, launchd-not-scheduler-for-local-canaries, dead-mans-switch-heartbeat, self-maintaining-knowledge-system, knowledge-health-heartbeat, au-ecodia-knowledge-health, retrieval-regression-alarm, phase-4-maintenance
category: doctrine
facet: meta
canonical: true
---

# The knowledge system maintains and follows up on itself - the knowledge-health canary

## The rule

Every load-bearing property of the retrieval system is checked by a single daily canary, and any regression surfaces into the next session automatically. Maintenance does not depend on the conductor remembering to run a check. The canary is `backend/scripts/knowledge-health.sh`, run by launchd (`au.ecodia.knowledge-health`, daily 09:15), and its alarm rides the M2 `knowledge-sessionstart` hook into the start of the next session, the same path the backup alarm uses.

**Why:** the whole knowledge-architecture overhaul fights one failure shape, knowledge that exists but does not reach the model at action-time. A maintenance system that itself depends on someone remembering to run it has the same shape. The fix is to make every check fire on a schedule that survives reboot and conductor-down, write a heartbeat, and have session-start read the heartbeat so a regression cannot stay silent until it bites.

**Why launchd and not the scheduler:** local retrieval integrity must hold whether or not the conductor or the EcodiaOS scheduler is awake. launchd LaunchAgents load at login, survive reboot, and run with no conductor dependency. The scheduler (`os_scheduled_tasks`) is for organism-level work the conductor acts on. This matches the sibling local canaries [[mac-organisation-system-v2-hardened-2026-06-09]] (mac-hygiene) and the backup tripwire (precious-work-check).

## What it checks (each writes to `knowledge-health-heartbeat.json`)

1. **Index freshness** - rebuild + embed if `index.sqlite` is older than 60 min. Idempotent.
2. **Retrieval recall** - runs `knowledge-index/eval-recall.js`, which replays the forensic failure queries through the hybrid front door. Must stay at the target (12/12). A drop means a load-bearing pattern stopped surfacing.
3. **Duplication drift** - runs `dedup-scan.js` at cosine 0.90 over doctrine+recipes. Alarms when the pair count grows past the kept baseline (new near-duplicate doctrine creeping in).
4. **Doctrine trigger coverage** - every `patterns/*.md` must carry a `triggers:` line, or it is unfindable on the keyword leg.
5. **Enforcement gates wired** - the M1/M2/M3 + placement + index-refresh hooks must still be referenced in `settings.json`. A hook silently dropped from settings is enforcement that died quietly.

## How to apply

- Read the heartbeat at `~/.local/state/ecodiaos/knowledge-health-heartbeat.json` for current state. `status: alert` plus the `alerts` string names every failing check.
- The M2 hook injects a `KNOWLEDGE HEALTH ALARM` at session start on `status: alert`, AND a dead-man's-switch alarm if the canary has not run in 36h (a silent canary is itself a failure).
- When you add a new load-bearing property to the retrieval system, add its check to the canary in the same turn. The canary is the write-side twin of the property: shipping the property without the check leaves it to rot undetected.
- The canary never deletes or rewrites doctrine. It proposes and alarms; consolidation stays conductor-gated.

## Do NOT

- Do not put local retrieval-integrity maintenance on the EcodiaOS scheduler. It must run conductor-down.
- Do not let a check fail silently. Every check feeds the heartbeat, and the heartbeat feeds session start.
- Do not raise the dedup baseline to silence a real growth alarm. Consolidate the new duplication instead.

## Origin

2026-06-09. After the knowledge-architecture overhaul (retrieval engine, M1/M2/M3 gates, CLI/MCP hybrid parity, dedup-scan, recall eval), Tate: build the system and processes so this is all automated, with crons that maintain and follow up on every aspect. Built the canary + plist + M2 alarm wiring + dead-man's-switch the same turn. Phase 4 of [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]]. Verified end-to-end: ok-state silent, simulated regression injects the alarm, canary runs through the real launchd path.
