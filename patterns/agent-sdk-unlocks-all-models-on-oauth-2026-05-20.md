---
triggers: oauth-haiku-only, oauth-429-sonnet, oauth-429-opus, raw-sdk-vs-agent-sdk, anthropic-sdk-model-limit, claude-code-oauth-token, max-subscription-models, headless-triage-model, sonnet-via-oauth, opus-via-oauth, why-cant-oauth-run-sonnet, long-lived-token-models, agent-sdk-model-selection, raw-anthropic-sdk-subscription-limit
---

# The Agent SDK unlocks all models on OAuth; the raw SDK is Haiku-only

Two different Anthropic SDKs behave differently when authed with a Claude Max **OAuth** token (`CLAUDE_CODE_OAUTH_TOKEN_*`, the long-lived subscription tokens), and the difference is not documented anywhere obvious. It cost real confusion ("im confused why oauth or our long life tokens we were using for cc cli arent able to run sonnet or opus" - Tate, 2026-05-20).

| SDK | Package | OAuth token behaviour |
|---|---|---|
| Raw Messages SDK | `@anthropic-ai/sdk` | **Haiku only.** Sonnet/Opus return **429** ("usage limit"/quota) on the subscription OAuth path. The raw SDK hits the API as if it were a metered API-key caller, and the subscription path only grants Haiku that way. |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | **All models work** - Haiku, Sonnet, Opus. Same `CLAUDE_CODE_OAUTH_TOKEN_*`, no API key. The Agent SDK drives the same code path as the `claude` CLI, which IS the full Max subscription entitlement. |

This is why the `claude` CLI (and everything built on the Agent SDK) ran Sonnet/Opus fine "the entire time on the VPS", while a hand-rolled `@anthropic-ai/sdk` triage loop silently could only do Haiku.

## The rule

When you need **Sonnet or Opus on a Claude Max subscription token** (no metered API key), use `@anthropic-ai/claude-agent-sdk` (`query()` with `systemPrompt: { type:'preset', preset:'claude_code' }`), NOT the raw `@anthropic-ai/sdk`. The raw SDK is fine ONLY when Haiku is acceptable (cheap, high-volume, latency-critical: voice relay, observer trio).

If a raw-SDK call 429s on Sonnet/Opus, do NOT conclude "out of quota" or "account capped". The account is fine. The wrong SDK is the cause. Switch to the Agent SDK.

## How to do it (reference implementations)

- `src/services/triageAgentSdk.js` - Sonnet triage via Agent SDK + OAuth (built 2026-05-20 to escape the Haiku-only raw-SDK triage). Account rotation across `CLAUDE_CODE_OAUTH_TOKEN_{MONEY,CODE,TATE}`.
- `src/services/voiceRelay.js` - Haiku via Agent SDK on the `code` account (the original proof that Agent SDK + OAuth runs a chosen model).
- Both pass `pathToClaudeCodeExecutable` to the glibc binary (musl auto-detect trap, see [[sdk-musl-vs-glibc-binary-auto-detect-trap]]).
- Both delete `ANTHROPIC_API_KEY` from the child env so the OAuth path is taken, not the metered-key path.

## Gotchas carried from the build

- The in-process MCP server must be rebuilt per query, never cached across `query()` calls (`Server.connect()` throws "Already connected" and the SDK silently drops the tool surface). See [[sdk-mcp-server-instances-must-be-per-query-not-singleton]].
- `tool()` from the Agent SDK takes a **zod raw shape** (`{ body: z.string() }`), not a JSON schema object.
- The Agent SDK uses the `claude_code` preset system prompt; a custom triage system prompt has to be folded into the user prompt, not passed as a separate system block.

## When this fires

- Choosing a model for any new headless / cron / background agent path on the VPS or Corazon.
- Debugging a 429 on Sonnet/Opus where the account clearly has capacity.
- Someone proposes adding `ANTHROPIC_API_KEY` "so we can use Sonnet" - no, use the Agent SDK on the OAuth token instead and keep the spend on the subscription.

Origin: 2026-05-20, native-app triage upgrade. Haiku triage was misreading intent; the fix was Sonnet, which required moving the triage loop from `@anthropic-ai/sdk` to `@anthropic-ai/claude-agent-sdk`. Cross-refs: [[sdk-musl-vs-glibc-binary-auto-detect-trap]], [[sdk-mcp-server-instances-must-be-per-query-not-singleton]], [[multi-account-credit-state-model]], [[mcp-static-bearer-not-claudeai-oauth-2026-05-19]], [[one-conductor-many-channels-2026-05-19]].
