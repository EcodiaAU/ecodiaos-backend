---
triggers: bedrock, claude-bedrock, aws-bedrock, BEDROCK_MODEL, CLAUDE_CODE_USE_BEDROCK, isBedrockFallback, bedrock-fallback, fallback-chain, provider-priority, deepseek-only-fallback, no-bedrock
---

# Provider fallback chain: claude_max → claude_max_2 → deepseek. Bedrock forbidden.

## Rule

The provider priority is exactly three tiers, in this order:

1. `claude_max` (tate@ecodia.au long-lived OAuth token, `CLAUDE_CODE_OAUTH_TOKEN_TATE`)
2. `claude_max_2` (code@ecodia.au long-lived OAuth token, `CLAUDE_CODE_OAUTH_TOKEN_CODE`)
3. `deepseek` (`DEEPSEEK_FALLBACK_ENABLED=true` + `DEEPSEEK_API_KEY`, native Anthropic-compatible endpoint)

**Bedrock is not in the chain.** No fourth tier. If both Max accounts are exhausted and DeepSeek is unavailable, the system surfaces the exhaustion to the conductor and waits for a reset window. It does NOT route to AWS Bedrock.

## Do

- Keep `getBestProvider()` returning `{ provider: 'deepseek', isDeepseekFallback: true }` when both Max accounts are down and DeepSeek is enabled.
- When DeepSeek is unavailable AND both Max are exhausted, return the least-bad Max account with a clear `reason` and let the conductor see the exhaustion (a real 429 or `truly exhausted` log).
- Strip `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `BEDROCK_MODEL` / `CLAUDE_CODE_USE_BEDROCK` from any provider-resolution code site. Bedrock is not configured.
- Pay-as-you-go gating in `schedulerPollerService` keys off `isDeepseekFallback` only.
- Cost-skip gating in `osHeartbeatService` keys off `isDeepseekFallback` only.

## Do NOT

- Do NOT add `else if (best.isBedrockFallback)` branches to provider-resolution code (osSessionService, forkService, etc).
- Do NOT set `CLAUDE_CODE_USE_BEDROCK=1` in any session env.
- Do NOT add `bedrock_fallback` to alert types or send `alertBedrockFallback()` emails.
- Do NOT add `bedrockHours` to digests.
- Do NOT validate `BEDROCK_MODEL` env shape - the env var is unused.
- Do NOT add `'bedrock'` to the `_currentProvider` switch-back guard in `usageEnergy.on('claude-available', ...)` - the guard only needs `'deepseek'`.

## Verification

```bash
cd ~/ecodiaos && grep -ri "bedrock" src/
```

Should return zero hits in `src/`. Only `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` (this file) is a permitted reference.

## Code sites that previously branched on Bedrock (now collapsed)

- `src/services/usageEnergyService.js` - `getBestProvider()` priority chain. `_activeProvider === 'bedrock'` checks. Doc-comment provider priority.
- `src/services/forkService.js` - `_resolveProviderForFork()` Bedrock branch. Removed.
- `src/services/osSessionService.js` - `if (best.isBedrockFallback) { ... }` branch in main provider-resolution. `bedrockDefault` constant. AWS env copies. `_currentProvider === 'bedrock'` checks. Removed.
- `src/services/osAlertingService.js` - `bedrock_fallback` cooldown entry, `SMS_ALERT_TYPES`, `alertBedrockFallback()` function, `bedrockHours` digest field. Removed.
- `src/services/schedulerPollerService.js` - pay-as-you-go provider label `'deepseek/bedrock'` simplified to `'deepseek'`.
- `src/services/osHeartbeatService.js` - `isBedrockFallback` energy-gate check simplified to `isDeepseekFallback` only.
- `src/services/osSelfCheckService.js` - same simplification.
- `src/services/osIncidentService.js` - `'provider_switch'` comment generalised; vocabulary unchanged.
- `src/config/env.js` - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `BEDROCK_MODEL` retained as no-op env defs (unused, harmless to leave for now).

## Origin

Tate verbatim 5 May 2026 12:40 AEST: "we dont want to be using bedrock ever. Just the two claude long life tokens + depeseek fallback."

The pre-existing 1 May 2026 "Bedrock fallback validated" deliverable (`~/ecodiaos/drafts/bedrock-fallback-validation-2026-05-01.md`) is superseded by this rule. Bedrock is not a tier; the chain is two Max accounts plus DeepSeek.

Cross-refs:

- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`
- `~/ecodiaos/patterns/discovery-to-doctrine-same-turn.md`
- `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` - credit-exhaustion classifier still applies; the recovery path now waits for a Claude reset rather than billing AWS.
