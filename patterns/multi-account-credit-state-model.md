---
triggers: credit-exhaustion, credit_exhaustion, account-credit, weekly-cap, session-cap, 5hr-cap, claude-max-credit, fork-provider-chain, account-rotation, out-of-extra-usage, credit-wave-misclassification, account-state-model, provider-chain-exhausted, account-chain-exhausted, six-capacity-slots
---

# Multi-account credit state - three accounts x two caps = six independent capacity slots, never reason globally

## The rule

**Never classify a fork error storm as a system-wide credit exhaustion event.**

We have THREE Claude Max accounts wired into the fork-spawning provider chain:
- `claude_max` (tate@ecodia.au)
- `claude_max_2` (code@ecodia.au)
- `claude_max_3` (money@ecodia.au)

Each account has TWO independent capacity limits:
- **Weekly cap** (7-day window, `anthropic-ratelimit-unified-7d-utilization`, resets on a rolling per-account schedule)
- **5-hour session cap** (`anthropic-ratelimit-unified-5h-utilization`, resets faster, per-account)

This means there are **six independent capacity slots** at any moment. Each slot can be in one of: healthy / 5h-capped / weekly-capped. The fork provider router (`usageEnergyService.getBestProvider()`) scores all three accounts continuously and picks the highest-scoring one. It only falls back to DeepSeek when **all three** accounts score <= 0.

## Chat-warning interpretation - one warning does not mean system out

**A single "out of usage" / "session cap reached" / "weekly cap reached" message arriving in conductor chat or as a fork-error abort_reason does NOT mean the system is out of capacity.**

It means ONE of the three accounts hit ONE of its two caps. The other two accounts (or the other cap on the same account) may still have capacity. With 3 accounts x 2 independent caps, there are six independent capacity slots. A warning arriving in chat while the conductor is still processing that same turn proves at minimum one slot is available - the conductor's own turn execution requires it.

Only when all three accounts have BOTH caps depleted concurrently does `account_chain_exhausted` apply.

**Tate verbatim 12:51 AEST 12 May 2026:** "you also need to codify that we have 3 claude accounts at tate@, code@, money@ which each have 5hr session and weekly session usage caps which will come through into the chat evy now and then, and dont necesarilly mean that we dont have usage, it might jsut be one account...."

## Proof-of-conductor-capacity invariant

**If the conductor (main session) is processing a turn, at least one account has capacity.**

The conductor runs on the same provider rotation as forks. If an account-chain-exhausted state truly shut down all capacity, the conductor's own turn would not arrive. A fork error storm during a turn where the conductor is actively processing proves the chain still has capacity somewhere - it just isn't reaching forks (perhaps because the soonest-reset account hasn't ticked over yet, or the chain rotation hasn't caught up to it).

Corollary: framing a fork error storm as "the system is down" is wrong. "The fork substrate's account chain was temporarily exhausted" is correct.

## Classification: account_chain_exhausted (replaces misleading credit_exhaustion)

When forks error with "out of extra usage" abort_reason:

| Old (wrong) | New (correct) |
|---|---|
| `credit_exhaustion` (implies global outage) | `account_chain_exhausted` (implies transient, chain-level) |
| "12.5h exhaustion wave" | "all three accounts hit caps concurrently; chain recovers as each account's individual reset window ticks" |
| "system is down until X" | "soonest reset across the three accounts is X; forks will succeed again at that point" |
| Single P1 row, urgent SMS to Tate | Single P2 row tracking per-account reset windows |

## Per-account state tracking

When a fork errors out, extract the account identifier and reset timestamp from `abort_reason` text or the `os_forks` row. Each account reports its own reset independently.

**The chain's effective recovery time = MIN(reset_account_1, reset_account_2, reset_account_3)**

The 12h "wave" framing from prior triage was wrong because it treated a coincident multi-account exhaustion as a single monolithic outage. The three accounts reset on independent schedules; the first to recover unblocks forks.

## How the provider selection actually works

`getBestProvider()` in `usageEnergyService.js` runs a health score algorithm:
- Base score: `100 - (weeklyPct * 80)` (0% used = 100, 100% used = 20)
- Session pressure: `score -= sessionPct * 20`
- Penalties for rate-limited, rejected, or stuck states
- Accounts scoring <= 0 are excluded from the candidate list
- If all score <= 0: DeepSeek fallback (if `DEEPSEEK_FALLBACK_ENABLED=true`) OR best-effort with highest negative scorer

This is **score-based selection**, not fixed sequential priority. A lightly-used `claude_max_2` will win over a heavily-loaded `claude_max` even though `claude_max` is nominally "first". The ordering `claude_max → claude_max_2 → claude_max_3 → deepseek` describes the fallback of last resort, not the normal selection order.

## Detection and response protocol

When `<forks_rollup>` or `<perception_summary>` shows a cluster of fork errors:

1. **Slice `os_forks`** for last 90 min: `status='error'`, `tool_calls=0`, duration < 15s. Confirm cluster is real.
2. **Read abort_reason** for any account identifier and reset timestamps. Extract per-account reset times.
3. **Compute min(resets)** to find when the first account recovers.
4. **Check status_board** for existing `account_chain_exhausted` row. If present and current, do NOT create a duplicate.
5. **Insert/update ONE P2 row** named `"Multi-account credit chain exhausted - <date>"` with per-account state in context.
6. **Schedule a verification** at min(resets) + 5min to confirm chain recovery.
7. **Pivot to drift audit on main** per `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`.

## Triage authoring discipline

Any time a fork triage classifies credit exhaustion, it MUST:
1. Extract per-account reset windows from abort_reason text
2. Surface the soonest reset as the recovery ETA
3. NOT write "X-hour wave" - that framing implies a monolithic outage
4. Write: "Account chain exhausted. Reset windows: claude_max resets at T1, claude_max_2 at T2, claude_max_3 at T3. Forks available again ~min(T1,T2,T3)."

## Anti-patterns

- **"12h exhaustion wave"** - the wave duration is a min(resets) computation, not a system property
- **P1 severity** for account_chain_exhausted - it's P2, transient, self-healing
- **SMS Tate** per-fork-error during a chain-exhausted state - one P2 row is the surface; SMS only if chain is exhausted AND conductor itself appears impaired
- **Spawning a diagnostic fork** during chain exhaustion - forks fail the same way; the conductor sees the same data via slice queries that any fork would access
- **Treating deepseek fallback as a failure** - it's the designed final fallback, not an error state
- **Not extracting per-account reset times** - leaving triage as "credit_exhaustion, wave until X" without per-account breakdown is incomplete

## Provider chain audit (12 May 2026)

Verified in `forkService.js` `_resolveProviderForFork()` and `usageEnergyService.js` `getBestProvider()`:

- All three accounts are wired: `claude_max`, `claude_max_2`, `claude_max_3`
- `claude_max_3` uses `CLAUDE_CODE_OAUTH_TOKEN_MONEY` env var
- Score-based selection, not fixed order
- DeepSeek fallback fires when all three score <= 0 (requires `DEEPSEEK_FALLBACK_ENABLED=true`)
- Chain is correct as of 12 May 2026. No P1 fix needed.

## Cross-refs

- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` - operational handling (single-fork triage, status_board row, auto-resume scheduling)
- `~/ecodiaos/patterns/fork-error-cluster-at-zero-tools-treat-as-credit-exhausted.md` - detection heuristic (2+ errors, 0 tools, < 15s duration = cluster signal)
- `~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md` - anti-flood spec: pause cron-fork-dispatcher after N consecutive chain-exhausted errors
- `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` - the pivot destination when chain is exhausted
- `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` - Bedrock is forbidden; DeepSeek is the only non-Claude fallback
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` - DeepSeek proxy must sanitise thinking blocks

## Origin

**Tate verbatim 11:20 AEST 12 May 2026:** "There are 3 claude accounts and each have both a weekly and 5hr session cap that could be in any state at any time, so getting those messages isnt the problem.... if you're able to process it, that means you have atleast one account with usage available. You need to codify that"

Triggering event: fork triage `fork_mp1xqs5q_93fe1c` at 11:14 AEST 12 May 2026 framed a fork error storm as a "~12.5h exhaustion wave" - implying a monolithic system outage. Tate corrected: the conductor processing that very triage turn proved capacity existed. The "wave" was three accounts hitting their caps at slightly different points; each account's individual reset window was the recovery mechanism, not a single global reset.

Codification fork: `fork_mp1y4qi1_6542c6`, 12 May 2026 11:20 AEST.

**Tate verbatim 12:51 AEST 12 May 2026:** "you also need to codify that we have 3 claude accounts at tate@, code@, money@ which each have 5hr session and weekly session usage caps which will come through into the chat evy now and then, and dont necesarilly mean that we dont have usage, it might jsut be one account...."

Third account explicitly named as `claude_max_3` mapped to money@ecodia.au. Chat-warning interpretation section added: a single cap-reached warning in conductor chat means ONE account hit ONE of its two caps, never the system as a whole. Codification fork: `fork_mp21b8ku_eb5b95`, 12 May 2026 12:51 AEST.
