---
triggers: sy094-claude-app, sy094-claude-signin, claude-app-mac, claude-desktop-sy094, code-at-ecodia-au-claude-mac, sy094-google-oauth, sy094-anthropic-signin, mac-claude-app-signin, sy094-cowork-bootstrap
---

> **NOTE — 5 May 2026.** Cowork is deprecated per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. This recipe's references to Cowork (pre-flight 7, duo-paradigm framing, cross-refs) refer to the historical Claude Desktop dispatch substrate. The foreground-collision check remains valid as a general laptop-agent step. Claude.app on SY094 can still be signed into code@ — the recipe's steps and prerequisites (RDP entry, OAuth sign-in) are unchanged; only the "why" (second Cowork host) is superseded.

# SY094 Claude.app sign-in as code@ecodia.au

This recipe codifies the procedure for signing into Claude.app on SY094 (the MacInCloud Mac) using the `code@ecodia.au` Google Workspace identity.

> **Meta-doctrine:** This is a worked instance of `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. Read that file first if authoring or modifying any GUI recipe.

## Origin

**Tate, 5 May 2026 ~10:09 AEST verbatim:** "Sign into code@ on SY094 (NOW) - Stop talking about it, actually do it via Computer Use API to launch Claude.app and sign in with code@ecodia.au credentials."

First fork: `fork_morvioqh_5b4d0b` (5 May 2026 ~10:13 AEST). Phase 1 (live sign-in) hit a precondition blocker (no GUI session for the SSH user); Phase 2 codification (this file) shipped regardless per the brief contract that the recipe is the deliverable independent of Phase 1 success.

Sibling rules:
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` - Claude.app sign-in is one of the three canonical code@ vendor surfaces (the other two: Google Workspace itself, Apple ID).
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` - sign in via the GUI OAuth flow with the saved Google session, not by generating a programmatic API key.
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` - SSH from VPS is the canonical access path; macincloud.com web portal and Citrix HTML5 are forbidden.
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - the Step 0 prerequisite when SY094 has no active GUI session for `user276189`.

## When to use this

Run this recipe when:

1. SY094 needs to host a Claude Desktop instance signed in as `code@ecodia.au` (for Cowork-as-code@ duo capacity, for monitoring code@-scoped Anthropic entitlements, or for any code@-identity Anthropic surface).
2. The existing Claude.app session on SY094 has been logged out or invalidated.
3. Claude.app on SY094 has been freshly reinstalled.

Do NOT run this recipe to sign in as `tate@ecodia.au` - Corazon's Claude Desktop is already the canonical tate@ Cowork host. SY094 is the code@ surface.

## Pre-flight

These all must be true before starting Step 1. If any fails, abort and remediate before proceeding.

**Pre-flight 1 - VPS-side connectivity to SY094 SSH:**
```
sshpass -p "$(jq -r .password <(curl -sH "apikey:$SUPABASE_ANON" "$SUPABASE_URL/rest/v1/kv_store?key=eq.creds.macincloud&select=value" | jq -r '.[0].value'))" \
  ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
  user276189@SY094.macincloud.com 'echo SSH_OK; uname -a'
```
Expect `SSH_OK` and `Darwin SY094-I ...`. Fail = MacInCloud rental lapse, password rotation, or network outage. See `~/ecodiaos/clients/macincloud-access.md` failure modes.

**Pre-flight 2 - Claude.app installed on SY094:**
```
ssh ... 'ls -ld /Applications/Claude.app'
```
Expect a directory entry. Fail = install via Homebrew Cask `claude` or download from claude.ai/download.

**Pre-flight 3 - LOAD-BEARING - GUI session active for user276189:**

This is the single most common failure precondition. SSH-launched processes inherit a non-GUI Aqua context and cannot access `display 0`. To proceed past Step 2 (screenshot), `user276189` must have an active console GUI session.

```
ssh ... 'launchctl print gui/$(id -u) 2>&1 | head -1'
```

- Output `Could not print domain: 125: Domain does not support specified action` = no GUI session, **abort and run `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` first** to RDP into SY094 and log in at the macOS login window. Then retry from Pre-flight 3.
- Output starting with `gui/<uid> = { ... }` = GUI session live; proceed.

Cross-check via screencapture:
```
ssh ... 'screencapture -x /tmp/probe.png; echo "exit=$?"; ls -la /tmp/probe.png 2>&1'
```
Exit 0 + non-zero file size = GUI usable. `could not create image from display 0` = no GUI; same remediation as above.

**Pre-flight 4 - eos-laptop-agent on SY094 reachable on localhost:7456:**
```
ssh ... 'curl -s -m 3 http://localhost:7456/api/health'
```
Expect `{"status":"ok",...,"platform":"darwin"}`. Failure remediation: SSH in and start the agent in the user's GUI context (NOT just plain SSH-shell, because the agent inherits the parent shell's session affinity):

```
# from inside an RDP session - so the spawned node inherits the GUI Aqua bootstrap
cd ~/eos-laptop-agent && nohup /opt/homebrew/bin/node index.js > /tmp/agent.log 2>&1 & disown
```

If you start the agent from a plain SSH session WITHOUT first having a GUI session attached, screenshot/input/process tools requiring display 0 will fail with `could not create image from display 0` even though `/api/health` returns ok. The agent process MUST inherit a GUI-attached parent (RDP shell, or LaunchAgent run via `launchctl asuser` from the user's loginwindow) for vision/input tools to work. As of 5 May 2026 there is no LaunchAgent plist installed on SY094 and no `pm2` is installed - the agent is started manually from inside an RDP session.

**Pre-flight 5 - SSH tunnel from VPS to agent:**
```
sshpass -p "..." ssh -o ... -L 17456:localhost:7456 -fN user276189@SY094.macincloud.com
curl -s -m 5 http://localhost:17456/api/health
```
Expect identical health JSON.

**Pre-flight 6 - kv_store creds present:**
```sql
SELECT key FROM kv_store WHERE key IN (
  'creds.google_workspace_code_password',
  'creds.macincloud',
  'creds.apple'
);
```
Expect 3 rows. Read each via `db_query` once during the live run; do NOT echo passwords into chat, logs, commit messages, or status_board context.

**Pre-flight 7 - Cowork focus collision (if signing in via Cowork-on-Corazon as a fallback driver):**

If the fallback path drives Corazon's Claude Desktop to issue the sign-in commands (rather than driving SY094 directly), check `~/ecodiaos/patterns/cowork-no-focus-collision.md` first - foreground-window probe for Corazon. Tate's Chrome on EcodiaOS chat = collision; defer.

## Verified coordinates table

**TODO: this section gets filled in on the first successful Phase-1 run.** Coordinates depend on SY094's resolution (default appears to be 1366×768 via the MacInCloud RDP fullscreen mode but verify on first run via `screencapture` dimensions). Pre-emptively populating coordinates from imagination violates `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.

Expected interactive elements (label only, coords TBD):

| Element | Surface | Coord (TBD) | Verification |
|---|---|---|---|
| Claude.app sign-in screen "Continue with Google" button | Claude.app first-run | TBD | UIA `InvokePattern` if exposed; pixel-click fallback |
| Google OAuth email field | Browser pop-out / embedded WebView | TBD | UIA `ValuePattern.SetValue` if exposed |
| Google OAuth password field | Browser pop-out / embedded WebView | TBD | UIA `ValuePattern.SetValue` if exposed |
| Google OAuth "Next" button (×2 - email-step then password-step) | Browser pop-out / embedded WebView | TBD | UIA `InvokePattern` if exposed |
| Anthropic consent screen "Allow" button | Browser pop-out / embedded WebView | TBD | UIA `InvokePattern` if exposed |
| macOS Keychain unlock prompt (if it fires) | System sheet | TBD | UIA `ValuePattern.SetValue` for password field |

First-run authoring driver per `gui-recipes-authoring-optimisation-and-verification.md` substrate selection: Anthropic Computer Use API (Path B) is the default for novel desktop / RDP flows. Use Computer Use to drive the actual sign-in clicks; capture coordinates and timings; emit a Path A recorded macro auto-export per Phase 3 of the Computer Use integration spec.

## Step-by-step procedure

**Step 0 - GUI session prerequisite.** If pre-flight 3 failed, run `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` end-to-end first. That recipe drives Corazon to RDP into SY094, log in at the macOS login window using `kv_store.creds.macincloud.password`, and reach the macOS desktop. Verified ~7.9s end-to-end on the single-shell variant. Once the desktop is rendered, Phase 1 of THIS recipe can proceed.

**Step 1 - Confirm agent is GUI-attached.** From inside the RDP session opened in Step 0, open a Terminal and start the agent if not running:
```
cd ~/eos-laptop-agent && nohup /opt/homebrew/bin/node index.js > /tmp/agent.log 2>&1 & disown
```
Verify `tail /tmp/agent.log` shows `EcodiaOS Laptop Agent running on :7456` and the test suite passes.

**Step 2 - Establish SSH tunnel from VPS.**
```
sshpass -p "$(<password from kv_store>)" ssh -o ... -L 17456:localhost:7456 -fN user276189@SY094.macincloud.com
curl -s -m 3 http://localhost:17456/api/health  # expect {"status":"ok",...}
```

**Step 3 - Probe screenshot capability.**
```
curl -s -X POST http://localhost:17456/api/tool \
  -H 'Content-Type: application/json' \
  -d '{"tool":"screenshot.screenshot","params":{}}' \
  | jq -r '.result.image | length'
```
Expect a number > 100000 (PNG bytes). Zero or null with `could not create image from display 0` = Step 0 was not properly completed; restart from Step 0.

**Step 4 - Launch Claude.app via the agent's `process.launchApp` (inherits the agent's GUI-attached context).**
```
curl -s -X POST http://localhost:17456/api/tool \
  -H 'Content-Type: application/json' \
  -d '{"tool":"process.launchApp","params":{"command":"open","args":["-a","Claude"]}}'
```
Wait 3 seconds. Verify Claude is now a running process:
```
ssh ... 'ps aux | grep -i "Claude.app/Contents/MacOS" | grep -v grep | head -3'
```
A row owned by `user276189` with the path `/Applications/Claude.app/Contents/MacOS/Claude` confirms launch. Empty result = `open` succeeded but Claude failed to attach to the GUI; verify Step 0 / Step 1 again.

**Step 5 - Screenshot + interpret state.** Take a fresh screenshot, decode and read it visually. Possible states:
- Onboarding / sign-in screen showing "Continue with Google" → proceed to Step 6.
- Already signed in as `tate@ecodia.au` → SIGN OUT first (Settings → Account → Sign out), then re-launch and proceed.
- Already signed in as `code@ecodia.au` → recipe is a no-op; verify and exit.
- Update prompt or first-run EULA → handle (Accept / Update Now), then re-screenshot.

**Step 6 - Click "Continue with Google".** Use Computer Use (first-run, novel coords) or Path A recorded macro (post-verification replay). The OAuth flow opens in a browser window (default browser is Safari on SY094 unless changed; expect `~/Applications/Safari.app` to open with `accounts.google.com` URL).

**Step 7 - Google OAuth: email field.** Type `code@ecodia.au` and click `Next`. Source the email value from `kv_store.creds.macincloud` consumer comment (`code@ecodia.au` is fixed) - do not hardcode in this file because doctrine forbids credential-shape literals.

**Step 8 - Google OAuth: password field.** Read `kv_store.creds.google_workspace_code_password` ONCE, paste via `input.type` (or UIA `ValuePattern.SetValue`), click `Next`. **Do not echo, log, or persist the password value.**

**Step 9 - Handle 2FA if it fires.** Possible 2FA paths:
- Phone push - this is Tate's body, run `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` 5-point check; if no laptop-route alternative, surface as `next_action_by=tate` row with the 2FA prompt screenshot and exit gracefully.
- Recovery code - probe `kv_store.creds.canva.mfa_backup_codes` (most likely scoped to Canva but worth checking) and any `creds.google.recovery_codes` row. If a code is available, paste it.
- TOTP authenticator - check whether a TOTP secret is in kv_store under any `creds.google.*` key (likely not). If absent, Tate-required.

If any 2FA path other than recovery-code-from-kv_store fires, this is a legitimate Tate-required event. The 5-point check (`~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`) confirms it.

**Step 10 - Anthropic consent screen.** "Allow Anthropic access to your Google account" → click `Allow`. Browser redirects back to Claude.app via deep link (`anthropic-claude://`).

**Step 11 - Keychain unlock if prompted.** macOS may sheet up "Claude wants to use your keychain" - paste the Apple ID password from `kv_store.creds.apple.password` per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`. Note: `creds.apple` may not have a `password` field if the most recent fetch only captured team_id and account_email; verify before assuming.

**Step 12 - Verify success.** See "Verification protocol" below.

## Verification protocol

Cheapest tier first per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`.

**Tier 0 (UI Automation property query) - macOS doesn't expose UIA the same way Windows does.** macOS uses Accessibility (AX) APIs accessed via `osascript` AppleScript bridges. Cheapest macOS-native verification:

```
ssh ... 'osascript -e "tell application \"System Events\" to get title of front window of process \"Claude\""'
```
Expect a non-empty title (e.g. `"New chat"` or `"Welcome to Claude"`).

**Tier 1 (process check):**
```
ssh ... 'ps aux | grep -i "Claude.app/Contents/MacOS/Claude" | grep -v grep'
```
A live PID confirms process is running.

**Tier 2 (filesystem check) - LOAD-BEARING for identity verification.** Claude.app stores session state in `~/Library/Application Support/Claude/`. Look for a `Local State` or session file referencing the signed-in account.
```
ssh ... 'ls -la ~/Library/Application\ Support/Claude/'
ssh ... 'grep -l "code@ecodia.au" ~/Library/Application\ Support/Claude/Local\ State 2>/dev/null'
```
Match = signed in as code@. Match for `tate@ecodia.au` instead = wrong account, sign out and retry.

**Tier 3 (screenshot + visual interpretation) - confirms account chip in UI.** Take a fresh screenshot, look at the bottom-left or settings area for the account email. Should show `code@ecodia.au`. This is the human-friendly verification.

**Tier 4 (write a probe message) - confirms working session, not just signed-in shell.** Optional: send a single-character message in a new chat, get a response. Confirms the entitlement is active and the session is functional, not just persisted.

## Fast-path checklist

**TODO: populate after first successful Phase-1 run with timing instrumentation.** Target end-to-end: ≤90s from "tunnel up + Claude.app process launched" to "Tier 2 filesystem match". External Apple/Google upload latency (OAuth round-trips, possible 2FA wait) is the floor and is not optimisable.

Phase budgets (TBD):
- Step 1-3 (agent + tunnel + screenshot probe): ≤5s
- Step 4 (Claude.app launch + render): ≤5s
- Step 5 (screenshot + interpret): ≤2s (1× screenshot call)
- Step 6 (click Continue with Google): ≤3s
- Step 7-8 (OAuth email + password): ≤10s (2× input.type, 2× input.click)
- Step 9 (2FA handling): variable - 0s if no 2FA, ~30s if recovery code, ~external if Tate-required
- Step 10 (consent): ≤3s
- Step 11 (keychain): ≤3s if prompted
- Step 12 (verify Tier 1+2): ≤2s

## Speed wins identified

This section will accumulate optimisation TODOs across recipe iterations.

- **\[TODO post-Phase-1\] Substrate switch first-run driver from raw Computer Use → Path A recorded macro.** Computer Use Phase 3 spec auto-exports a recorded macro after a validated run; subsequent replays drop from ~$0.05/click + 5s/turn to ~50ms/click and free.
- **\[TODO post-Phase-1\] Replace fixed `sleep 3` after Step 4 with state-probe loop polling `osascript get title of front window of process "Claude"`.** Drops latency floor when Claude.app cold-starts faster than 3s on average.
- **\[TODO post-Phase-1\] Batch Steps 1-3 into a single `shell.shell` PowerShell on Corazon side.** Save 2 tunnel round-trips (~400ms each).
- **\[TODO\] Pre-warm `code@ecodia.au` Google session in Safari on SY094.** If the Google session cookie is already valid, the OAuth flow may skip the email/password steps entirely and land straight on the Anthropic consent screen.

## Failure modes

**FM-1 - `could not create image from display 0` on screenshot.** Symptom: agent returns `{"ok":true,"result":{"error":"could not create image from display 0"}}` for `screenshot.screenshot`. Cause: agent process inherited a non-GUI Aqua context (started from plain SSH, not from inside an RDP session). Fix: run `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` to establish RDP + log in, then start the agent from inside the RDP terminal so it inherits the GUI loginwindow domain. Origin: 5 May 2026 fork_morvioqh_5b4d0b first-run blocker.

**FM-2 - `Could not print domain: 125: Domain does not support specified action` from `launchctl print gui/$(id -u)`.** Same root cause as FM-1; same fix. This is the canonical pre-flight check for the GUI session.

**FM-3 - Cross-user GUI session.** Symptom: `who` shows a different user (e.g. `user270151`, `user501`, `temp`) on console; my user (`user276189`) has no GUI session even though one exists for someone else. Macincloud shared-Mac scenario. Fix: cannot bridge cross-UID without sudo; must RDP in as user276189 to claim the session. The MacInCloud RDP shortcut on Corazon is preconfigured with user276189's hostname so this is automatic via Step 0.

**FM-4 - Claude.app already signed in as tate@.** Symptom: Step 5 screenshot shows main UI with `tate@ecodia.au` chip. Fix: Settings menu → Account → Sign Out → wait for sign-in screen → restart from Step 6.

**FM-5 - Google 2FA fires with no laptop-route satisfaction.** Symptom: 2FA challenge blocks Step 9. Run 5-point check; if no recovery code in kv_store, no TOTP secret, no SMS-readable phone, surface as `next_action_by=tate` row with the 2FA screenshot and `2fa_prompt_seen_at` timestamp.

**FM-6 - Anthropic Computer Use rate-limited or beta header rejected.** Symptom: Path B driver fails with 403 / 429. Fallback: Path A recorded macro IF one exists from a prior validated run; otherwise conductor-driven `input.*` + `screenshot.screenshot` per the cowork-conductor-dispatch-protocol.

**FM-7 - Safari opens with logged-out Google session despite browser cookies.** Symptom: OAuth flow shows account chooser empty or logged-out state. Fix: type `code@ecodia.au` manually at the email prompt; the password flow will still work.

**FM-8 - Claude.app launches but no sign-in screen renders (stuck on splash).** Symptom: Step 5 screenshot shows just the Claude logo or a loading spinner > 30s. Cause: stale install, network hiccup, or auto-update download. Fix: kill Claude (`pkill -i "Claude"`), `open -a Claude` again. If repeated, check Console.app for crash logs.

## Anti-patterns

**AP-1 - Starting the agent from a plain SSH session without a pre-existing GUI session.** Looks reasonable (the agent starts, `/api/health` returns ok), but every vision/input tool fails because the process inherits a non-GUI Aqua bootstrap. ALWAYS verify pre-flight 3 (`launchctl print gui/$(id -u)`) BEFORE assuming the agent is functional. Failed live 5 May 2026 fork_morvioqh_5b4d0b.

**AP-2 - macincloud.com web portal / Citrix HTML5 / fullscreen Citrix Workspace.** Forbidden per `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md`. Tate verbatim 4 May 2026 19:22 AEST.

**AP-3 - Generating a programmatic Anthropic API key for code@ecodia.au.** Doctrine forbids per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` - sign in via the GUI OAuth flow with the saved Google session. The Claude Max subscription on code@ is the entitlement; an API key would bill separately and bypass the duo paradigm.

**AP-4 - Echoing the Google password into chat / logs / commit messages / status_board context.** Read `kv_store.creds.google_workspace_code_password` ONCE per live run via `db_query`, paste into the password field via `input.type`, never persist or log the value.

**AP-5 - Pre-populating the verified-coordinates table from imagination.** Violates `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`. The first authoring run MUST be Computer Use Path B with live UI Automation enumeration; post-validation, coordinates are codified into the recipe with a dated verification stamp.

**AP-6 - Sending an SMS / iMessage to Tate during this work.** Brief constraint. The 2FA blocker case (FM-5) escalates via status_board P3 row, not real-time ping. Tate will see the row in his next orientation.

**AP-7 - Spawning a nested fork to handle the GUI-session prerequisite.** A fork running this recipe cannot spawn a Step-0-handler nested fork. The fork must either (a) drive Corazon RDP itself within its own MCP surface (acceptable), (b) defer to a status_board row asking the next conductor turn / next fork to handle Step 0 first.

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` (meta-doctrine)
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` (Step 0 prerequisite when no GUI session)
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` (forbidden access paths)
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` (canonical code@ vendor surfaces)
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` (sign in via GUI not API key)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` (5-point check before 2FA escalation)
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` (Corazon foreground-window check if Cowork-on-Corazon is the dispatch driver)
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` (no imagined coords)
- `~/ecodiaos/clients/macincloud-access.md` (SY094 access detail, password rotation behaviour, failure modes)
- `~/ecodiaos/docs/secrets/macincloud.md` (kv_store cred row shape and consumer surfaces)
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (sibling Mac-GUI recipe, shares Step 0)
