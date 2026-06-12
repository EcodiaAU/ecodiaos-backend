---
title: Cred-exfil defence stack L1+L3+L4+TouchID design proposal
date: 2026-06-12
status: AWAITING_TATE_GREENLIGHT
project: status_board 806bd760-bcf2-455a-a678-23a711889a8e
author: dispatched worker f2fd4866 on Mac
related:
  - [[cred-handoff-no-plaintext-in-chat-2026-06-12]]
  - [[cred-rotation-must-propagate-to-all-consumers]]
  - [[hooks-are-the-epitome-of-learning-prose-without-hook-is-forgotten-2026-06-09]]
---

# Cred-exfil defence stack design

## Pre-flight evidence

- Rotation of `google_workspace_code_password` confirmed at substrate level. kv_store `creds.google_workspace_code_password` updated 2026-06-12T00:44:16Z, new value length 24, last4 `XsGr`. The leaked value `UuIALu120w1K` (12 chars) no longer matches. kv-mirror file mtime 2026-06-12 10:46 AEST, sha differs from any prior shape.
- Step 0 of the brief (rotate-first) is complete. This proposal does NOT block on rotation.
- L2 (this pattern + handoff helper) shipped 2026-06-12 by the originating conductor. Smoke test passed.

## L1 outbound known-value substring gate

### Tools to gate

External comms (high-risk leaf surfaces):
- `mcp__ecodia-comms__gmail_send`, `gmail_create_draft`, `gmail_reply`
- `mcp__ecodia-comms__sms_tate`, `send_sms`, `make_call`
- `mcp__ecodia-comms__drive_create_doc`, `drive_update_doc`, `drive_create_sheet`, `drive_update_sheet`, `drive_append_sheet`, `drive_share_file`
- `mcp__ecodia-comms__contacts_create`, `contacts_update`
- `Bash` containing `curl -X POST|PUT|PATCH` against any non-loopback host. Loopback exemption: `127.0.0.1`, `localhost`, `localhost:7456`, `MacBookPro.lan` on localhost ports.

Substrate writes that later surface elsewhere (medium-risk):
- `mcp__ecodia-core__status_board_upsert` context body
- `mcp__ecodia-core__kv_store_set` with key NOT starting `creds.`
- `mcp__ecodia-core__neo4j_write_episode`, `neo4j_write_decision`
- `mcp__ecodia-core__os_session_message`
- `mcp__ecodia-graph__graph_create_node`, `graph_create_relationship`, `graph_merge_node`

Filesystem writes (medium-risk):
- `Write` to any path NOT under `/Users/ecodia/PRIVATE/`
- `Edit` to any path NOT under `/Users/ecodia/PRIVATE/`. Doctrine (`backend/patterns/*.md`) gated regardless.
- `Bash` containing shell-redirect `>`, `>>`, `tee`, `cp`, `mv` to a target outside `/Users/ecodia/PRIVATE/`.

Out of scope for L1 PreToolUse (handled by Stop-hook L2 detector, separate):
- Assistant final-text chat output (not a tool call, no PreToolUse fires).

### Cred classes to load (taint set)

Walked on hook init, cached at `/tmp/cred-outbound-leak-gate-cache.json` with mtime invalidation:
- `/Users/ecodia/PRIVATE/ecodia-creds/**/*.json` -- recursive jq leaf-extract of string values
- `/Users/ecodia/PRIVATE/ecodia-creds/**/*.env` -- KEY=VALUE parse, value column only
- kv-mirror `/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/*.json` -- already mirrored kv_store creds.*
- Min length 12 (below this, false-positive rate against common slugs explodes)
- Min Shannon entropy 3.0 bits/char (excludes `password123`-shape leaves matching common substrings)
- Exclude any value also present in a git-tracked file (`git -C $REPO grep -F "<val>"` over backend/ + ecodiaos repos) -- protects public test fixtures, README example tokens

Cache shape: `{ sha256(value): {key_path, file, length, last4, entropy} }`. Match by sha256 over rolling substrings of the candidate body. Cache rebuild triggers on any mtime change under `PRIVATE/ecodia-creds/`.

### Allowlist for cred-management surfaces

The gate must not block legitimate rotation, mirror refresh, or handoff:
- `mcp__ecodia-core__kv_store_set` AND key starts with `creds.` -- rotation write path
- `Write` AND path under `/Users/ecodia/PRIVATE/ecodia-creds/` -- kv-mirror refresh, rotation outputs
- `Edit` AND path under `/Users/ecodia/PRIVATE/ecodia-creds/`
- `Bash` AND command matches regex `(?i)cred-handoff\.sh|kv-mirror-refresh\.sh|cred-rotation-[a-z0-9_-]+\.sh` -- known cred scripts (the rotation script writes vendor + kv_store only by L2 doctrine; the mirror refresh runs out-of-band)
- `mcp__ecodia-core__kv_store_get` -- read path, separate L3 concern

### Rotation-path exception window

Problem: after a rotation, the new value WILL surface in the next 1-3 tool calls (rotation-script confirmation print, status_board status flip, neo4j Decision write confirming the rotation). The gate would block these.

Design: a PostToolUse companion `cred-rotation-track.py` watches `kv_store_set` on `creds.*` keys (and writes to PRIVATE/). On fire, it writes `creds.recent_rotation.<key_slug>` to kv_store with value `{old_sha256, new_sha256, rotated_at, allowance_remaining: 3}` and 5-minute TTL.

Inside the window L1 emits a warning + decrements the allowance (counter persisted at `/tmp/cred-rotation-allowance-<sha>.json`), does NOT block. After 3 emissions OR after TTL, full block resumes.

Alternative override: a manual `# cred-rotation-ok` token in the Bash command or tool body. Honoured, logged to substrate-write streak observer. Use when the automatic window fails (e.g. multi-stage cross-account rotation).

### Hit response

Exit code 2 with PreToolUse-block format. Surface body:
```
[CRED-OUTBOUND-LEAK-GATE] tool=<name> match=<key_slug> last4=<last4>
File: <file_path>
This block is L1 of the cred-exfil defence stack. Doctrine: patterns/cred-handoff-no-plaintext-in-chat-2026-06-12.md
```

Side effects:
- Append event to `substrate_write_streak` (existing observer table) for posthoc audit
- Optionally fire `sms_tate` rate-limited to once per hour: "[CRED-LEAK-BLOCKED] <key_slug> attempt via <tool>"

### Open question for Tate

Two policy knobs need a read:

1. **Allowlist scope** -- should `kv_store_set` on creds.* be allowed regardless of substring match, or should it ALSO match the old-value sha to detect "writing the old value back" mistakes? Recommendation: allow regardless (rotation is the only path), but PostToolUse audit logs the write.
2. **Bash curl scope** -- should the gate also intercept GET requests where creds are passed as URL params (e.g. `?api_key=<value>`)? Recommendation: yes, GET is in scope, the rule is "outbound bytes leaving localhost" not "POST-only".

## L3 origin-gate on cred reads

### Read tools to gate

- `Read` on any path starting `/Users/ecodia/PRIVATE/`
- `Bash` containing `cat`, `head`, `tail`, `jq`, `python.*open\(`, `grep`, `awk`, `sed` against any path under `/Users/ecodia/PRIVATE/`
- `mcp__ecodia-core__kv_store_get` with any key starting `creds.`
- `mcp__ecodia-core__patterns_semantic_search` -- skipped pending audit. Doctrine pattern files do NOT carry cred values; if a leak ever reaches a pattern body, fix the leak rather than gate the search.

### Inbound-class tools (taint sources)

Anything that could carry attacker-supplied text into the conversation:
- `mcp__ecodia-comms__gmail_get_message`, `gmail_get_thread`, `gmail_list_messages`
- `mcp__ecodia-comms__email_threads_read`, `mcp__ecodia-core__email_threads_read`
- `mcp__ecodia-core__inbox_read`
- `mcp__ecodia-comms__list_messages` (SMS inbox)
- `WebFetch`, `WebSearch`
- `mcp__ecodia-comms__drive_get_file`, `drive_read_sheet`, `drive_list_folder` (file CONTENT may carry attacker payload)
- `mcp__coord__coord_read_inbox`, `coord_peek_inbox`, `coord_wait_for_inbox` (worker inbox carries dispatcher-routed content from arbitrary upstream)

Excluded (no attacker-supplied free text): `contacts_list`, `contacts_search`, scheduler list ops, status_board_query, neo4j_search, knowledge_lookup (all return EcodiaOS-authored substrate).

### Transcript walk algorithm

```
def is_tainted_read(current_tool_event):
    session_jsonl = current_session_jsonl_path()
    events = load_jsonl(session_jsonl)
    for ev in reversed(events_before(current_tool_event)):
        if ev.role == 'user' and ev.type == 'message':
            return False  # walked back to user prompt without seeing inbound
        if ev.role == 'tool_result' and ev.tool_name in INBOUND_CLASS:
            return True   # inbound result sits between cred read and last user prompt
    return True  # no user prompt found in session (compaction edge or worker boot without brief) -- fail closed
```

### Edge cases

1. **Worker boot** -- dispatched workers have no `user_prompt` in their session jsonl; they have the dispatch brief. The brief is conductor-authored, treat as trusted. Detect: if the session jsonl starts with a `<dispatched ...>` block and no `user_prompt` exists, treat the brief as the user-prompt boundary. Implementation: walk-back terminator is `(role==user) OR (jsonl_start AND brief_present)`.
2. **Legitimate inbound-then-cred read** -- conductor reads an OAuth callback email, then reads the matching refresh token. Override token: include `# cred-read-ok-after-inbound:<one-line-reason>` in the next tool call's command/body field. Hook honours, surfaces to substrate-write streak, requires Tate-confirm via SMS reply Y within 90s.
3. **Compacted history** -- if the walk hits end-of-jsonl before finding a user prompt AND no worker brief is present, treat as tainted. Fail closed.

### Hit response

Block. Same-turn Tate confirm via SMS:
```
[CRED-READ-TAINT] tool=<name> key=<key_slug>
last_inbound=<inbound_tool_name>
Reply Y/N (90s)
```
Hold for confirmation up to 90s; default-deny on timeout.

### Open question for Tate

Should override token be a chat-input directive ("Tate types `cred-read-ok`") OR a tool-body directive (conductor adds `# cred-read-ok-after-inbound`)? Recommendation: tool-body directive, because chat-input directive is exactly what an impersonator can fake.

## L4 OOB SMS confirm for password-class reads only

### Scope -- what counts as password-class

Strict regex match, fail-closed if uncertain:
- jq leaf path matches `(?i)password|passcode|recovery|otp|backup_code|backup-code|2fa|mfa_seed`
- kv_store key name matches same regex
- File basename matches `(?i)password|recovery|backup`

Explicitly OUT of L4 scope (rely on L1+L3 only):
- API keys, bearer tokens, signing keys, OAuth client secrets, refresh tokens, JWTs, vendor PATs

Why narrow: every L4-triggered read costs 30-90s wall-clock plus 1 SMS. Daily-driver ops use bearers / API keys constantly. Reserving L4 for password-class keeps the cost budget tight while still covering the high-impact leak class (the rotated cred was a password).

### SMS template (60 char target, 1 GSM segment)

```
[CRED] read {key_slug:25} from {file:15}? Reply Y/N (5m)
```

Truncation rules: key_slug to first 25 chars (Google_Workspace_code_password -> Google_Workspace_code_pas), file basename to first 15 (google_workspace_code_password.json -> google_workspace).

Single example: `[CRED] read google_workspace_code_pas from google_workspac? Reply Y/N (5m)` -- 73 chars. Trim further if SMS-tate enforcer fails the 1-segment check.

### Confirmation token store

kv_store row:
- Key: `creds.read_confirm_token.<request_id>` (request_id = uuidv4)
- Value: `{request_id, key, file, requested_at, requester_tab, requester_task, status: pending|allowed|denied|expired, expires_at: requested_at+5m}`

Status flips:
- `pending -> allowed` on Tate reply Y/YES (case-insensitive)
- `pending -> denied` on Tate reply N/NO
- `pending -> expired` on TTL hit (cleanup cron, daily)

### Wait shape

The hook fires PreToolUse, blocks until token resolves:
1. Compute request_id, write `creds.read_confirm_token.<request_id>` with status=pending
2. SMS Tate with request_id last 6 chars in body for disambiguation
3. Loop poll `coord_peek_inbox` filtered to SMS-reply class messages every 10s
4. Tate reply matched by id-suffix or by closest unanswered token
5. On status=allowed -> exit 0 (proceed). On denied/expired -> exit 2 (block).
6. Hard cap: 90s wall-clock. After 90s default-deny even if kv_store row still pending.

### Cost trade-off (proposal)

Recommend L4 password-class ONLY. The full cred-set protected by L1+L3 is large (~50 string-leaves across PRIVATE/). The L4-scoped set is small (~5-8 keys: Google workspace passwords, recovery codes, backup codes). Wall-clock impact: zero on 95% of cred ops, 30-90s on the rare password-class read.

### Open question for Tate

Two policy knobs:

1. **L4 scope** -- password-class only (recommended) vs all-password-or-bearer vs all creds. Default-deny on timeout vs default-allow on timeout (recommend default-deny).
2. **Reply disambiguation** -- when 2 L4 SMSes go out within 5 min, how does Tate's reply route? Recommendation: reply must include the 6-char request_id suffix from the original SMS (`Y a7c91f`). If reply is bare Y/N, route to the most recent pending token; if multiple pending, default-deny all and prompt Tate to re-issue with id.

## Touch-ID gate (Tailscale-impersonator full mitigation)

### Threat model

A Tailscale impersonator on Tate's network typing as Tate looks identical to Tate in chat. L3 partially mitigates (no inbound-then-cred-read), L4 partially mitigates (Tate's phone is OOB), but the impersonator can answer SMS too if they have Tate's phone OR if the SMS substrate is also reachable from Tate's compromised account.

Full mitigation needs a hardware-bound check that the local human is Tate. Touch-ID fits.

### Design

- macOS LocalAuthentication policy `kSecAccessControlBiometryCurrentSet` requires the enrolled finger present at decision-time, hardware-attested, not bypassable from a remote session.
- CLI shim `backend/scripts/touchid-prompt.sh` calling a Swift one-liner that exits 0 on success, 1 on fail:
  ```swift
  import LocalAuthentication
  let ctx = LAContext()
  var err: NSError?
  guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else { exit(1) }
  ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                     localizedReason: "EcodiaOS cred-mgmt action") { ok, _ in
    exit(ok ? 0 : 1)
  }
  RunLoop.main.run()
  ```
- Session token: kv_store `auth.touchid_session_token` value `{issued_at, expires_at: issued_at+30m, session_id, tab_id_at_issue}`
- Hook `touchid-cred-gate.py` PreToolUse: on a gated tool call, check token presence and `now < expires_at`. If absent or expired, run the prompt synchronously; on success write token; on fail block AND SMS Tate that an attempted op was declined.

### Tools gated by Touch-ID

- L4-triggering reads (password-class)
- L1 allowlist writes (`kv_store_set` on `creds.*`, `Write` to PRIVATE/ecodia-creds/)
- All credential rotation scripts (Bash matching `cred-rotation-*.sh`)
- `pm2 delete` on production processes, `git push --force`, any `Bash` containing `rm -rf` against PRIVATE/

### Configuration concern

Watch-unlock and auto-unlock-with-Apple-Watch chained to Mac unlock would lower the bar to "Apple Watch is near the Mac" rather than "Tate's finger is on the sensor". For cred-mgmt configure `LAPolicy.deviceOwnerAuthenticationWithBiometrics` not `deviceOwnerAuthentication` -- the biometrics-only variant rejects watch-fallback at the API level.

### Implementation cost and bar

- Swift shim: ~30 min. Test against Touch-ID-enrolled finger on MacBookPro.lan.
- Hook + token store: ~1 hour.
- Total: ~2h dev + 1h test. Recommend tracking as a separate substrate row, not blocking L1/L3/L4 wiring on it.

### Open question for Tate

- Frequency knob: 30 min recommended. 15 min if cred-mgmt activity is rare and Tate accepts the friction; 60 min if cred-mgmt is frequent.
- Watch-fallback acceptance: recommend NO (biometrics-only). Confirm.

## Wiring sequence (after greenlight)

1. L1 `cred-outbound-leak-gate.py` PreToolUse + matcher list + allowlist + rotation-window companion PostToolUse `cred-rotation-track.py`. Smoke test: rotate a throwaway test key, verify gate allows the rotation write and blocks a fabricated outbound substring match.
2. L3 `cred-read-taint-gate.py` PreToolUse + transcript walk + override token honour. Smoke test: read a cred straight after a `user_prompt` (allowed) and straight after a `gmail_get_message` (blocked).
3. L4 `cred-read-sms-confirm.py` PreToolUse on password-class read. Smoke test: kv_store_get on `creds.google_workspace_code_password` should SMS, wait, honour reply.
4. Touch-ID gate (separate followup, not blocking the L1/L3/L4 wire-up).

Each layer adds a `# <layer>-ok` override token honoured with substrate-write-streak logging.

## Substrate-write streak observer

Each block, override-token use, and SMS round-trip emits an event to the `substrate_write_streak` observer table. Daily cron `cred-defence-streak-audit` reads the last 24h: any block without a subsequent legitimate next-step, any override-token use without a status_board context append, any L4 SMS without a Tate reply within 5 min surfaces as a P2 row for next-session triage.

## Decision Tate needs to take

1. **L1 allowlist** -- the cred-management tool list above. Add/remove anything?
2. **L1 rotation window** -- 5 min TTL + 3-allowance auto, vs manual override token only. Recommend auto.
3. **L3 override mechanism** -- tool-body directive (recommended) vs chat-input directive.
4. **L4 scope** -- password-class only (recommended) vs broader.
5. **L4 timeout default** -- deny (recommended) vs allow.
6. **Touch-ID frequency** -- 30 min recommended.
7. **Touch-ID watch-fallback** -- reject (recommended).

On greenlight, wiring sequence above. Each layer ships as a same-turn triad (hook + helper + pattern file) per recursive-improvement doctrine.
