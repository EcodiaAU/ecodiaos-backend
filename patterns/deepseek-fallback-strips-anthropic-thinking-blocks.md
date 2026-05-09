---
triggers: deepseek-fallback, thinking-mode, provider-chain-sanitiser, no-bedrock-deepseek-only-fallback, cross-provider-content-compat, anthropic-thinking-block, deepseek-400-thinking, extended-thinking-mode-fallback, claude-max-exhaustion-fallback
---

# DeepSeek fallback path must strip Anthropic-only request shape before forwarding

## Rule

When a request bound for the Anthropic API falls through to the DeepSeek
Anthropic-compatible endpoint (the third tier of the
`claude_max → claude_max_2 → deepseek` provider chain per
`~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md`), the in-flight
HTTP body MUST be sanitised of Anthropic-only fields before it is forwarded.
Three coupled strips are required, and they are not optional or independent:

1. **Top-level `thinking` parameter — FORCE-WRITE to `{type:'disabled'}`.**
   v1 (commit `68a5da9`, 7 May 2026 05:14 UTC) blanket-deleted the param
   to escape the storm where the SDK was sending
   `thinking:{type:'enabled', budget_tokens:1500}`. That worked at the time
   because deletion left an absent param which (it was assumed) defaulted
   DeepSeek to thinking-off. v2 (9 May 2026, status_board row 8834dd85)
   discovered the assumption was wrong: DeepSeek's Anthropic-compat endpoint
   AUTO-ENABLES thinking mode when no `thinking` param is present. The 8 May
   commit `26c9d59` had set the SDK to send `thinking:{type:'disabled'}`
   explicitly to defend against that auto-enable, but v1's blanket-delete
   was undoing that defence. The wire-side invariant is now: every outbound
   request carries `thinking:{type:'disabled'}` regardless of upstream
   shape. If the SDK omits, force-write disabled. If the SDK sends adaptive
   or enabled, rewrite to disabled. If the SDK already sends disabled,
   normalise to the bare `{type:'disabled'}` shape. The validator never
   fires because thinking mode is explicitly off.
2. **`thinking` and `redacted_thinking` content blocks on assistant
   messages.** The Claude Agent SDK echoes prior assistant turns verbatim,
   thinking blocks included. Those blocks carry Anthropic-issued signatures
   that DeepSeek cannot validate, so DeepSeek 400s with "Invalid signature
   in thinking block".
3. **`cache_control` markers.** Anthropic prompt caching is expressed as
   `cache_control: { type: "ephemeral" }` on individual content blocks AND
   on entries of the system-prompt array form. DeepSeek does not implement
   prompt caching; the marker is at best ignored and at worst a 400. Strip
   defensively from every content block in `messages[].content` and from
   every entry of an array-form `system`.

The sanitiser MUST mutate only the in-flight HTTP body. It MUST NOT mutate
the SDK's own message store. The Claude Agent SDK runs as a child process
and owns its conversation state internally; the proxy intercepts requests
at the HTTP boundary only. The discipline matters because the chain returns
to Anthropic on the next turn after `claude_max_2` token wedge resolves,
and Anthropic still expects properly-rounded thinking blocks. If we mutate
the SDK's store, Anthropic 400s on switch-back.

## Do

- Sanitise on the request path inside the DeepSeek proxy, not on the SDK
  side. Code site: `src/services/deepseekProxyService.js`,
  `_stripThinkingFromRequest`.
- Strip all three classes in one pass. Do not ship a partial fix that
  leaves any of (1)/(2)/(3) live; they fail in tandem.
- The wire-side invariant for (1) is FORCE-WRITE-DISABLED, not strip.
  Always set `parsed.thinking = {type:'disabled'}` regardless of upstream
  shape (absent, enabled, adaptive, or disabled-with-extras). The proxy
  is the trust boundary; do not trust the SDK / CLI / call site to
  preserve the disabled shape.
- Treat the sanitiser as immutable with respect to the SDK. Parse, mutate,
  re-serialise, write to the wire. Never reach back into the SDK store.
- Apply (3) to BOTH the array-form system prompt AND every block in
  `messages[].content`. Tools commonly attach `cache_control` to the last
  user block in long-context requests.
- Cover with unit tests at the strip-function level. Tests live at
  `src/services/__tests__/deepseekProxyService.thinkingMode.test.js`.

## Do NOT

- Do NOT blanket-DELETE the top-level `thinking` parameter. v1 did this
  and the absence triggered DeepSeek's auto-enable on subsequent multi-turn
  tool loops, leading to the second-pass 400 storm at 7 May 23:13/23:24/23:49
  UTC. Always force-write to `{type:'disabled'}`.
- Do NOT strip thinking blocks while leaving the top-level `thinking`
  parameter set to `enabled` or `adaptive`. That is the exact v1 storm
  shape (DeepSeek refuses the request because thinking-mode validation
  expects round-trip blocks).
- Do NOT strip thinking blocks from user-role content. The SDK never sets
  them on user turns; if one appears, treat it as a malformed message and
  surface the bug, do not silently delete.
- Do NOT strip `tool_use` or `tool_result` blocks. Both are part of the
  Anthropic Messages spec and are honoured by the DeepSeek compat endpoint.
- Do NOT add a Bedrock branch as an alternate fallback. The chain is
  exactly two Max accounts plus DeepSeek per
  `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md`.
- Do NOT mutate the SDK's child-process message store from the proxy.

## Verification

Unit tests:

```bash
cd ~/ecodiaos && npx jest src/services/__tests__/deepseekProxyService.thinkingMode.test.js
```

Empirical (after the next provider-chain fallback event):

```sql
SELECT created_at, source, type, error_summary
FROM cc_events
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (error_summary ILIKE '%thinking%' OR error_summary ILIKE '%cache_control%')
ORDER BY created_at DESC;
```

Should return zero rows once the chain has fallen through to DeepSeek under
the new code at least once.

## Origin

**v1 storm (7 May 2026 03:51-03:58 UTC).** 18-event storm on `cc_session`
`a427439a`, all identical 400s from DeepSeek matching:

> "The `content[].thinking` in the thinking mode must be passed back to
> the API."

Diagnosed by `fork_mov0r7tw_e8fe19` (provider chain had fallen to DeepSeek
because both Max accounts were token-wedged; the SDK had extended-thinking
enabled on tate@'s session, so the request body carried both the top-level
`thinking` param and assistant content with thinking blocks; the proxy
stripped the blocks but left the param). v1 fix shipped as commit `68a5da9`
by `fork_mov10cqp_f1c933` (killed mid-flight; code landed clean):
top-level `thinking` blanket-DELETE, plus `cache_control` strip on system
array form and content blocks, plus 11 unit tests. Doctrine authored by
`fork_mov1aj70_df2597`. status_board row `8834dd85-03c0-4ac3-aecd-179e5eb38a86`
tracks the validation gate.

**v2 second-pass fix (9 May 2026, fork `fork_moxxt9ul_099f79`).** Three
post-v1 errors at 7 May 23:13 / 23:24 / 23:49 UTC across forks
`fork_mow3qoaq_79296a`, `fork_mow44x4a_5b3f15`, `fork_mow51olw_ee9ec0`.
Same 400 shape. RCA by `fork_moxxt9ul_099f79`: v1's blanket-DELETE was in
direct conflict with the SDK's 26c9d59 explicit-disable (8 May 08:56 UTC).
The proxy was undoing the SDK's defence, leaving DeepSeek to auto-enable
thinking mode and fail the second turn of multi-turn tool loops. v2 force-
writes `thinking:{type:'disabled'}` at the wire boundary regardless of
upstream shape. Test coverage 11 → 15 (one negative-test verification:
reverting the force-write to v1's delete fails 8 of 15). RCA at
`~/ecodiaos/drafts/deepseek-strip-incomplete-rca-2026-05-09.md`.

## Cross-refs

- `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` — the chain
  this sanitiser sits inside.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` —
  the validation gate is empirical (cc_events absence), not narrative.
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` — the
  upstream condition that triggers the DeepSeek tier in the first place.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` —
  the proxy is a thin sanitiser, not a parallel SDK; it preserves the
  Anthropic surface end-to-end and only mutates at the wire.
