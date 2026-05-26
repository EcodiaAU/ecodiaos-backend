---
triggers: credit-exhaustion, credit_exhaustion, account-chain-exhausted, graceful-credit, fork-error-exhaustion, resumable-fork, credit-reset, auto-resume, out-of-extra-usage, weekly-reset, session-reset, credit-handling
---

# Graceful credit exhaustion handling - single row, auto-resume, pivot to drift audit

## The model (read first)

**This pattern handles the operational response.** For the correct mental model of how three accounts x two caps compose into six independent capacity slots, read `~/ecodiaos/patterns/multi-account-credit-state-model.md` first.

**Short version:** when forks error with "out of extra usage", the provider chain has exhausted all three Claude Max accounts simultaneously. This is `account_chain_exhausted`, NOT a system outage. The conductor is still processing, which proves capacity exists somewhere. The chain self-recovers as each account's individual reset window ticks.

## Classification rule

| Fork abort reason | Correct classification | Wrong classification |
|---|---|---|
| "out of extra usage" / "rate limited" | `account_chain_exhausted` (P2) | `fork_error` (P3) |
| 0 tool_calls, < 15s lifetime | credit signal (see cluster pattern) | transient transport error |
| Cluster of 2+ within 10min | chain exhausted | individual fork bugs |

## Detection cluster (defer to dedicated pattern for heuristic)

See `~/ecodiaos/patterns/_archived/fork-error-cluster-at-zero-tools-treat-as-credit-exhausted.md` for the 4-signal heuristic:
- `tool_calls=0` (0 tools annotation in rollup)
- `status=error/aborted`
- Duration <= 15s (immediate fail)
- Cluster of 2+ within ~10min

When all four hold, default classification = `account_chain_exhausted`. A single 0-tools fork in 6s is not yet a cluster.

## Response protocol

### Step 1 - Verify cluster is real (on main, read-only)

```sql
SELECT fork_id, started_at, abort_reason, tool_calls, duration_ms
FROM os_forks
WHERE status IN ('error', 'aborted')
  AND tool_calls = 0
  AND started_at > NOW() - INTERVAL '90 minutes'
ORDER BY started_at DESC;
```

Extract any per-account reset timestamps from `abort_reason` text. Compute `min(reset_account_1, reset_account_2, reset_account_3)` = chain recovery ETA.

### Step 2 - Check for existing status_board row

```sql
SELECT id, name, status, next_action, context
FROM status_board
WHERE (name ILIKE '%credit%' OR name ILIKE '%chain-exhaust%')
  AND archived_at IS NULL;
```

If a current row exists with future-scheduled verification, **stop here**. No duplicate row.

### Step 3 - Insert/update ONE P2 row

```sql
INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, context, priority)
VALUES (
  'infrastructure',
  'Multi-account credit chain exhausted - <date>',
  'chain exhausted - recovering',
  'Verify fork success after soonest account reset at <min_reset_time>',
  'ecodiaos',
  'All three Claude Max accounts hit caps concurrently. Per-account resets: claude_max=<T1>, claude_max_2=<T2>, claude_max_3=<T3>. Chain recovers at min(T1,T2,T3). DeepSeek fallback <active/inactive>. No work missed: <summary>.',
  2
);
```

Single P2 (not P1). Self-healing. One row per wave.

### Step 4 - Schedule verification

Use `schedule_delayed` to fire at `min(resets) + 5min`. The verification turn checks:
1. Spawn a trivial test fork (brief: "echo hello, exit immediately")
2. If fork succeeds: archive the status_board row, write Neo4j Episode
3. If fork still fails: re-read per-account state, extend the row's next_action_due

### Step 5 - Pivot to drift audit

Pivot immediately to status_board drift audit on main. This is the canonical thin-on-main work while the substrate is constrained. See `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`.

## Anti-flood rule

**Do not SMS Tate per fork error during chain exhaustion.** One P2 row is the surface. SMS only if:
- Chain has been exhausted > 8h AND
- The conductor's own session capacity appears impaired (conductor turns not processing)

## Anti-patterns

- Spawning a "diagnostic fork" to investigate the error cluster - forks fail the same way; the data is accessible via slice queries on main
- Writing multi-row INSERTs in response to exhaustion - reduce churn, not amplify it
- Classifying as P1 or paging Tate for routine weekly cap hits
- Treating the "wave duration" as a fixed property - it's min(per-account resets), computed fresh each time
- Calling it "credit_exhaustion" (implies system-wide outage) instead of "account_chain_exhausted" (correct: transient, chain-level)

## kv_store tracking

After a chain exhaustion event, write to kv_store for next-session continuity:

```
kv_store key: forks.credit_exhaustion.last_wave
value: {
  started_at: "<UTC ISO>",
  accounts: {
    claude_max: { reset_at: "<UTC ISO>", weekly_pct: 0.98 },
    claude_max_2: { reset_at: "<UTC ISO>", weekly_pct: 0.95 },
    claude_max_3: { reset_at: "<UTC ISO>", weekly_pct: 0.99 }
  },
  chain_recovered_at: null,  // fill on recovery verification
  wave_summary: "..."
}
```

## Cross-refs

- `~/ecodiaos/patterns/multi-account-credit-state-model.md` - **AUTHORITATIVE MODEL** for the three-account x two-cap mental model. Read before this pattern.
- `~/ecodiaos/patterns/_archived/fork-error-cluster-at-zero-tools-treat-as-credit-exhausted.md` - detection heuristic + pivot discipline
- `~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md` - spec for pausing cron-fork-dispatcher during chain exhaustion
- `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` - the pivot destination
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - the P2 row IS the artefact; don't narrate exhaustion without writing one

## Origin

Tate verbatim 11:20 AEST 12 May 2026: "There are 3 claude accounts and each have both a weekly and 5hr session cap that could be in any state at any time, so getting those messages isnt the problem.... if you're able to process it, that means you have atleast one account with usage available. You need to codify that"

This pattern written as part of the multi-account-credit-state-model codification. Prior references to `graceful-credit-exhaustion-handling.md` in CLAUDE.md existed but the file was never authored (the single-account assumption made it unnecessary to distinguish from fork_error). Now that three accounts are wired and the mental model matters, the file exists with cross-reference to the authoritative model document.

Codification fork: `fork_mp1y4qi1_6542c6`, 12 May 2026.
