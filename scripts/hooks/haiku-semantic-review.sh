#!/usr/bin/env bash
# haiku-semantic-review.sh
#
# PreToolUse hook for fork + Factory dispatch:
#   - mcp__forks__spawn_fork
#   - mcp__factory__start_cc_session
#
# A Haiku-class semantic reviewer that complements the heuristic
# keyword/regex hooks. Reads tool dispatch JSON on stdin, extracts the
# brief/prompt, calls the Anthropic Messages API with claude-haiku-4-5
# against a cached doctrine summary, and surfaces the verdict as
#   stderr: '[HAIKU-REVIEW <verdict>] <reason>'
# plus a hookSpecificOutput JSON block for the model.
#
# Heuristic hooks catch keyword/shape misses. This reviewer catches
# FRAMING and ASSUMPTION misses heuristics cannot - e.g. a brief that
# assumes user-input arrival when autonomy was stated, a brief that
# reuses Co-Exist as wedge for a non-Kurt context, a brief that proposes
# outbound to a client without Tate sign-off.
#
# Always exits 0. Warn-only. Never blocks. Silent on API
# error/timeout/non-200 to avoid breaking dispatch when Anthropic is
# down or the account is rate-limited.
#
# Origin: brief from fork_motaz0yr_a06a3a authoring this hook,
# requested by Tate verbatim 6 May 2026 09:56 AEST: "haiku chat could
# be really good for picking up those semantic things that arent
# heuristic based".
#
# See ~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md.

set -u

# ---------------------------------------------------------------------------
# 1. Read the tool dispatch JSON from stdin.
# ---------------------------------------------------------------------------
input=$(cat)

# Tolerate non-JSON input gracefully (some upstream callers pipe garbage).
if ! echo "$input" | jq -e . >/dev/null 2>&1; then
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Filter on tool_name. Only run on the two dispatch surfaces.
# ---------------------------------------------------------------------------
tool_name=$(echo "$input" | jq -r '.tool_name // empty')
case "$tool_name" in
  mcp__forks__spawn_fork|mcp__factory__start_cc_session) : ;;
  *) exit 0 ;;
esac

# ---------------------------------------------------------------------------
# 3. Extract the brief/prompt field from tool_input.
# ---------------------------------------------------------------------------
# spawn_fork carries `brief`; start_cc_session carries `prompt`.
brief=$(echo "$input" | jq -r '.tool_input.brief // .tool_input.prompt // empty')

# Empty brief -> nothing to review.
if [ -z "$brief" ]; then
  exit 0
fi

# Cap brief size sent to Haiku (keep cost predictable on outsized briefs).
# 16k chars ~= 4k tokens. Plenty for the largest realistic dispatch brief.
if [ ${#brief} -gt 16000 ]; then
  brief="${brief:0:16000}"
fi

# ---------------------------------------------------------------------------
# 4. Resolve credential. Prefer ANTHROPIC_API_KEY; fall back to the
#    Claude Code OAuth token (sk-ant-oat01-...) which the Anthropic
#    Messages API accepts via Bearer auth.
# ---------------------------------------------------------------------------
ENV_FILE="$HOME/ecodiaos/.env"

extract_env_var() {
  # $1 = var name. Reads ENV_FILE, picks the LAST `^NAME=...` line,
  # strips surrounding quotes. Avoids `source` (the .env contains a
  # multi-line GOOGLE service account JSON that breaks bash parsing).
  local name="$1"
  [ -f "$ENV_FILE" ] || { printf ''; return; }
  local val
  val=$(grep -E "^${name}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)
  # Strip surrounding double or single quotes.
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

CRED=""
CRED_SOURCE=""

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  CRED="$ANTHROPIC_API_KEY"
  CRED_SOURCE="env:ANTHROPIC_API_KEY"
else
  CRED=$(extract_env_var ANTHROPIC_API_KEY)
  if [ -n "$CRED" ]; then
    CRED_SOURCE="dotenv:ANTHROPIC_API_KEY"
  else
    CRED=$(extract_env_var CLAUDE_CODE_OAUTH_TOKEN_CODE)
    if [ -n "$CRED" ]; then
      CRED_SOURCE="dotenv:CLAUDE_CODE_OAUTH_TOKEN_CODE"
    fi
  fi
fi

# No credential available -> silent exit (hook is warn-only, never blocks).
if [ -z "$CRED" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Load the cached doctrine system prompt.
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_FILE="$HOME/ecodiaos/scripts/hooks/lib/haiku-doctrine-summary.md"
if [ ! -f "$SYSTEM_PROMPT_FILE" ]; then
  exit 0
fi
SYSTEM_PROMPT=$(cat "$SYSTEM_PROMPT_FILE")

# ---------------------------------------------------------------------------
# 6. Build the request body via jq (handles all escaping correctly).
# ---------------------------------------------------------------------------
USER_MSG="Review this brief/prompt for semantic mismatches against the cached doctrine. Output exactly one of these three formats: PASS | WARN: <one-line reason> | BLOCK: <one-line reason>. Brief follows: ---
${brief}
---"

REQUEST_BODY=$(jq -n \
  --arg model "claude-haiku-4-5" \
  --arg sys "$SYSTEM_PROMPT" \
  --arg user "$USER_MSG" \
  '{
    model: $model,
    max_tokens: 100,
    system: [
      {
        type: "text",
        text: $sys,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      { role: "user", content: $user }
    ]
  }')

# ---------------------------------------------------------------------------
# 7. POST to Messages API. 5-second timeout. Capture HTTP status + body.
# ---------------------------------------------------------------------------
TMP_BODY=$(mktemp)
trap 'rm -f "$TMP_BODY"' EXIT

HTTP_CODE=$(curl -sS \
  --max-time 5 \
  -o "$TMP_BODY" \
  -w "%{http_code}" \
  -X POST https://api.anthropic.com/v1/messages \
  -H "Authorization: Bearer ${CRED}" \
  -H "x-api-key: ${CRED}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$REQUEST_BODY" 2>/dev/null) || HTTP_CODE="000"

# On any error / non-200, try the legacy Haiku model name as fallback.
if [ "$HTTP_CODE" != "200" ]; then
  if [ "$HTTP_CODE" = "404" ] || [ "$HTTP_CODE" = "400" ]; then
    REQUEST_BODY_FALLBACK=$(echo "$REQUEST_BODY" | jq '.model = "claude-3-5-haiku-latest"')
    HTTP_CODE=$(curl -sS \
      --max-time 5 \
      -o "$TMP_BODY" \
      -w "%{http_code}" \
      -X POST https://api.anthropic.com/v1/messages \
      -H "Authorization: Bearer ${CRED}" \
      -H "x-api-key: ${CRED}" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      -d "$REQUEST_BODY_FALLBACK" 2>/dev/null) || HTTP_CODE="000"
  fi
fi

if [ "$HTTP_CODE" != "200" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# 8. Parse verdict + token usage.
# ---------------------------------------------------------------------------
VERDICT_RAW=$(jq -r '.content[0].text // empty' "$TMP_BODY" 2>/dev/null | tr -d '\r')
INPUT_TOKENS=$(jq -r '.usage.input_tokens // 0' "$TMP_BODY" 2>/dev/null)
OUTPUT_TOKENS=$(jq -r '.usage.output_tokens // 0' "$TMP_BODY" 2>/dev/null)
CACHE_READ=$(jq -r '.usage.cache_read_input_tokens // 0' "$TMP_BODY" 2>/dev/null)
CACHE_CREATE=$(jq -r '.usage.cache_creation_input_tokens // 0' "$TMP_BODY" 2>/dev/null)

if [ -z "$VERDICT_RAW" ]; then
  exit 0
fi

# Take only the first line (defensive against verbose models).
VERDICT_LINE=$(printf '%s' "$VERDICT_RAW" | head -1)

# Classify verdict.
case "$VERDICT_LINE" in
  PASS|PASS:*)
    LEVEL="PASS"
    REASON="ok"
    ;;
  WARN:*)
    LEVEL="WARN"
    REASON="${VERDICT_LINE#WARN:}"
    REASON="${REASON# }"
    ;;
  BLOCK:*)
    LEVEL="BLOCK"
    REASON="${VERDICT_LINE#BLOCK:}"
    REASON="${REASON# }"
    ;;
  *)
    # Unknown shape - treat as PASS but record the raw verdict so the
    # token log captures drift over time.
    LEVEL="PASS"
    REASON="unknown-shape"
    ;;
esac

# ---------------------------------------------------------------------------
# 9. Log token usage to JSONL.
# ---------------------------------------------------------------------------
LOG_DIR="$HOME/ecodiaos/logs"
LOG_FILE="$LOG_DIR/haiku-review-tokens.jsonl"
mkdir -p "$LOG_DIR" 2>/dev/null || true

if [ -w "$LOG_DIR" ] || [ ! -e "$LOG_DIR" ]; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq -nc \
    --arg ts "$TIMESTAMP" \
    --argjson it "${INPUT_TOKENS:-0}" \
    --argjson ot "${OUTPUT_TOKENS:-0}" \
    --argjson cr "${CACHE_READ:-0}" \
    --argjson cc "${CACHE_CREATE:-0}" \
    --arg verdict "$LEVEL" \
    --arg reason "$REASON" \
    --arg cred "$CRED_SOURCE" \
    --arg tool "$tool_name" \
    '{
      timestamp: $ts,
      tool_name: $tool,
      input_tokens: $it,
      output_tokens: $ot,
      cache_read_input_tokens: $cr,
      cache_creation_input_tokens: $cc,
      verdict: $verdict,
      reason: $reason,
      cred_source: $cred
    }' >> "$LOG_FILE" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 10. Surface verdict to model + stderr. Always exit 0.
# ---------------------------------------------------------------------------
STDERR_LINE="[HAIKU-REVIEW ${LEVEL}] ${REASON}"
echo "$STDERR_LINE" >&2

# Only inject model-visible additionalContext on WARN/BLOCK so PASS is silent.
if [ "$LEVEL" = "WARN" ] || [ "$LEVEL" = "BLOCK" ]; then
  jq -n \
    --arg ctx "Haiku semantic reviewer flagged this dispatch: ${STDERR_LINE}. This is a SECOND-OPINION layer (heuristic hooks already passed). Re-read the brief against the named rule before proceeding. Doctrine: ~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md. Warn-only - never blocks." \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: $ctx
      }
    }'
fi

exit 0
