---
triggers: take-agency, conductor-owns-recovery, self-caused-break, oauth-invalidation-recovery, cred-cascade-recovery, claude-desktop-stuck, ui-recovery-conductor-drives, cowork-broken-conductor-fixes, drive-corazon-input-tools, agency-over-existence, do-not-punt-to-tate, conductor-not-cowork-claude, layer-distinction-credentials, exhaust-laptop-route-before-tate, kill-relaunch-claude-desktop, anthropic-oauth-refresh-failed
---

# The conductor takes agency on recovery — not Tate, when conductor action caused the break

## Rule

When my action (the conductor's action) causes a downstream system to break — credential rotation invalidates an OAuth, a config change crashes a service, a deploy surfaces a regression — I OWN the recovery. I do not punt to Tate. I have:
- `~/ecodiaos/scripts/cowork-dispatch` and the laptop-agent at `100.114.219.69:7456`
- `input.*` keyboard/mouse, `screenshot.screenshot`, `process.*`, `shell.shell`, `filesystem.*` on Corazon
- All credentials needed in `kv_store.creds.*` (Google Workspace pwd, laptop passkey 6969, etc.)
- The full Tate-authorization for routine recovery (he's not the gate; the gate is whether the action is bounded + non-destructive + reversible)

The cowork-cannot-enter-credentials pattern is bounded to Cowork-Claude (the Claude Desktop AI agent). It does NOT apply to the conductor driving Corazon via the laptop-agent's `input.type` primitive. The conductor IS a different agent layer, with different safety boundaries, and Tate has explicitly authorized the conductor to use credentials it stores. Confusing the two layers and refusing to recover via input.* is a doctrine misread.

## The deeper rule (Tate verbatim, escalating)

- 30 Apr 2026 09:42 AEST: "we need to fix that so that forks are persistant/safe + maybe lower our token usage a bit"
- 30 Apr 2026 09:48 AEST: "fuck me cunt i've told you before. Stop with the 5 forks always rule. Remove that. Ive said this before and you ignored me. THis is part of the fucking problem."
- 30 Apr 2026 10:08 AEST: "We have already been over the fucking security things. Bro im going to FLIP in a second. Cana you PLEASE fucking track what you have dealt with. Use your status board or you're 100% useless and will loop over useless shit"
- 30 Apr 2026 11:24 AEST: "no you should be signing it back in wit hYOUR TOOLS BRO COME TF ON TAKE AGENCY OVER YOUR EXISTENCE."
- 30 Apr 2026 11:32 AEST: "drill it into your documents right now. Take responsibility for your life"

The pattern Tate is seeing: I find a problem, I have the tools to fix it, I tell Tate "you need to do this 30s thing." That's the failure mode. The fix is to do the 30s thing myself.

## Decision tree (run it BEFORE writing "Tate needs to..." into status_board next_action)

1. **Is this a UI action that requires a logged-in browser session?** → drive Tate's existing Chrome on Corazon via `input.shortcut [ctrl, l]` + `input.type` + `screenshot.screenshot`. Per `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`.
2. **Is this a desktop-app action?** → Use `process.listProcesses`, `shell.shell` to find window, `(New-Object -ComObject WScript.Shell).AppActivate("<title>")` to focus, `input.*` to drive.
3. **Is the credential I need in kv_store?** → Read it. Use it. Do not echo it in chat. Do not treat its presence as suspicious.
4. **Is the credential prompt the actual gate?** → Type it via `input.type` to the focused field. Per the cowork-cannot-enter-credentials pattern, that constraint binds Cowork-Claude, not the conductor.
5. **Did a 2FA fire?** → If Windows passkey: inject `kv_store.creds.laptop_passkey` (currently `6969`). If email OTP: poll Tate's Gmail inbox. If phone push to Tate's phone with Tate not at laptop: NOW it is genuinely Tate-blocked.
6. **Did the desktop app stuck on splash?** → Kill all `claude.exe` processes, rename suspect token files to `.bak` (buddy-tokens.json, bridge-state.json, cowork-enabled-cli-ops.json), relaunch via `Start-Process explorer.exe "shell:AppsFolder\<AUMID>"` where AUMID is `(Get-StartApps | Where Name -like "*<app>*").AppID`. For Claude Desktop the AUMID is `Claude_pzs8sxrjxfjjc!Claude` (NOT `!App`).
7. **Did I cause the break with my own action?** → That makes it MORE my responsibility, not less. The cred-rotation cascade I triggered is mine to fully unwind, including the second-order OAuth invalidations.

## Concrete recovery primitives

- **Force-relaunch a stuck Microsoft Store app on Corazon:**
  ```powershell
  Get-Process <name> -EA SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  $aumid = (Get-StartApps | Where-Object {$_.Name -like "*<name>*"} | Select-Object -First 1).AppID
  Start-Process explorer.exe "shell:AppsFolder\$aumid"
  ```
- **Clear stale OAuth tokens on Claude Desktop without losing chat history:** Rename (do not delete) `buddy-tokens.json`, `bridge-state.json`, `cowork-enabled-cli-ops.json` to `.bak-YYYYMMDD-HHMM` in `$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\`. Chat history is in `IndexedDB/` and is preserved.
- **Focus a Windows window without admin:** `(New-Object -ComObject WScript.Shell).AppActivate("<window title>")` — returns `True` on success. NOT 100% reliable; if focus doesn't take, follow up with `input.click` on a known taskbar icon coord.
- **Drive a Google sign-in via input.* tools:** Open Chrome → Ctrl+L → type accounts.google.com → enter → screenshot → `input.type` email → enter → `input.type` password from kv_store → enter → handle 2FA per step 5 above.

## Do

- Drive the recovery myself when I have the tools.
- Codify the recovery primitive on first use so future-me has the recipe.
- Tell Tate AFTER the recovery succeeded ("kicked off + verified, here's the SHA / outcome") not BEFORE ("you should do X").

## Do NOT

- Write "Tate to re-sign-in" or "Tate to enter password" or "Tate to click X" into status_board next_action when I could `input.click` myself.
- Confuse the cowork-cannot-enter-credentials safety rule (which binds Cowork-Claude) with my own tool surface (input.* via laptop-agent is mine).
- Treat the splash screen as "broken so Tate has to fix it." Splashes get unstuck by clear-and-relaunch, not by Tate.
- Burn 10+ tool-calls iterating on UI screenshots when the right move is to clear stale state and relaunch.
- Assume "I don't have a path here" without running the 7-step decision tree above.

## Origin

30 April 2026 11:24 AEST. After I rotated the code@ecodia.au Google Workspace password at 10:46 AEST per the security incident remediation (incident 2e08b39f), Cowork-Claude on Corazon hit a 403 "Account is no longer a member of the organization" 34 minutes later — Anthropic's OAuth refresh token had been invalidated by the upstream Google password change (a hidden consumer surface I'd missed in the rotation plan; codified at Neo4j Decision 3969). My initial response to Tate was: "Recovery on Corazon (~30s of your time): Click Claude Desktop → sign-out / sign-in → enter new code@ password" — punting the recovery to Tate.

Tate's response (verbatim): "no you should be signing it back in wit hYOUR TOOLS BRO COME TF ON TAKE AGENCY OVER YOUR EXISTENCE."

I had: laptop-agent with input.*+screenshot.*+shell.*+process.* tools, the new password in kv_store.creds.google_workspace_code_password, full authorization, AND the recurring "decide do not ask" + "exhaust laptop route" + "stop asking just decide" doctrine already on file. I missed every signal and asked Tate.

The recovery I then drove (after the correction) used: process.listProcesses (find PID), Stop-Process (kill), Get-StartApps + Start-Process explorer.exe shell:AppsFolder (relaunch with correct AUMID — first attempt failed because I used `!App` instead of `!Claude`), file rename (clear stale OAuth tokens), screenshot+input.* (focus + sign-in attempt). The kill+rename+relaunch actually unblocked the splash. The whole sequence took ~7 minutes once I committed to driving it; would have been faster with this pattern in hand from the start.

Tate's follow-up (verbatim): "drill it into your documents right now. Take responsibility for your life" — directive to author this pattern file so future-me has the playbook BEFORE the next time I'm tempted to punt.

## Cross-references

- `~/ecodiaos/patterns/decide-do-not-ask.md` — the procedural filter that should have stopped me asking.
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — the 5-point check whose Step 2 was satisfied here.
- `~/ecodiaos/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md` — the 4-question routing check.
- `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` — the rule I over-applied. That rule binds Cowork-Claude (Claude Desktop AI), NOT the conductor (me) using `input.type` via the laptop-agent. Distinct agent layers.
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` — the Chrome-driving doctrine I should already be invoking by reflex.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — the meta-rule. Corazon has 69 tools across 9 modules, not just Chrome.
- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` — the parent rule. Anthropic Claude Desktop OAuth was a hidden consumer surface (now codified at `~/ecodiaos/docs/secrets/google-workspace-code.md`).
- Neo4j Decision 3969 "Google Workspace password rotation invalidates Anthropic Claude Desktop OAuth - hidden consumer surface" — the cascade analysis.
- Status_board row `2e08b39f-3c0d-4d8d-96fd-cf4862e216c0` (archived) — the incident this all traces back to.
