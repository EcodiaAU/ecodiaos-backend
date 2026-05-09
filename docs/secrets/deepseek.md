---
triggers: deepseek-api-key-rotation, DEEPSEEK_API_KEY-rotation, kv_store.creds.deepseek-mutation, deepseek-provider-chain-fallback, rotate-deepseek-api-key, deepseek-thinking-block-strip
class: programmatic-required
owner: ecodiaos
---

# creds.deepseek

DeepSeek API credential. The only fallback in the provider chain `claude_max -> claude_max_2 -> deepseek` per `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md`. Activated when `DEEPSEEK_FALLBACK_ENABLED=true` and `DEEPSEEK_API_KEY` is set.

## Source

Generated from `https://platform.deepseek.com/` dashboard. Tate's account.

## Shape

object `{api_key, base_url}` typically.
- `api_key`: starts with `sk-` (DeepSeek's secret key prefix).
- `base_url`: `https://api.deepseek.com/v1` (default; may be overridden).

## Used by

- `src/services/llm/deepseekProxy.js` (and any wire-boundary sanitiser per `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md`).
- `forkService.js` / `voiceRelay.js` / `osSessionService.js` / `rescueRunner.js` when the fallback chain reaches DeepSeek.
- Env: `DEEPSEEK_API_KEY` baked into PM2 ecosystem.config.js + (optionally) Vercel project env.

## Rotation cadence

On compromise / leak / key-revocation event. No fixed cadence today.

## Rotation steps

1. Generate new key in DeepSeek dashboard, revoke old.
2. `db_execute` UPDATE `kv_store SET value = jsonb_set(value, '{api_key}', '"sk-NEW"') WHERE key = 'creds.deepseek'`.
3. Update `DEEPSEEK_API_KEY` in `~/ecodiaos/ecosystem.config.js` env block.
4. `pm2 restart ecodia-api`.
5. Verify: dispatch a fork that forces fallback, watch the proxy log for 200s.

## Cross-refs

- `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` — the provider chain doctrine.
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` — wire-boundary sanitisation requirement.
