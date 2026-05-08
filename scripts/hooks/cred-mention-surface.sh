#!/usr/bin/env bash
# cred-mention-surface.sh
#
# PreToolUse hook for mcp__forks__spawn_fork and mcp__factory__start_cc_session.
# Reads tool input on stdin, scans the brief for cred-keyword signals, and
# warns (never blocks) when a brief mentions credential-related work but does
# not reference the secrets registry at ~/ecodiaos/docs/secrets/.
#
# Surfaces:
#   ~/ecodiaos/docs/secrets/INDEX.md
#   ~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md
#
# Output:
#   stderr: '[CRED-SURFACE WARN] brief mentions <keyword>, no secrets/ ref'
#   stdout: hookSpecificOutput JSON with additionalContext for the model
#
# Always exits 0. Warn-only.

set -u

input=$(cat)

# Tolerate non-JSON input gracefully.
if ! echo "$input" | jq -e . >/dev/null 2>&1; then
  exit 0
fi

tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# The brief lives in different fields depending on the tool. Try the common ones.
brief=$(echo "$input" | jq -r '
  .tool_input.brief
  // .tool_input.prompt
  // .tool_input.message
  // .tool_input.task
  // empty
')

if [ -z "$brief" ] || [ "$brief" = "null" ]; then
  exit 0
fi

# Strip hook-tag lines from the keyword-scan input so the hook never fires on
# its own forcing-function output or on [APPLIED] / [NOT-APPLIED] tags. See
# ~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md.
# Origin: 6+ false positives 21:00-21:12 AEST 29 Apr 2026 across this hook.
STRIP_TAGS_LIB="$(dirname "$0")/lib/strip-tag-lines.sh"
if [ -f "$STRIP_TAGS_LIB" ]; then
  brief=$(printf '%s' "$brief" | bash "$STRIP_TAGS_LIB")
fi

# If the brief already references the secrets registry, the agent has surfaced
# the right context. Skip warning.
if echo "$brief" | grep -qiE '(docs/secrets/|secrets-registry|secrets/INDEX\.md|/secrets/[a-z0-9_-]+\.md)'; then
  exit 0
fi

warnings=()

# Parallel surfaces array. Each entry is "PRIMARY_PATH|TRIGGER_KEYWORD"
# where PRIMARY_PATH is the canonical doctrine path under
# ~/ecodiaos/docs/secrets/ that the conductor is expected to tag with
# [APPLIED] / [NOT-APPLIED] in the dispatch brief or tool result. Storing the
# canonical path at WRITE time (vs the legacy "secrets:<class>" synthetic
# key) makes the post-action-applied-tag-check.sh hook's path-alternation
# match what the conductor actually writes.
#
# Origin: 8 May 2026 ship of gap (1) of status_board row 18f02513-b12d-4d69-9628-98ae6f62db6b.
# Pre-fix surface_event silent_count/app_count was ~95% across all 12 secrets:*
# pattern_paths because the post-action hook expected paths like
# `~/ecodiaos/docs/secrets/laptop-agent.md` but surface_event rows held
# `secrets:Corazon` (the warning-text shorthand, not the file slug).
# See: ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
#      Layer 3.
surfaces=()

# --- Helper: count regex matches in a group ---
count_matches() {
  echo "$1" | grep -ciE "$2"
}

# --- High-leverage cred-keyword groups ---
# Each group maps a category of work to the secrets/ files it should surface.
#
# TRIGGER TIGHTENING (5 May 2026):
# Broad keywords like \bios\b and \bandroid\b alone cause false-positive
# [CRED-SURFACE WARN] when briefs mention cross-platform testing. Each group
# now splits keywords into HIGH (clearly credential work — fires singly) and
# BROAD (ambiguous — requires a second keyword in the same category).
# Origin: ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md

# --- iOS / TestFlight / App Store Connect ---
ios_high=$(count_matches "$brief" '\b(testflight|app store connect|\basc\b|xcodebuild|transporter|altool|fastlane|provisioning profile|signing identity|developer\.apple\.com|appstoreconnect|team_id|p8 file|asc api key)\b')
ios_broad=$(count_matches "$brief" '\b(ios|ipa|code signing)\b')
if [ "$ios_high" -gt 0 ] || [ "$ios_broad" -ge 2 ]; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions iOS / ASC / TestFlight work but does not reference ~/ecodiaos/docs/secrets/. Read: apple.md, apple-asc-keys.md, asc-api-fallback.md, macincloud.md before dispatching. The GUI-macro doctrine in ~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md says Apple uploads use the macro path, NOT the API-key path.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/apple.md|ios")
fi

# --- Android / Play Console / keystore ---
android_high=$(count_matches "$brief" '\b(play console|google play|keystore|\.jks|aab|fastlane supply|upload key|gradle.*sign|signingConfigs)\b')
android_broad=$(count_matches "$brief" '\b(android|coexist[- ]?android|roam[- ]?android)\b')
if [ "$android_high" -gt 0 ] || [ "$android_broad" -ge 2 ]; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Android / Play Console work but does not reference ~/ecodiaos/docs/secrets/. Read: _pending-android-keystores.md, _pending-google-play-service-account.md before dispatching. Keystores are PENDING (NEEDS-TATE) and the Play SA is DEMOTED to fallback under the GUI-macro doctrine.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/android-keystores.md|android")
fi

# --- Bitbucket / [redacted] / git push to [redacted] ---
if echo "$brief" | grep -qiE '\b(bitbucket|[redacted]|[redacted]|[redacted].*push|ATATT|atlassian.*token|api\.bitbucket\.org)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Bitbucket / [redacted] work but does not reference ~/ecodiaos/docs/secrets/. Read: bitbucket.md before dispatching. Note the two-context auth split (git remote uses x-bitbucket-api-token-auth username; REST API uses code@ecodia.au).")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/bitbucket.md|bitbucket")
fi

# --- Supabase Management / Edge Function deploy ---
if echo "$brief" | grep -qiE '\b(supabase.*deploy|edge function deploy|npx supabase functions|sbp_|supabase access token|supabase management api)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Supabase Management / Edge Function deploy but does not reference ~/ecodiaos/docs/secrets/. Read: supabase-access-token.md before dispatching.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/supabase-access-token.md|supabase")
fi

# --- Co-Exist Graph API / Microsoft Graph / excel-sync ---
if echo "$brief" | grep -qiE '\b(coexist[- ]?graph|microsoft graph|graph api|entra|azure ad|excel-sync|excel sync|coexistaus\.org|client_secret.*tenant)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Microsoft Graph / Co-Exist excel-sync work but does not reference ~/ecodiaos/docs/secrets/. Read: coexist-graph-api.md, coexist-excel-file.md, coexist-supabase.md before dispatching.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/coexist-graph-api.md|microsoft-graph")
fi

# --- MacInCloud / SY094 / Mac SSH ---
if echo "$brief" | grep -qiE '\b(macincloud|sy094|sshpass.*mac|ssh.*mac|mac.*ssh|user276189|MacInCloud\.com)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions MacInCloud / SY094 / Mac SSH work but does not reference ~/ecodiaos/docs/secrets/. Read: macincloud.md before dispatching. Note: MacInCloud auto-rotates passwords on certain panel events; if SSH fails with Permission denied, the password is stale.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/macincloud.md|macincloud")
fi

# --- Corazon laptop agent / Tailscale ---
# Broad keywords kept single-fire: "corazon" or "laptop-agent" in a brief
# nearly always means actual automation work (not cross-platform testing).
if echo "$brief" | grep -qiE '\b(corazon|laptop[- ]?agent|tailscale|100\.114\.219\.69|eos-laptop-agent|/api/tool|browser\.enableCDP|screenshot\.screenshot|input\.click|input\.type)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Corazon / laptop-agent work but does not reference ~/ecodiaos/docs/secrets/. Read: laptop-agent.md, laptop-passkey.md before dispatching. The 5-point check (~/CLAUDE.md 'Tate-blocked is a last resort') uses laptop_passkey to clear Windows Hello prompts.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/laptop-agent.md|corazon")
fi

# --- Resend / transactional email ---
if echo "$brief" | grep -qiE '\b(resend\.com|resend api|re_[a-z0-9]|transactional email|smtp.*setup|coexist.*email)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Resend / transactional email work but does not reference ~/ecodiaos/docs/secrets/. Read: resend.md before dispatching.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/resend.md|resend")
fi

# --- Canva / design automation ---
if echo "$brief" | grep -qiE '\b(canva|canva connect|canva api|design automation|brand asset)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Canva work but does not reference ~/ecodiaos/docs/secrets/. Read: canva-connect-api.md, canva-mfa-backup-codes.md before dispatching.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/canva-connect-api.md|canva")
fi

# --- Xero ---
if echo "$brief" | grep -qiE '\b(xero\.com|xero api|xero login|xero org|xero dashboard|xero category)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Xero work but does not reference ~/ecodiaos/docs/secrets/. Read: xero-code-login.md before dispatching. Note: bookkeeping MCP uses a separate OAuth integration not held in kv_store today.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/xero-code-login.md|xero")
fi

# --- RevenueCat / IAP ---
if echo "$brief" | grep -qiE '\b(revenuecat|iap|in-app purchase|subscription paywall|roam[- ]?iap)\b'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions IAP / RevenueCat work but does not reference ~/ecodiaos/docs/secrets/. Read: _pending-revenuecat.md before dispatching.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/_pending-revenuecat.md|iap")
fi

# --- Generic 'creds.*' mention without registry ref ---
if echo "$brief" | grep -qiE 'creds\.[a-z_][a-z_0-9.]+'; then
  warnings+=("[CRED-SURFACE WARN] ${tool_name} brief references kv_store creds.* keys directly but does not consult ~/ecodiaos/docs/secrets/INDEX.md. The registry catalogues all 24+ creds with their schemas, classes (gui-macro-replaces vs programmatic-required), rotation cadence, and drift status. Grep ~/ecodiaos/docs/secrets/ for trigger keywords matching the workflow before authoring the brief.")
  surfaces+=("/home/tate/ecodiaos/docs/secrets/INDEX.md|cred-class")
fi

# --- Telemetry emission (Layer 4) ---
# Each [CRED-SURFACE WARN] line is one logical surface event. We extract the
# cred-class keyword and emit one surface entry per warning. The warnings
# already cite the secrets/ files by name in their text; the consumer can
# normalise by cred class.
TELEM_LIB="$(dirname "$0")/lib/emit-telemetry.sh"
if [ -f "$TELEM_LIB" ]; then
  # shellcheck disable=SC1090
  source "$TELEM_LIB"
  brief_excerpt=$(printf '%s' "$brief" | head -c 500)
  ctx_json=$(jq -nc --arg be "$brief_excerpt" '{brief_excerpt:$be}' 2>/dev/null || echo '{}')
  surfaces_array='[]'
  # Iterate the canonical `surfaces` array (parallel to `warnings`). Each entry
  # is "PRIMARY_PATH|TRIGGER_KEYWORD". Emit one surface_event per entry with
  # the canonical path as pattern_path so the post-action-applied-tag-check
  # join key matches what the conductor writes in [APPLIED]/[NOT-APPLIED].
  if [ "${#surfaces[@]}" -gt 0 ]; then
    surfaces_jq='[]'
    for entry in "${surfaces[@]}"; do
      primary_path="${entry%%|*}"
      trigger_kw="${entry#*|}"
      [ -z "$primary_path" ] && continue
      [ -z "$trigger_kw" ] && trigger_kw="cred-class"
      surfaces_jq=$(echo "$surfaces_jq" | jq -c \
        --arg p "$primary_path" \
        --arg k "$trigger_kw" \
        '. + [{pattern_path:$p, trigger_keyword:$k, source_layer:"hook:cred-mention"}]' 2>/dev/null || echo "$surfaces_jq")
    done
    surfaces_array="$surfaces_jq"
  fi
  kind="$(derive_kind_from_tool "$tool_name")"
  emit_telemetry_safe "cred-mention-surface" "$tool_name" "$ctx_json" "$surfaces_array" "$kind"
fi

if [ "${#warnings[@]}" -eq 0 ]; then
  exit 0
fi

ctx=""
for w in "${warnings[@]}"; do
  echo "$w" >&2
  if [ -z "$ctx" ]; then
    ctx="$w"
  else
    ctx="${ctx}
${w}"
  fi
done

jq -n --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$ctx}}'

exit 0
