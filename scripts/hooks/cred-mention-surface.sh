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

# Capture acknowledged surfaces from the ORIGINAL brief BEFORE stripping tag
# lines. When the conductor explicitly tags a secrets/ surface with
# [NOT-APPLIED] or [FALSE-POSITIVE] in the brief, we should NOT re-fire the
# warning later in the same brief on a casual mention of the same vendor noun.
# Builds an alternation regex of basenames that we will use to suppress
# warnings whose primary_path matches an already-acknowledged surface.
#
# Phase C tag-feedback Gap 3 (8 May 2026, fork_moxiyab8_aa35ce):
# without this suppression, the hook re-fires on bare noun mentions
# ("Corazon", "Apple", "Bitbucket") even when the conductor has already
# explicitly tagged the same surface as not-applicable or false-positive.
# Cross-ref: ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md
acked_surfaces_re=""
if echo "$brief" | grep -qE '\[(NOT-APPLIED|FALSE-POSITIVE)\][[:space:]]+'; then
  ack_paths=$(printf '%s' "$brief" \
    | grep -oE '\[(NOT-APPLIED|FALSE-POSITIVE)\][[:space:]]+(~?\/[^[:space:]]+|[^[:space:]]+\.md)' \
    | awk '{print $2}' \
    | sort -u)
  for p in $ack_paths; do
    bn=$(basename "$p")
    [ -z "$bn" ] && continue
    [ "$bn" = ".md" ] && continue
    # Escape regex meta in basenames defensively.
    bn_re=$(printf '%s' "$bn" | sed 's~\.~\\.~g')
    if [ -z "$acked_surfaces_re" ]; then
      acked_surfaces_re="$bn_re"
    else
      acked_surfaces_re="${acked_surfaces_re}|${bn_re}"
    fi
  done
fi

# Helper: returns 0 if the candidate primary_path has already been
# acknowledged (NOT-APPLIED / FALSE-POSITIVE) in the brief. Returns 1 otherwise.
already_acked() {
  local candidate_path="$1"
  [ -z "$acked_surfaces_re" ] && return 1
  local bn
  bn=$(basename "$candidate_path")
  if printf '%s' "$bn" | grep -qE "^(${acked_surfaces_re})$"; then
    return 0
  fi
  return 1
}

# Strip hook-tag lines from the keyword-scan input so the hook never fires on
# its own forcing-function output or on [APPLIED] / [NOT-APPLIED] /
# [FALSE-POSITIVE] tags. See
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
# Phase C Gap 3 (8 May 2026): "rotate APPLE_DEVELOPER_PROGRAM_KEY",
# "asc upload", "altool", "xcrun --apiKey" added as HIGH so the
# brief-asks-for-explicit-credential-mutation form fires reliably.
ios_high=$(count_matches "$brief" '\b(testflight|app store connect|\basc\b|xcodebuild|transporter|altool|fastlane|provisioning profile|signing identity|developer\.apple\.com|appstoreconnect|team_id|p8 file|asc api key|asc upload|xcrun --apiKey|APPLE_[A-Z_]*KEY|APPLE_[A-Z_]*TOKEN|rotate apple|apple developer program)\b')
ios_broad=$(count_matches "$brief" '\b(ios|ipa|code signing)\b')
if [ "$ios_high" -gt 0 ] || [ "$ios_broad" -ge 2 ]; then
  primary="/home/tate/ecodiaos/docs/secrets/apple.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions iOS / ASC / TestFlight work but does not reference ~/ecodiaos/docs/secrets/. Read: apple.md, apple-asc-keys.md, asc-api-fallback.md, macincloud.md before dispatching. The GUI-macro doctrine in ~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md says Apple uploads use the macro path, NOT the API-key path.")
    surfaces+=("$primary|ios")
  fi
fi

# --- Android / Play Console / keystore ---
android_high=$(count_matches "$brief" '\b(play console|google play|keystore|\.jks|aab|fastlane supply|upload key|gradle.*sign|signingConfigs|ANDROID_[A-Z_]*KEY|rotate android)\b')
android_broad=$(count_matches "$brief" '\b(android|coexist[- ]?android|roam[- ]?android)\b')
if [ "$android_high" -gt 0 ] || [ "$android_broad" -ge 2 ]; then
  primary="/home/tate/ecodiaos/docs/secrets/android-keystores.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Android / Play Console work but does not reference ~/ecodiaos/docs/secrets/. Read: _pending-android-keystores.md, _pending-google-play-service-account.md before dispatching. Keystores are PENDING (NEEDS-TATE) and the Play SA is DEMOTED to fallback under the GUI-macro doctrine.")
    surfaces+=("$primary|android")
  fi
fi

# --- Bitbucket / [redacted] / git push to [redacted] ---
# Phase C Gap 3: HIGH = explicit credential context (api token, REST host,
# Atlassian token mention, [redacted] push). BROAD = bare "bitbucket" or
# "[redacted]" mention which only fires when paired (>=2 hits) so casual
# context-mentions don't trip the hook.
bitbucket_high=$(count_matches "$brief" '\b(ATATT[A-Za-z0-9]+|atlassian.*token|api\.bitbucket\.org|[redacted]|bitbucket api token|x-bitbucket-api-token-auth|BITBUCKET_[A-Z_]*KEY|BITBUCKET_[A-Z_]*TOKEN|rotate bitbucket)\b')
bitbucket_broad=$(count_matches "$brief" '\b(bitbucket|[redacted])\b')
if [ "$bitbucket_high" -gt 0 ] || [ "$bitbucket_broad" -ge 2 ]; then
  primary="/home/tate/ecodiaos/docs/secrets/bitbucket.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Bitbucket / [redacted] work but does not reference ~/ecodiaos/docs/secrets/. Read: bitbucket.md before dispatching. Note the two-context auth split (git remote uses x-bitbucket-api-token-auth username; REST API uses code@ecodia.au).")
    surfaces+=("$primary|bitbucket")
  fi
fi

# --- Supabase Management / Edge Function deploy ---
# Already narrowed (specific deploy / token / API patterns; bare "supabase"
# alone never fires). Phase C Gap 3 leaves this group as-is - it is the
# exemplar of the compound-keyword discipline the gap mandates everywhere.
if echo "$brief" | grep -qiE '\b(supabase.*deploy|edge function deploy|npx supabase functions|sbp_|supabase access token|supabase management api|supabase auth|SUPABASE_[A-Z_]*KEY|SUPABASE_[A-Z_]*TOKEN|rotate supabase)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/supabase-access-token.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Supabase Management / Edge Function deploy but does not reference ~/ecodiaos/docs/secrets/. Read: supabase-access-token.md before dispatching.")
    surfaces+=("$primary|supabase")
  fi
fi

# --- Co-Exist Graph API / Microsoft Graph / excel-sync ---
# "Microsoft" alone is too broad (e.g. "Microsoft RDP", "Microsoft Teams"
# desktop app). Phase C Gap 3: drop bare "microsoft" - require Graph API
# context, Entra/Azure AD identity work, or excel-sync flow.
if echo "$brief" | grep -qiE '\b(coexist[- ]?graph|microsoft graph|graph api|entra|azure ad|excel-sync|excel sync|coexistaus\.org|client_secret.*tenant|MS_GRAPH_[A-Z_]*|rotate microsoft graph)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/coexist-graph-api.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Microsoft Graph / Co-Exist excel-sync work but does not reference ~/ecodiaos/docs/secrets/. Read: coexist-graph-api.md, coexist-excel-file.md, coexist-supabase.md before dispatching.")
    surfaces+=("$primary|microsoft-graph")
  fi
fi

# --- MacInCloud / SY094 / Mac SSH ---
# Phase C Gap 3 (9 May 2026): bare "SY094" or "macincloud" alone no longer
# fires - they show up in doctrine cross-refs and pattern files without any
# credential mutation in scope. HIGH = explicit credential context
# (sshpass.*mac, MACINCLOUD_<...>, rotate macincloud, MacInCloud panel auth).
# BROAD = bare host references requiring a second-keyword hit.
mac_high=$(count_matches "$brief" '\b(sshpass.*mac|user276189|MACINCLOUD_[A-Z_]*|rotate macincloud|macincloud password|macincloud panel)\b')
mac_broad=$(count_matches "$brief" '\b(macincloud|sy094|MacInCloud\.com)\b')
if [ "$mac_high" -gt 0 ] || [ "$mac_broad" -ge 2 ]; then
  primary="/home/tate/ecodiaos/docs/secrets/macincloud.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions MacInCloud / SY094 / Mac SSH work but does not reference ~/ecodiaos/docs/secrets/. Read: macincloud.md before dispatching. Note: MacInCloud auto-rotates passwords on certain panel events; if SSH fails with Permission denied, the password is stale.")
    surfaces+=("$primary|macincloud")
  fi
fi

# --- Corazon laptop agent / Tailscale ---
# Phase C Gap 3 (8 May 2026): bare "Corazon" alone no longer fires - it can
# show up in pattern files / doctrine cross-refs without any laptop-agent
# driving in scope. HIGH keywords are the explicit automation surface
# (laptop-agent token / Tailscale IP / specific input/screenshot tool calls
# / passkey rotation / kv_store laptop_agent reads). BROAD requires >=2 hits.
corazon_high=$(count_matches "$brief" '\b(laptop[- ]?agent|tailscale|100\.114\.219\.69|eos-laptop-agent|/api/tool|browser\.enableCDP|screenshot\.screenshot|input\.click|input\.type|input\.shortcut|input\.key|laptop_passkey|CORAZON_[A-Z_]*|rotate corazon)\b')
corazon_broad=$(count_matches "$brief" '\b(corazon|win11|windows 11|windows hello|sy094)\b')
if [ "$corazon_high" -gt 0 ] || [ "$corazon_broad" -ge 2 ]; then
  primary="/home/tate/ecodiaos/docs/secrets/laptop-agent.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Corazon / laptop-agent work but does not reference ~/ecodiaos/docs/secrets/. Read: laptop-agent.md, laptop-passkey.md before dispatching. The 5-point check (~/CLAUDE.md 'Tate-blocked is a last resort') uses laptop_passkey to clear Windows Hello prompts.")
    surfaces+=("$primary|corazon")
  fi
fi

# --- Resend / transactional email ---
if echo "$brief" | grep -qiE '\b(resend\.com|resend api|re_[a-z0-9]|transactional email|smtp.*setup|coexist.*email|RESEND_[A-Z_]*KEY|rotate resend)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/resend.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Resend / transactional email work but does not reference ~/ecodiaos/docs/secrets/. Read: resend.md before dispatching.")
    surfaces+=("$primary|resend")
  fi
fi

# --- Canva / design automation ---
if echo "$brief" | grep -qiE '\b(canva|canva connect|canva api|design automation|brand asset|CANVA_[A-Z_]*|rotate canva)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/canva-connect-api.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Canva work but does not reference ~/ecodiaos/docs/secrets/. Read: canva-connect-api.md, canva-mfa-backup-codes.md before dispatching.")
    surfaces+=("$primary|canva")
  fi
fi

# --- Xero ---
if echo "$brief" | grep -qiE '\b(xero\.com|xero api|xero login|xero org|xero dashboard|xero category|XERO_[A-Z_]*|rotate xero)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/xero-code-login.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions Xero work but does not reference ~/ecodiaos/docs/secrets/. Read: xero-code-login.md before dispatching. Note: bookkeeping MCP uses a separate OAuth integration not held in kv_store today.")
    surfaces+=("$primary|xero")
  fi
fi

# --- RevenueCat / IAP ---
if echo "$brief" | grep -qiE '\b(revenuecat|in-app purchase|subscription paywall|roam[- ]?iap|REVENUECAT_[A-Z_]*|rotate revenuecat)\b'; then
  primary="/home/tate/ecodiaos/docs/secrets/_pending-revenuecat.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief mentions IAP / RevenueCat work but does not reference ~/ecodiaos/docs/secrets/. Read: _pending-revenuecat.md before dispatching.")
    surfaces+=("$primary|iap")
  fi
fi

# --- Generic 'creds.*' or 'kv_store.creds.*' mention without registry ref ---
# Phase C Gap 3: explicit kv_store.creds.* path is exactly the brief-spec
# canonical credential-context signal. Always fires unless [NOT-APPLIED] /
# [FALSE-POSITIVE] tagged.
if echo "$brief" | grep -qiE '(kv_store\.creds\.|^|[^a-z_])creds\.[a-z_][a-z_0-9.]+'; then
  primary="/home/tate/ecodiaos/docs/secrets/INDEX.md"
  if ! already_acked "$primary"; then
    warnings+=("[CRED-SURFACE WARN] ${tool_name} brief references kv_store creds.* keys directly but does not consult ~/ecodiaos/docs/secrets/INDEX.md. The registry catalogues all 24+ creds with their schemas, classes (gui-macro-replaces vs programmatic-required), rotation cadence, and drift status. Grep ~/ecodiaos/docs/secrets/ for trigger keywords matching the workflow before authoring the brief.")
    surfaces+=("$primary|cred-class")
  fi
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
