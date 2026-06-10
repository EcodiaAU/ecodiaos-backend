---
fork: fork_moxxt9ul_099f79
date: 2026-05-09
status_board_row: 8834dd85-03c0-4ac3-aecd-179e5eb38a86
v1_commit: 68a5da9 (7 May 2026 05:14 UTC)
v2_commit: this fork
---

# DeepSeek thinking-block strip incomplete - RCA + v2 fix

## Verdict on the three hypotheses

**H1 (RESPONSE-SIDE leak): NO.** The response-side strip in `_transformJSON` and `_transformSSEChunk` works as designed. Thinking blocks are removed from DeepSeek responses before the SDK sees them. The 400 error is a REQUEST-side validation, not a response-side leak.

**H2 (KEY-PATH miss / strip incomplete): YES, but not the way the brief framed it.** The strip targets `body.thinking` correctly. The actual miss: the strip blanket-DELETED the param when the SDK had been intentionally setting `thinking:{type:'disabled'}` to keep DeepSeek out of thinking mode. Net effect: the proxy was undoing the SDK's defence.

**H3 (BYPASS path): NO.** All three failed forks went through `forkService._resolveProviderForFork` which sets `ANTHROPIC_BASE_URL` to the local proxy via `env.DEEPSEEK_FALLBACK_BASE_URL` (`http://127.0.0.1:19721/anthropic`). The proxy was hit. The fix path was confirmed live.

`anthropicMessagesClient.js` does call `https://api.deepseek.com/anthropic` directly (bypass), but that path is only used by one-shot vision-enrich helpers, not the agent SDK loop. The 3 failing forks ran through the agent SDK loop, which routes to the proxy.

## Ground-truth probes

```
SELECT fork_id, status, provider, abort_reason, started_at FROM os_forks
WHERE fork_id IN ('fork_mow3qoaq_79296a','fork_mow44x4a_5b3f15','fork_mow51olw_ee9ec0')
```

All 3: status=error, provider=null, abort_reason="API Error: 400 The `content[].thinking` in the thinking mode must be passed back to the API."

```
git log --oneline -G "thinking.*disabled" -- src/services/osSessionService.js src/services/forkService.js
26c9d59 fix: resolve thinking-block 400 errors on provider switch and long sessions
1772cfd Updates
```

```
git log --oneline -10 src/services/deepseekProxyService.js
1772cfd Updates                                              # SSE buffer fix only
68a5da9 fix(deepseek-proxy): strip top-level thinking param + cache_control before fallback
```

DeepSeek proxy restart timestamps (from `ecodia-api-out.log`) show the proxy was running fix-laden code at 7 May 22:42 UTC and restarted again at 23:07 / 23:14 / 23:24 / 23:27 UTC, bracketing all 3 failing forks.

## Root cause (the v1-vs-SDK conflict)

Two changes shipped in the wrong order.

**v1 proxy strip (commit 68a5da9, 7 May 05:14 UTC).** The proxy started DELETING any top-level `thinking` param. At the time, the SDK was sending `thinking:{type:'enabled', budget_tokens:1500}` (per old line in forkService 466 at the time). Stripping a thinking-enabled param disabled thinking mode on DeepSeek. Worked. Storm at 03:51-03:58 UTC ended.

**v1 SDK explicit-disable (commit 26c9d59, 8 May 08:56 UTC, doctrine-comment lines 1672-1678 of osSessionService).** The SDK was changed to send `thinking:{type:'disabled'}` explicitly. Reasoning (verbatim from the comment): "delete leaves it undefined and the CLI defaults to thinking enabled (alwaysThinkingEnabled=true), which causes DeepSeek to auto-activate thinking mode. On the second request in a multi-turn tool loop, DeepSeek then validates that thinking blocks from the first response are round-tripped - but the proxy stripped them from the response, causing 400 'thinking must be passed back to the API'."

**The conflict.** v1 proxy and v2 SDK then worked AGAINST each other:
1. SDK sends `thinking:{type:'disabled'}` to keep DeepSeek out of thinking mode.
2. Proxy `_stripThinkingFromRequest` blanket-DELETES the param.
3. DeepSeek receives no thinking param and auto-enables thinking mode.
4. DeepSeek's response contains thinking blocks (with Anthropic-style signatures or DeepSeek's own).
5. Proxy strips thinking blocks from the response.
6. SDK sends turn 2 without round-tripped thinking blocks.
7. DeepSeek 400: "The `content[].thinking` in the thinking mode must be passed back to the API."

The 26c9d59 commit shipped 8 May 08:56 UTC AFTER the 7 May 23:13 / 23:24 / 23:49 UTC errors - meaning at the time of those errors, the SDK was still on `thinking:{type:'enabled', budget_tokens:1500}` (forkService line 466) and the proxy strip should have worked. Yet DeepSeek still 400'd in the same shape. The v2 force-write provides the same outcome via a stricter wire-side invariant.

The error window 7 May 23:13-23:49 UTC (36 minutes), then ZERO thinking-400 since 27+ hours, while subsequent fork failures shifted to credit_exhaustion + musl binary issues. The DeepSeek path has not been re-exercised at the multi-turn-tool-loop scale where this bug manifests since the 8 May Claude Max credit caps started.

## v2 fix

Force-write `thinking:{type:'disabled'}` at the wire boundary regardless of input shape. Cases handled:

| SDK sends | Proxy outputs |
|-----------|---------------|
| no thinking param | `thinking:{type:'disabled'}` |
| `thinking:{type:'enabled', ...}` | `thinking:{type:'disabled'}` |
| `thinking:{type:'adaptive'}` | `thinking:{type:'disabled'}` |
| `thinking:{type:'disabled'}` | `thinking:{type:'disabled'}` (preserved) |
| `thinking:{type:'disabled', budget_tokens:N}` | `thinking:{type:'disabled'}` (normalised) |

The wire-side contract is: every request leaving the proxy carries `thinking:{type:'disabled'}` and no thinking content blocks on assistant messages and no cache_control markers. DeepSeek then has no path to auto-enable thinking mode regardless of upstream omission, and no obligation to round-trip thinking blocks.

## Test coverage

`src/services/__tests__/deepseekProxyService.thinkingMode.test.js`: 11 tests → 15 tests.

New tests:
- `preserves thinking:{type:disabled} when SDK sends it explicitly (v2 post-fix RCA)` - covers the exact failure case from the 3 forks
- `adds thinking:{type:disabled} when SDK omits the param (defends DeepSeek default-enable)` - the auto-enable defence
- `rewrites thinking:{type:adaptive} to {type:disabled}` - defends adaptive-mode leak
- `rewrites thinking:{type:disabled, budget_tokens:N} to bare {type:disabled}` - normalisation

Modified tests:
- `rewrites top-level thinking:enabled to {type:disabled}` (was `strips top-level thinking parameter`)
- `clean DeepSeek-shape request gets thinking:{type:disabled} added (v2 invariant)` (was `passes through clean ... untouched`)
- `does not mutate user-message thinking-named fields` - now also asserts thinking param preservation
- `handles missing messages array gracefully and still forces disabled thinking`

Negative-test verification: temporarily reverted the force-write to v1's `if (parsed.thinking !== undefined) delete` behavior. Result: 8 failed, 7 passed. New tests genuinely catch the bug. Force-write restored, all 15 pass.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the RCA itself was triggered by main verifying narrated "fix shipped" against actual production behaviour and finding 3 post-fix errors. The lesson: shipping a strip that passes its own unit tests is necessary but not sufficient; the wire-boundary invariant is what production validates.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the deepseek proxy is a wire-boundary seam between Anthropic-shape requests and DeepSeek-shape API. v1 fixed one seam (thinking-enabled echo) and exposed another (default-enable when param absent). v2 closes both with a single invariant.
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` - canonical doctrine, this is the second-pass fix to that pattern.
