# Context-Lean Audit — EcodiaOS Opus 4.7 Utilisation
**Date:** 2026-05-13  
**Fork:** fork_mp3wzf29_22a18e  
**Origin:** Tate verbatim 20:25 AEST 13 May 2026 — "make sure we're using opus 4.7 a bit more... we're using almost no usage and thats probably because of how much we controlled the context, but now its gone too far i feel"

---

## Section 1 — Current State (Measured)

### Model-in-use verification

| Surface | Model | Source |
|---|---|---|
| OS conductor (main session) | `claude-opus-4-7` | `OS_SESSION_MODEL=claude-opus-4-7` in `.env` |
| Fork workers | `claude-sonnet-4-6` | `FORK_WORKER_MODEL` default in `env.js:251` |
| Fork managers | `claude-sonnet-4-6` | `FORK_MANAGER_MODEL=claude-sonnet-4-6` in `.env` |

Thinking is enabled for all Claude turns (disabled only for DeepSeek fallback). Extended thinking budget is unset — the SDK manages it internally.

### Per-turn token profile (last 7 days, claude-opus-4-7 conductor)

| Metric | Last 7d | Prior 30d | Delta |
|---|---|---|---|
| Turns | 8,478 | 44,075 | - |
| Avg fresh input tokens | 7 | 241 | -97% |
| Avg cache-read tokens | 272,017 | ~61,600 | +341% |
| Avg cache-write tokens | 14,810 | ~2,165 | +584% |
| **Avg total effective context** | **286,834** | **64,021** | **+348%** |
| Avg visible output tokens | 22 | 28 | -21% |
| Avg cost per turn (API-equiv) | $0.60 | $0.05 | +1,100% |

The cost jump from $0.05 to $0.60/turn with visible output still at 22 tokens is explained by one thing: **extended thinking**. At $15/MTok output rate, $0.60 - (272K × $1.50/MTok) - (14.8K × $3.75/MTok) = ~$0.60 - $0.41 - $0.06 = $0.13/turn attributable to thinking+output combined. Approximate thinking tokens per turn: ($0.13 / $0.015/1K) ≈ 8,700 thinking tokens average, with visible output of only 22 tokens.

**Bottom line: Opus is thinking ~8,700 tokens and saying ~22 words per conductor turn.** The conductor is being used as a routing layer, not a reasoning layer.

### Weekly token velocity vs budget

| Week | Turns | Weekly API-equiv cost | Effective ctx tokens/turn | Annualised |
|---|---|---|---|---|
| 2026-04-27 | 17,909 | $1,009 | 32,939 | - |
| 2026-05-04 | 12,093 | $8,422 | 306,573 | full week |
| 2026-05-11 (partial, 2.5d) | 3,852 | $2,318 | 247,958 | ~$6.5K/wk |

**Current weekly API-equivalent cost: ~$8.4K USD (~$12.9K AUD)**  
**Budget: ~$14K AUD**  
**Utilisation: ~92% of budget on cost basis**

Token-count basis (input side, conductor only): ~3.7B tokens/week input vs 20B budget = **18.5% token utilisation**. The gap is explained by cache efficiency — 99.97% of input tokens come from cache (billed at $1.50/MTok vs $15/MTok for uncached), so the API-cost utilisation appears high while raw token count stays low. Fork token consumption is **not tracked** in `claude_usage` (no non-os_session rows with cache data) — actual system-wide token volume is higher.

---

## Section 2 — What Got Cut

These are the confirmed trims from git log and code review, ordered by approximate date:

### 1. `recent_exchanges` removed (PROMPT_ASSEMBLY_SPEC §5)
**File:** `osSessionService.js:1742`  
**Comment:** "SDK replays session history via session_id, making the tail injection pure duplication."  
**Was:** Last 3-5 Tate/assistant exchange pairs injected into every user message.  
**Justification:** Valid — SDK session resume already contains this history. But for fresh sessions (new `cc_session_id`), this context is genuinely absent. The breadcrumb block covers part of it (`last_turn_breadcrumb`) but only the tail of one turn, not a multi-turn exchange window.  
**Over-aggressive?** Borderline. Cron-fire sessions that start fresh have no SDK history to replay and the breadcrumb is thin.

### 2. `skillsSurface topK` trimmed from 5 to 3
**File:** `skillsSurfaceService.js:110-114`  
**Comment:** "Hard cap: brief fork_momarm6e_60920d trimmed topK from 5 to 3 to drop [something cut off]"  
**Was:** Top 5 skill matches surfaced per turn.  
**Now:** Top 3.  
**Estimated token impact:** -300 to -600 tokens/turn  
**Justification:** Brief says "drop" but the rest is cut off in the comment. No evidence of a quality-driven reason. Appears to be a context-lean trim.

### 3. `doctrineSurface` replaced by `skillsSurface` alone (USE_SKILLS_SURFACE flag)
**File:** `promptAssembler.js:188-244`  
**Status:** `USE_SKILLS_SURFACE` is NOT set in `.env` (grep returned nothing). So BP3 is still using the legacy doctrineSurface path. The trim hasn't actually landed on the conductor yet.

### 4. `recent_doctrine` limit hardcoded at 3
**File:** `osSessionService.js:1321`  
**Call:** `neo4jRetrieval.getRecentHighPriorityNodes({ days: 14, limit: 3 })`  
**Was:** Unknown prior value, but comment suggests 5 is the "natural" limit per CLAUDE.md.  
**Estimated token impact:** -200 to -400 tokens/turn (2 fewer Neo4j nodes × ~150 chars/node)

### 5. 1M context window removed
**File:** `osSessionService.js:1765-1769`  
**Tate:** "just fucking get rid of the 1m context" (2026-05-11)  
**Justification:** Was burning `money@` Max account weekly quota in seconds, blocking every fork. Correct removal.

### 6. Compaction threshold: 800K→120K
**File:** `.env:102`, `osSessionService.js:642`  
**Current:** `OS_SESSION_COMPACT_THRESHOLD=120000`  
**Prior (DeepSeek):** `800000` for DeepSeek, and the comment implies Claude was also higher before.  
**Impact:** Forces compaction at 120K conversation tokens instead of letting the session grow longer. 0 compaction events in last 7 days — the 120K threshold is NOT being hit, meaning conversation depth is staying comfortably below it.

### 7. `PROMPT_ASSEMBLY_V2=canary` (not live)
**File:** `.env:112`  
**Impact:** Only ~20% of conductor sessions get the 4-breakpoint cache layout (BP1-BP4). 80% of sessions still use v1 with one cache breakpoint. This does not affect what context is included, but affects caching efficiency for most sessions.

---

## Section 3 — Decision Quality Post-Trim

From `outcome_event` table, last 7 days vs prior 30 days:

| Outcome | Prior 30d | Last 7d | Delta |
|---|---|---|---|
| `success` | 54.6% | 43.0% | -11.6 pp |
| `unverified` | 45.1% | 44.1% | -1.0 pp |
| `failure` | 0% | 7.9% | +7.9 pp |
| `correction` | 0% | 1.1% | +1.1 pp |
| `infrastructure_verified` | 0.4% | 3.9% | +3.5 pp |

**Caution on interpretation:** The quality shift cannot be cleanly attributed to context leanness. The same period introduced:
- Phase G telemetry (new outcome classifiers producing previously-uncaptured `failure` verdicts)
- `working_set` substrate (fork_mp27az1r_1878c0, 12 May 2026)
- Observer trio routing to `observer_signals` substrate
- Conductor ownership of restart coordination

The `failure` category appearing at 7.9% could reflect new telemetry measuring things that previously went unclassified rather than actual quality degradation. The `correction` rate (1.1%) is the cleanest signal — Tate corrections went from 0% to 1.1%. That's mild but real.

**Tentative finding:** Quality may have softened slightly but the signal is too confounded by new telemetry activation to be definitive.

---

## Section 4 — Verdict

**Tate's intuition is DIRECTIONALLY CORRECT, for different reasons than suspected.**

The context richness on the input side is NOT too lean — avg 287K tokens/turn is 4.5x higher than 30 days ago, driven by the 4-tier prompt cache activation. The model is seeing plenty of context.

**The actual leanness is structural, not configurational:**

1. **Forks (where the bulk of real work happens) run on claude-sonnet-4-6, not claude-opus-4-7.** Every parallel audit, code review, email draft, deploy, and research task runs on Sonnet. Opus is used only for the thin conductor routing layer.

2. **Conductor Opus turns are shallow by design.** The system is optimised for Opus to route quickly and forks to do the work. This is correct architecture, but it means Opus's extended reasoning headroom is mostly spent on ~22-word visible responses with ~8K thinking tokens per turn of "what fork should I dispatch."

3. **The skillsSurface topK trim (5→3) is the most recoverable per-turn context reduction** with no documented quality justification.

4. **recent_doctrine is capped at 3 nodes** — the two above combined cost ~500-1000 tokens/turn and may degrade context quality for doctrine-relevant decisions.

5. **PROMPT_ASSEMBLY_V2 is still at canary (20%)** — most sessions are on v1 single-breakpoint caching. This doesn't remove context but reduces cache efficiency, raising the cost per turn for the 80% on v1.

**Token budget reality:** On cost basis, the system is at ~92% of API-equivalent budget (driven by the 4-tier cache warm). On raw token count, it's at ~19%. The "lean" feeling Tate senses is probably the Opus model being used for shallow routing work rather than deep reasoning, not a missing-context problem.

---

## Section 5 — Recommended Dial-Ups

| # | Tunable | Location | Current | Proposed | Est. token delta/turn | Risk |
|---|---|---|---|---|---|---|
| 1 | Fork model (managers) | `.env` `FORK_MANAGER_MODEL` | `claude-sonnet-4-6` | `claude-opus-4-7` | +50-200K thinking tokens/fork (Opus thinking) | Medium — cost impact |
| 2 | skillsSurface topK | `skillsSurfaceService.js:114` | `3` | `5` | +300-600 tokens/conductor turn | Low |
| 3 | recent_doctrine limit | `osSessionService.js:1321` | `3` | `5` | +200-400 tokens/conductor turn | Low |
| 4 | Flip PROMPT_ASSEMBLY_V2 to live | `.env` | `canary` | `live` | 0 extra tokens; better cache efficiency for 80% of sessions | Low — proven in canary |
| 5 | Compact threshold | `.env` `OS_SESSION_COMPACT_THRESHOLD` | `120000` | `250000` | 0 extra/turn; allows longer sessions before compaction fires | Low — not being hit anyway |
| 6 | Add recent_exchanges back (partial) | `osSessionService.js` | removed | Last 2 exchange pairs on fresh sessions only | +500-2000 tokens on fresh-session turns | Medium — need to gate on `!ccSessionId` |
| 7 | Fork worker model (all) | `.env` `FORK_WORKER_MODEL` | `claude-sonnet-4-6` | `claude-opus-4-7` | +full fork compute on Opus | High — ~5-10x cost increase on fork compute |

**Notes on dial-up 1 vs 7:**  
Upgrading manager forks only to Opus (dial-up 1) puts the coordination layer on Opus while workers stay on Sonnet. This is the right starting point — managers write the consolidated [FORK_REPORT], synthesise findings, and make retry decisions. That's exactly where Opus reasoning adds value. Workers doing mechanical tasks (file edits, DB queries, git operations) are well-served by Sonnet. Dial-up 7 (all forks on Opus) should wait for dial-up 1 results.

---

## Section 6 — Priority Order

**Phase A (low-risk, immediate):**
1. `PROMPT_ASSEMBLY_V2=live` — zero token cost change, just efficiency. Already proven at canary. No code change needed.
2. `recent_doctrine limit 3→5` — two-character code change (`limit: 3` → `limit: 5` in osSessionService.js:1321). +200-400 tokens/turn. Recovers one confirmed trim with no documented justification.
3. `skillsSurface topK 3→5` — two-character code change in skillsSurfaceService.js:114. +300-600 tokens/turn. Recovers the other confirmed trim.

**Phase B (moderate-risk, next session after A verified):**
4. `FORK_MANAGER_MODEL=claude-opus-4-7` — single env var change. Puts manager fork synthesis and coordination on Opus. Expected to materially improve fork_report quality and retry decision quality. Token cost increases per manager fork turn (Opus thinking per manager). Can be reverted instantly.
5. `OS_SESSION_COMPACT_THRESHOLD=250000` — single env var change. Allows deeper conversation history before compaction. Low risk since compaction is not currently firing.

**Phase C (evaluate after B, if more depth still wanted):**
6. Partial `recent_exchanges` restore — code change with `!ccSessionId` guard. Only on fresh sessions. Addresses the one case where SDK session history is genuinely absent.
7. `FORK_WORKER_MODEL=claude-opus-4-7` — reassess after monitoring Phase B cost impact. If FORK_MANAGER_MODEL upgrade doesn't move the needle enough, consider upgrading workers. This is the highest-cost option.

**Do NOT flip yet:**
- There is no evidence the 1M context window removal was wrong — it was burning accounts in seconds.
- Do not raise `recent_doctrine days` beyond 14 — nodes older than 2 weeks are rarely turn-relevant.

---

## Quick-ref: Confirmed knob locations

```
# .env (single-line changes)
PROMPT_ASSEMBLY_V2=live              # was: canary
FORK_MANAGER_MODEL=claude-opus-4-7   # was: claude-sonnet-4-6
OS_SESSION_COMPACT_THRESHOLD=250000  # was: 120000

# Code changes
osSessionService.js:1321  → limit: 5  (was 3)
skillsSurfaceService.js:114 → const topK = options.topK || 5  (was 3)
```

---

*Generated by fork_mp3wzf29_22a18e. Read-only audit — no tunables modified.*
