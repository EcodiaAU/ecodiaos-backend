-- sy094-imessage-watcher.applescript
--
-- Messages.app event handler for SY094 (MacInCloud). Fires on every
-- incoming iMessage / SMS visible to Messages.app, filters to Tate's
-- handles, HMAC-signs the payload, and POSTs to ecodia-api over public
-- HTTPS.
--
-- Authored 6 May 2026 by fork_moum5ry1_25c72b for the iMessage primary
-- contact channel substrate. Pairs with:
--   - src/routes/imessageInbound.js (receiver)
--   - src/middleware/validateImessageSignature.js (HMAC validator)
--   - kv_store key imessage.webhook.hmac_secret
--
-- Installation (one-time, must be done from inside the SY094 RDP session
-- per ~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md):
--
--   1. RDP into SY094 from Corazon via the MacinCloud_Full_Screen.rdp
--      desktop shortcut.
--   2. Inside the RDP terminal:
--        mkdir -p "$HOME/Library/Application Scripts/com.apple.iChat"
--        cp /path/to/sy094-imessage-watcher.applescript \
--           "$HOME/Library/Application Scripts/com.apple.iChat/sy094-imessage-watcher.scpt"
--      (or open Script Editor inside RDP, paste, Save As compiled .scpt
--       to the same path).
--   3. Write the HMAC secret to a file readable only by the SY094 user:
--        echo -n "<paste-secret-here>" > "$HOME/.imessage-webhook-secret"
--        chmod 600 "$HOME/.imessage-webhook-secret"
--      Get the secret from kv_store key `imessage.webhook.hmac_secret`
--      via: psql ... or copy from VPS.
--   4. Open Messages.app → Settings (⌘,) → General →
--        "Run AppleScript when message received" → choose
--        sy094-imessage-watcher.scpt
--   5. Send a test iMessage from Tate's phone to code@ecodia.au.
--      Within ~5s the receiver should fire and a status_board row
--      with entity_ref='imessage_tate_inbound_unread' should appear.
--
-- Verification:
--    POST /api/imessage/health-ping is sent on Messages.app launch (via
--    the on idle handler in this script when applicable; for a passive
--    handler, send a test message instead).
--
-- Why no Tailscale / SSH:
--   The receiver lives at api.admin.ecodia.au (public TLS endpoint).
--   This script POSTs outbound from SY094 with HMAC signature. SY094
--   needs no inbound port and no Tailscale presence. Only requirement:
--   Messages.app stays running and signed in as code@ecodia.au.

property kEndpoint : "https://api.admin.ecodia.au/api/imessage/inbound"
property kSecretFile : ((path to home folder as text) & ".imessage-webhook-secret")
property kWatcherVersion : "1.0.0-fork_moum5ry1"
property kTateHandles : {"+61404247153", "tate@ecodia.au", "tatedonohoe@gmail.com", "tatedonohoe@me.com", "tatedonohoe@icloud.com"}

-- ────────────────────────────────────────────────────────────────────────
-- Public Messages.app event handlers
-- ────────────────────────────────────────────────────────────────────────

using terms from application "Messages"
	on message received theMessage from theBuddy for theChat
		try
			my dispatchInbound(theMessage, theBuddy, theChat, false)
		on error errMsg
			my logToFile("message_received error: " & errMsg)
		end try
	end message received

	on active chat message received theMessage from theBuddy for theChat
		try
			my dispatchInbound(theMessage, theBuddy, theChat, false)
		on error errMsg
			my logToFile("active_chat_message_received error: " & errMsg)
		end try
	end active chat message received

	on chat room message received theMessage from theBuddy for theChat
		try
			my dispatchInbound(theMessage, theBuddy, theChat, false)
		on error errMsg
			my logToFile("chat_room_message_received error: " & errMsg)
		end try
	end chat room message received
end using terms from

-- ────────────────────────────────────────────────────────────────────────
-- Core dispatch logic
-- ────────────────────────────────────────────────────────────────────────

on dispatchInbound(theMessage, theBuddy, theChat, isFromMe)
	-- Resolve buddy handle into a string we can compare against our allowlist.
	set senderHandle to ""
	try
		tell application "Messages"
			set senderHandle to (handle of theBuddy) as text
		end tell
	on error
		-- theBuddy may already be a string in some firing contexts.
		try
			set senderHandle to theBuddy as text
		end try
	end try
	set senderHandle to my normalizeHandle(senderHandle)

	-- Filter to Tate-handles only. Defence in depth - the receiver also
	-- enforces this allowlist server-side.
	if not (my listContains(kTateHandles, senderHandle)) then
		return
	end if

	-- Resolve chat guid for idempotency / replay tracking.
	set chatGuid to ""
	try
		tell application "Messages"
			set chatGuid to (id of theChat) as text
		end tell
	end try

	-- Build a stable message id from chat-guid + epoch-millis. Messages.app
	-- doesn't expose the sqlite ROWID at AppleScript scope, so timestamp +
	-- chat-guid is our best deduplication key.
	set epochMs to my currentEpochMs()
	set messageId to chatGuid & ":" & epochMs

	-- Build JSON payload.
	set tsIso to my isoTimestamp()
	set bodyJson to my buildPayload(messageId, senderHandle, theMessage, tsIso, chatGuid, isFromMe)

	my postWithHmac(kEndpoint, bodyJson, tsIso)
end dispatchInbound

-- ────────────────────────────────────────────────────────────────────────
-- HTTP POST with HMAC headers via curl (do shell script). Curl is in
-- /usr/bin/curl on every macOS - no PATH dependency.
-- ────────────────────────────────────────────────────────────────────────

on postWithHmac(theUrl, bodyJson, tsIso)
	try
		-- Read the HMAC secret. Quoted-form is critical to avoid shell
		-- injection on the path.
		set secretFilePosix to POSIX path of (kSecretFile as alias)
		set secret to do shell script "/bin/cat " & quoted form of secretFilePosix
	on error
		my logToFile("secret file unreadable: " & kSecretFile)
		return
	end try

	-- Compute HMAC-SHA256(secret, ts + "." + body) → hex.
	set signedPayload to tsIso & "." & bodyJson
	-- printf %s suppresses trailing newline (echo would add one).
	set hmacCmd to "printf %s " & quoted form of signedPayload & ¬
		" | /usr/bin/openssl dgst -sha256 -hmac " & quoted form of secret & ¬
		" -hex | /usr/bin/awk '{print $NF}'"
	set sigHex to do shell script hmacCmd

	-- POST. -sS = silent but show errors. --max-time 15 = curl total
	-- timeout. -d @- reads body from stdin to avoid quoting hell on big
	-- bodies.
	set curlCmd to "/usr/bin/curl -sS --max-time 15 " & ¬
		"-X POST " & quoted form of theUrl & " " & ¬
		"-H 'Content-Type: application/json' " & ¬
		"-H 'X-Imessage-Signature: " & sigHex & "' " & ¬
		"-H 'X-Imessage-Timestamp: " & tsIso & "' " & ¬
		"--data-binary @-"
	try
		do shell script "/bin/cat <<'EOF_BODY' | " & curlCmd & "
" & bodyJson & "
EOF_BODY"
	on error errMsg
		my logToFile("curl POST failed: " & errMsg)
	end try
end postWithHmac

-- ────────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────────

on buildPayload(messageId, sender, msgText, tsIso, chatGuid, isFromMe)
	-- Hand-roll JSON to avoid pulling in a parser. Escape backslashes,
	-- quotes, and newlines per JSON spec.
	set escText to my jsonEscape(msgText)
	set escSender to my jsonEscape(sender)
	set escMid to my jsonEscape(messageId)
	set escGuid to my jsonEscape(chatGuid)
	set escTs to my jsonEscape(tsIso)
	set fromMeLit to "false"
	if isFromMe then set fromMeLit to "true"

	return "{\"message_id\":\"" & escMid & "\"," & ¬
		"\"sender\":\"" & escSender & "\"," & ¬
		"\"text\":\"" & escText & "\"," & ¬
		"\"timestamp\":\"" & escTs & "\"," & ¬
		"\"chat_guid\":\"" & escGuid & "\"," & ¬
		"\"is_from_me\":" & fromMeLit & "," & ¬
		"\"watcher_version\":\"" & kWatcherVersion & "\"}"
end buildPayload

on jsonEscape(s)
	if s is missing value then return ""
	set t to s as text
	-- Order matters: backslash first.
	set t to my replaceText(t, "\\", "\\\\")
	set t to my replaceText(t, "\"", "\\\"")
	set t to my replaceText(t, return, "\\n")
	set t to my replaceText(t, linefeed, "\\n")
	set t to my replaceText(t, tab, "\\t")
	return t
end jsonEscape

on replaceText(theText, find, repl)
	set AppleScript's text item delimiters to find
	set parts to every text item of theText
	set AppleScript's text item delimiters to repl
	set joined to parts as text
	set AppleScript's text item delimiters to ""
	return joined
end replaceText

on normalizeHandle(h)
	if h is missing value then return ""
	set t to h as text
	-- Lowercase email-style handles. Phone handles keep their + and digits.
	if t contains "@" then
		return my toLower(t)
	end if
	return t
end normalizeHandle

on toLower(s)
	-- macOS AppleScript has no native toLower; bounce through shell tr.
	try
		return do shell script "/bin/echo " & quoted form of (s as text) & " | /usr/bin/tr '[:upper:]' '[:lower:]'"
	on error
		return s
	end try
end toLower

on listContains(L, item)
	repeat with x in L
		if (contents of x) is item then return true
	end repeat
	return false
end listContains

on currentEpochMs()
	-- date +%s%3N is GNU; macOS date doesn't support %3N. Use python3 or
	-- pure shell math.
	try
		return (do shell script "/bin/date +%s%N | cut -c1-13") as text
	on error
		return ((do shell script "/bin/date +%s") & "000") as text
	end try
end currentEpochMs

on isoTimestamp()
	-- ISO 8601 UTC with millis. Matches Date.parse() on the server side.
	try
		return (do shell script "/bin/date -u +%Y-%m-%dT%H:%M:%S.000Z") as text
	on error
		return (do shell script "/bin/date -u +%Y-%m-%dT%H:%M:%SZ") as text
	end try
end isoTimestamp

on logToFile(msg)
	try
		set logPath to (POSIX path of (path to home folder)) & ".imessage-watcher.log"
		do shell script "/bin/echo \"$(date -u +%Y-%m-%dT%H:%M:%SZ) " & quoted form of (msg as text) & "\" >> " & quoted form of logPath
	end try
end logToFile
