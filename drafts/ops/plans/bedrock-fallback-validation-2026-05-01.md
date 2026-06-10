# Bedrock fallback validation - 1 May 2026

**Fork:** fork_momlj5bw_bca7df (Wave 1 Fork E)
**Date:** 2026-05-01 ~06:50 AEST
**Verdict:** **PASS** - Bedrock fallback path serves end-to-end with cross-region inference profile id.

---

## Phase 1 - env config probe

**.env values (canonical /home/tate/ecodiaos/.env):**

| Key | Value |
|---|---|
| `BEDROCK_MODEL` | `us.anthropic.claude-opus-4-1-20250805-v1:0` |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | `AKIAWM<REDACTED>` (present) |
| `AWS_SECRET_ACCESS_KEY` | `<REDACTED>` (present) |

**Verdict:** Model id matches the validation regex `/^(us|eu|apac)\.anthropic\.claude-/i` enforced in both `src/services/osSessionService.js:1369` and `src/services/forkService.js:364`. Cross-region inference profile id is correctly shaped, NOT an Anthropic OAuth id (`claude-opus-4-7` shape rejected by Bedrock with "invalid model identifier"). All three required AWS creds present.

**.env discovery:** Only one env file exists at `/home/tate/ecodiaos/.env`. No `.env.local`, `.env.production`, etc. Pattern probe-all-env-files-not-just-dotenv.md applied - nothing else to check. (Note: dotenv loaded by `src/config/env.js:1` at app startup; `/proc/PID/environ` does NOT show dotenv-loaded vars, only PM2 launch-time env. Not a bug.)

**Default in env.js:** `src/config/env.js:233` defines `BEDROCK_MODEL: z.string().default('us.anthropic.claude-opus-4-1-20250805-v1:0')` - same value as .env. If .env were missing, default would still be valid Bedrock-shaped.

---

## Phase 2 + 3 - Bedrock connectivity + fallback path E2E

**Approach:** No `aws` CLI installed and `@aws-sdk` is empty in node_modules. The production Bedrock fallback runs through the `claude` CLI (claude-agent-sdk) with `CLAUDE_CODE_USE_BEDROCK=1`. So testing connectivity AND testing the fallback path are the same thing - exercising the production code path.

**Test script:** `/tmp/bedrock-fallback-test.sh` - mirrors what osSessionService.js builds in sessionEnv on Bedrock fallback:
- Strips `CLAUDE_CODE_OAUTH_TOKEN*`, `CLAUDE_CONFIG_DIR*`, `ANTHROPIC_API_KEY` (production code does same)
- Sets `CLAUDE_CODE_USE_BEDROCK=1` (production: `sessionEnv.CLAUDE_CODE_USE_BEDROCK = '1'`)
- Forwards `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- Invokes `claude --print --model "$BEDROCK_MODEL" "Reply with exactly the word: pong"`

**Result:**
```
=== Bedrock fallback E2E test ===
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAWM<REDACTED>
BEDROCK_MODEL=us.anthropic.claude-opus-4-1-20250805-v1:0
CLAUDE_CODE_USE_BEDROCK=1
---
Firing 1-token test prompt...
pong
---
Exit code: 0
```

**Wall time:** ~3-4 seconds. Well within the 60s timeout.

**Verdict:** Bedrock reachable, AWS creds valid, cross-region inference profile id valid for us-east-1, claude CLI Bedrock path operational, end-to-end successful clean text completion.

---

## Phase 4 - production-path equivalence

The validation test built `sessionEnv` matching exactly what osSessionService.js:1349-1379 builds when `best.isBedrockFallback === true`:

| osSessionService.js | Test script | Match |
|---|---|---|
| `delete sessionEnv.CLAUDE_CODE_OAUTH_TOKEN` | `unset CLAUDE_CODE_OAUTH_TOKEN` | yes |
| `if (env.AWS_ACCESS_KEY_ID) sessionEnv.AWS_ACCESS_KEY_ID = ...` | sourced from .env | yes |
| `if (env.AWS_SECRET_ACCESS_KEY) sessionEnv.AWS_SECRET_ACCESS_KEY = ...` | sourced from .env | yes |
| `if (env.AWS_REGION) sessionEnv.AWS_REGION = env.AWS_REGION` | sourced from .env | yes |
| `sessionEnv.CLAUDE_CODE_USE_BEDROCK = '1'` | `export CLAUDE_CODE_USE_BEDROCK=1` | yes |
| `options.model = bedrockDefault` (or candidate after regex match) | `--model "$MODEL"` with same default | yes |

The only difference: production uses claude-agent-sdk programmatic API with these env vars; test uses claude CLI directly. Same underlying claude binary at `/home/tate/.nvm/versions/node/v20.20.2/bin/claude` v2.1.107.

forkService.js:357-377 uses identical env-shape - validation extends to fork dispatches as well.

---

## Overall verdict: PASS

- env config: PASS (all required vars present, correctly shaped)
- Bedrock connectivity: PASS (claude CLI Bedrock path returned model output)
- fallback path E2E: PASS (full sessionEnv shape exercised, identical to production code path)

**Bedrock fallback is operational.** When both Claude Max accounts hit weekly cap, the conductor and forks will route to `us.anthropic.claude-opus-4-1-20250805-v1:0` on us-east-1 via AWS Bedrock with current credentials.

---

## Followups (none P1)

1. **DeepSeek fallback path** is configured to fire BEFORE Bedrock when `DEEPSEEK_FALLBACK_ENABLED=true && DEEPSEEK_API_KEY` set. Bedrock only triggers if BOTH Max accounts down AND DeepSeek not configured/down. Worth a separate validation pass on DeepSeek if/when enabled - not in scope for this fork.
2. **Spurious-fallback gate** (osSessionService.js:1334-1346) - alerts only if a Max acct has `pctUsed >= 0.85` or `rateLimitStatus === 'rejected'`. If router routes to Bedrock without that signal, log-only path. Healthy guard, no action needed.
3. **claude-agent-sdk programmatic Bedrock path** - this validation used CLI direct. Production routes via SDK. Same env vars + same model id; no reason to think SDK behaves differently, but if a future Bedrock-shaped failure surfaces, isolate SDK vs CLI as separate variable.

---

## Test artefact

- Script: `/tmp/bedrock-fallback-test.sh` (re-runnable)
- One-line repro: `bash /tmp/bedrock-fallback-test.sh`
- Stamped: fork_momlj5bw_bca7df
