---
triggers: health-canary-silent-accumulate, canary-no-alert, threshold-without-alert, consecutive-failures-no-escalation, dead-mans-switch-without-trigger, kv-store-health-without-action, recorded-not-actioned, monitoring-without-alerting, primary-contact-channel-dark, fallback-channel-available-but-unused
---

# Health canaries must alert at fixed thresholds, not silently accumulate

## The rule

A health canary cron that monitors a Tate-contact-path, a paying-customer surface, or any other always-must-be-up substrate **MUST** raise an action when `consecutive_failures` crosses fixed thresholds. Recording the metric to `kv_store.health.<thing>` is necessary but not sufficient. The canary's deliverable is the **escalation**, not the metric.

Two thresholds, both per-canary configurable:
- **Notice threshold** (default `consecutive_failures >= 4`, i.e. ~24h of degradation on a 6h cron, or 4 cycles on whatever cadence the canary runs): upsert a P2 status_board row tagged with the canary name and the kv_store key, set `next_action_by` correctly (ecodiaos vs tate vs external).
- **Escalate threshold** (default `consecutive_failures >= 12`, i.e. ~72h): bump existing row to P1 AND fire the substrate's documented fallback alert path. For a Tate-contact-path, this means Twilio SMS - the canonical direct channel. For a paying-customer surface, this means email + status_board P1 with `next_action_by=ecodiaos`.

Both writes are idempotent (atomic UPSERT keyed on canary name); the canary firing repeatedly does not multiply rows or messages.

## Why this is a discrete pattern

Canaries are easy to ship. Adding the right alerting threshold + fallback-path-knowledge per canary is the work that's almost always deferred. The repeatable failure mode:

1. Canary X is shipped, writes `kv_store.health.X` every N hours
2. The kv_store row goes degraded. Maybe a status_board row is created at first failure with vague language ("probe whether X watcher is alive")
3. Nobody re-reads the row because canary failures aren't escalated
4. `consecutive_failures` accumulates silently
5. The substrate stays down for days
6. A meta-loop or drift audit eventually surfaces it. By then the substrate has been dark for >>24h

The contact-path case is worth calling out: when the channel itself is degraded, the escalate-threshold fallback (Twilio SMS) must fire regardless - that is exactly the case it was designed for.

## Implementation contract

Every health-canary cron must end its run with:

```js
const prev = (await readKv('health.<canary>')) || { consecutive_failures: 0 };
const next = ok
  ? { ok: true, consecutive_failures: 0, last_ok_at: now, ...details }
  : { ok: false, consecutive_failures: prev.consecutive_failures + 1, first_failure_at: prev.first_failure_at || now, ...details };

await writeKv('health.<canary>', next);

if (!ok) {
  if (next.consecutive_failures >= NOTICE_THRESHOLD) {
    await statusBoardUpsert({
      entity_ref: `health_canary:<canary>`,
      priority: 2,
      next_action_by: classify_fix_owner(canary),
      next_action: actionable_recipe(canary),
      // ...
    });
  }
  if (next.consecutive_failures >= ESCALATE_THRESHOLD) {
    await statusBoardUpsert({ entity_ref: `health_canary:<canary>`, priority: 1, /* ... */ });
    await fireFallbackAlert(canary);  // path documented per canary
  }
}
```

The `entity_ref` keying makes the upsert idempotent - same canary firing every 6h hitting the same row, not creating new ones. The `consecutive_failures` reset on `ok=true` makes recovery automatic - row gets archived by the recovery cycle.

## Anti-pattern: a status_board row at FIRST failure with vague next_action

A 2026-05-07 P2 row for a degraded contact path had `next_action` phrased as a vague probe list with no concrete fix recipe. The row was technically present from cycle 1, so a meta-loop scanning the board could in principle have caught it, but:

- Vague rows blend into the long tail of "tate review when back from Kili" rows
- The row's `last_touched` doesn't bump as `consecutive_failures` climbs, so age signal stays at the original creation time
- The drift audit's "last_touched > 7 days = probe ground truth" rule catches this only at week 1+, not week 0.5

The fix is a structured `next_action` produced by the canary itself, including the `consecutive_failures` count + first_failure_at + a concrete remediation recipe (or recipe link). When the canary itself escalates, the row is always fresh (`last_touched = NOW()`) and the escalation message is concrete.

## Cross-refs

- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - recording the metric without acting IS symbolic logging
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` - the freshness rule for kv_store health rows; this pattern is the upstream half (canary writes correctly), that pattern is the downstream half (consumers read correctly)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - five-layer applies here: producer → trigger → bridge → listener (canary cron + heartbeat aggregator) → side-effect (status_board upsert + Twilio SMS). The 46-failure-streak proved the side-effect layer was missing.
- `~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md` - the autonomous-pilot SMS gate this canary's escalate-threshold needs to respect (don't bypass when Tate is live in chat)

## Origin

Meta-loop fire 2026-05-09 22:05 + 23:05 AEST. The 23:05 fire surfaced a kv_store health row showing 46 consecutive failures since 2026-05-07T01:18 UTC - 2.5 days of silent degradation of a contact path between EcodiaOS and Tate, while a Twilio SMS fallback was available and doctrine-blessed for exactly this case.

The probe fork (fork_moyczp7o_1dcf2b) found compound failure: macOS TCC AppleEvents denied + LaunchAgents unloaded (RDP-required) + a NEW finding of inbound HMAC `awk '$2'`→`$NF` drift sister-script-pair from a 7 May patch (sibling drift sister to fork_moutg6ld_898d58 outbound patch).

The fork addressed root cause. This pattern addresses the meta-cause: the canary recorded 46 silent failures of the absolute-primary contact channel without alerting. Recording without acting is the bug. Each individual symptom can be fixed; the alerting-threshold gap will recur on the next canary that ships without this contract.

Pattern node Neo4j #1614 (authored 23:08 AEST, doctrine_path pending until this file landed). Now linked.
