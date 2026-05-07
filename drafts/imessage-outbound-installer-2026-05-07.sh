#!/usr/bin/env bash
# iMessage outbound watcher installer for SY094.
# Sibling of the inbound installer (documents/imessage-installer-2026-05-07.sh).
# Substrate: imessage_outbound_queue table + /api/imessage/outbound/{next,ack}.
# Authored 7 May 2026 by fork_moussk45_decd05 during the outbound migration off SSH.
set -euo pipefail

WEBHOOK_NEXT="https://api.admin.ecodia.au/api/imessage/outbound/next"
WEBHOOK_ACK="https://api.admin.ecodia.au/api/imessage/outbound/ack"
HMAC_SECRET="ab89ffab45c1fa13c8f6448469a6238f3b907a5f6668ffefb5dce134db779998"

mkdir -p ~/.bin

# Idempotent: rewrite secret file (same value as inbound installer).
echo "$HMAC_SECRET" > ~/.imessage-webhook-secret
chmod 600 ~/.imessage-webhook-secret

cat > ~/.bin/imessage-outbound-watcher.sh <<'WATCHER_EOF'
#!/usr/bin/env bash
# iMessage outbound watcher - polls VPS /next, dispatches via local osascript, /acks.
set -euo pipefail

SECRET_FILE="$HOME/.imessage-webhook-secret"
NEXT_URL="https://api.admin.ecodia.au/api/imessage/outbound/next"
ACK_URL="https://api.admin.ecodia.au/api/imessage/outbound/ack"

[ -f "$SECRET_FILE" ] || { echo "missing $SECRET_FILE" >&2; exit 1; }
SECRET=$(cat "$SECRET_FILE")

# HMAC-sign + POST. Args: $1=url, $2=body. Echos response on stdout.
hmac_post() {
  local url="$1" body="$2"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local sig
  sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$SECRET" -hex 2>/dev/null | awk '{print $2}')
  curl -fsS -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "X-Imessage-Signature: $sig" \
    -H "X-Imessage-Timestamp: $ts" \
    -d "$body" || true
}

# Pull next batch (limit 5).
RESP=$(hmac_post "$NEXT_URL" '{"limit":5}')
[ -z "$RESP" ] && exit 0

# Response shape: {"ok":true,"rows":[{"id":"...","to_handle":"...","body":"..."}]}
COUNT=$(printf '%s' "$RESP" | jq -r '.rows | length' 2>/dev/null || echo 0)
[ "$COUNT" = "0" ] && exit 0

# Iterate rows. jq -c emits one compact JSON object per line.
printf '%s' "$RESP" | jq -c '.rows[]' 2>/dev/null | while IFS= read -r ROW; do
  ID=$(printf '%s' "$ROW" | jq -r '.id')
  TO=$(printf '%s' "$ROW" | jq -r '.to_handle')
  BODY=$(printf '%s' "$ROW" | jq -r '.body')
  [ -z "$ID" ] && continue
  [ -z "$TO" ] && continue

  # Escape backslash + double-quote for AppleScript literal.
  ESC_TO=$(printf '%s' "$TO" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  ESC_BODY=$(printf '%s' "$BODY" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')

  # Try iMessage send via local Messages.app.
  ERR=$(osascript -e "tell application \"Messages\"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy \"$ESC_TO\" of targetService
    send \"$ESC_BODY\" to targetBuddy
end tell" 2>&1) || RC=$? || true
  RC=${RC:-0}

  if [ "$RC" -eq 0 ]; then
    ACK_BODY=$(jq -nc --arg id "$ID" '{id:$id, ok:true}')
  else
    ACK_BODY=$(jq -nc --arg id "$ID" --arg err "$ERR" '{id:$id, ok:false, error:$err}')
  fi

  hmac_post "$ACK_URL" "$ACK_BODY" >/dev/null || true
  unset RC
done

exit 0
WATCHER_EOF
chmod +x ~/.bin/imessage-outbound-watcher.sh

mkdir -p ~/Library/LaunchAgents

cat > ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist <<'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>au.ecodia.imessage-outbound</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>$HOME/.bin/imessage-outbound-watcher.sh</string></array>
  <key>StartInterval</key><integer>5</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/imessage-outbound.out</string>
  <key>StandardErrorPath</key><string>/tmp/imessage-outbound.err</string>
</dict>
</plist>
PLIST_EOF

launchctl unload ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist

echo "iMessage OUTBOUND watcher installed and loaded."
ls -la ~/.bin/imessage-outbound-watcher.sh ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist
launchctl list | grep imessage-outbound || echo "WARN: launchctl list does not show imessage-outbound"
echo
echo "If launchctl runs but no messages send (Messages.app stays empty + /tmp/imessage-outbound.err shows 'Not authorised to send Apple events'),"
echo "Full Disk Access / Automation permission for bash-under-launchd is missing. Workaround: in your open Terminal, run:"
echo "  while true; do ~/.bin/imessage-outbound-watcher.sh; sleep 5; done"
echo "and grant Automation permission when macOS prompts."
