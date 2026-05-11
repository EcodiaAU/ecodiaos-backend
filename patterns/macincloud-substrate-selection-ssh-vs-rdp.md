---
triggers: never-ssh-macincloud, ssh-mic-forbidden, macincloud-rdp-only, sy094-rdp-only, sy094-no-ssh, macincloud-canonical-path, mic-ssh-banned, sy094-ssh-banned, mic-fucking-useless, ssh-useless-on-mic, sshpass-sy094, sshpass-macincloud, ssh-user276189, sy094-access, macincloud-access, claude-app-signin-sy094, sy094-gui-task, ios-release-via-rdp, sy094-tcc-grant, gui-aqua-context, screencapture-fail, cliclick-fail, eos-laptop-agent-sy094-context, mic-headless-work, on-mac-agent-sy094, ssh sy094, ssh macincloud, sshpass sy094, sshpass macincloud, user276189@sy094, user276189@macincloud, ssh into macincloud, ssh into the mac, ssh into sy094, connect via ssh to macincloud, ssh-vs-rdp, macincloud-substrate-selection, headless-vs-gui-on-mac, remote-build-port, ssh-for-build-scripts, mic-substrate-selection, sy094-substrate-rule, ssh-headless-allowed-mic, mic-remote-build-port, mic-paid-add-on
---

# MacInCloud SY094 substrate selection - SSH for headless, RDP for GUI

Select access substrate by what the work needs, not by blanket rule. SSH is the appropriate substrate for headless work (git, scp, package installs, `xcodebuild` headless, log tail, DB migrations, `launchctl` ops, `defaults write`, scripted tests, file CRUD, killing rogue processes). RDP from Corazon is the appropriate substrate for any GUI-bound work (Xcode IDE, App Store Connect upload UI, screencapture-verified macros, cliclick-driven flows, Android Studio IDE, anything needing the active GUI session).

The original 5 May 2026 absolute SSH ban is superseded as of 7 May 2026: Tate paid the +AU$9/mo "Enable Remote Build Port (SSH)" MacInCloud add-on, authorising SSH as a first-class substrate for headless work. The diagnosis that motivated the original ban was correct - SSH-spawned shells on macOS launchd inherit no Aqua/GUI context - but that diagnosis only forbids SSH for GUI-bound work, not for headless work. The new doctrine reflects that distinction.

## The substrate-selection rule

**Headless work over SSH:**
- Git operations (`git pull`, `git push`, `git status`, `git checkout`, branch management)
- File copy / `scp` to and from SY094
- Package installs (`brew install`, `npm install`, `pod install`)
- Headless `xcodebuild` (CLI archive, `xcrun altool` upload, `xcrun simctl`)
- Log tails (`tail -f /var/log/...`, `tail -f ~/Library/Logs/...`)
- Database migrations / SQL scripts running against local DBs on SY094
- `launchctl load/unload` (no GUI prompts)
- `defaults write` for non-GUI app preferences
- Scripted tests / CI-style runs
- File-content reads/writes (`cat`, `tee`, `sed -i`, `nano`-piped)
- Killing rogue processes (`pkill`, `kill -9`)
- `whoami`, `uname -a`, disk usage probes, network probes

**GUI-bound work over RDP from Corazon (canonical entry per `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`):**
- Xcode IDE work (manual signing, scheme tweaks, asset catalogue edits, Interface Builder, Storyboard editing)
- App Store Connect upload via Xcode Organizer or Transporter UI
- `screencapture` and any verification flow that needs pixels
- `cliclick`-driven flows (Accessibility-permission-bound)
- AppleScript interacting with Safari, or any GUI app via `tell application`
- Android Studio IDE
- Any tool that needs the GUI Aqua context, Window Server, or TCC permission grants

**Hybrid - choose by tool form:**
- iOS upload via `xcrun altool` headless = SSH OK
- iOS upload via Xcode Organizer GUI = RDP
- Pod install via `pod install` CLI = SSH OK
- CocoaPods setup that prompts the GUI keychain = RDP

The rule: if the same tool can run headless from CLI without GUI dependencies, SSH is fine. If the tool's *output* or *interaction* needs the GUI session, RDP.

## Why the original ban existed (5 May 2026)

The 5 May ban (origin: Tate verbatim 10:58 AEST after `fork_morvioqh_5b4d0b` ran 43 minutes via SSH driving the on-Mac agent and produced zero visible result) was correct in its diagnosis but over-corrected on the rule. The diagnosis:

1. **No GUI Aqua context.** SSH'd shell on SY094 inherits a non-GUI Aqua domain. `launchctl print gui/$(id -u)` returns `Could not print domain: 125: Domain does not support specified action`.
2. **Screen capture fails.** `screencapture -x /tmp/foo.png` returns `could not create image from display 0`. Every screenshot via the agent's `screenshot.screenshot` tool returns 0 bytes.
3. **Input injection fails.** `cliclick` and AppleScript-mediated `System Events` clicks have no Accessibility-permission surface to inject into - macOS TCC silently drops the events.
4. **`open -a AppName` succeeds-then-fails.** The shell command returns 0; the app dispatches; macOS never attaches a GUI window because the spawning context has no Window Server.
5. **The eos-laptop-agent inherits the same broken context.** SSH-launched `node index.js` listens on port 7456 and `/api/health` returns `ok`, but every screenshot/input/process-launch tool fails. The agent appears alive but is functionally dead - the worst possible failure mode (looks like progress, ships nothing).
6. **`launchctl asuser 501` to re-attach is denied.** Returns `Operation not permitted`. No SSH-side workaround to bridge into the GUI session.

That diagnosis is unchanged. It only forbids SSH for GUI-bound work. Headless work over SSH was always functionally fine; the absolute ban was a cognitive simplification that traded correctness for cost-of-judgement.

## What changed (7 May 2026)

Tate paid the +AU$9/mo "Enable Remote Build Port (SSH)" MacInCloud add-on at ~11:28 AEST. This authorises SSH access on a paid build port (separate from the standard 22 if MacInCloud assigns a custom port - Tate forwards the port number from the activation email or Server Details panel).

Doctrine updated from absolute-ban to substrate-selection. The diagnostic over-correction is reversed; the diagnostic itself is preserved as the reason GUI-bound work still requires RDP.

## Verification protocol

**Before any SSH-driven work, confirm the tool is genuinely headless** (not GUI-bound). If unclear, default to RDP.

**Smoke probe** (should return cleanly):
```bash
sshpass -p "$MIC_PASS" ssh user276189@SY094.macincloud.com 'whoami; uname -a; pwd'
```

For GUI tools intentionally probed over SSH for diagnostic confirmation: expect failure. The failure confirms substrate-selection rule, not a regression.

**Port note:** until Tate forwards the Remote Build Port number from the activation email or Server Details panel, `kv_store.creds.macincloud.port` remains the default. The `remote_build_port_pending: true` flag in the kv_store row marks this state. Use whatever port the row currently exposes; do not guess.

## Anti-patterns

- Running `screencapture` over SSH to "just check what's on screen". GUI-bound, will fail. Use RDP.
- Running `cliclick` over SSH to drive a GUI flow. TCC drops the events. Use RDP.
- AppleScript GUI calls (`tell application "Messages" to send`, `tell application "System Events" to click`) over SSH. No Window Server. Use RDP.
- Xcode IDE work over SSH (Interface Builder, asset catalogue, scheme editor). GUI-bound. Use RDP.
- Android Studio IDE over SSH. GUI-bound. Use RDP.
- App Store Connect upload via Xcode Organizer over SSH. GUI-bound. Use RDP. (Headless `xcrun altool` upload via SSH IS fine.)
- "I'll just SSH in to run a quick build script that opens Xcode at the end." If any leg is GUI, do the whole thing in RDP, or split at the SSH/RDP boundary.

## Failure modes table

| Symptom | Cause | Recovery |
|---|---|---|
| `screencapture -x` returns "could not create image from display 0" | GUI tool over SSH, no Window Server | Switch to RDP via desktop shortcut |
| `cliclick` exits 0 but no click landed | TCC drops events from non-GUI Aqua context | Switch to RDP |
| `osascript -e 'tell app "Messages" to ...'` returns "permission denied" or hangs | AppleScript GUI call from SSH session | Switch to RDP |
| `open -a AppName` succeeds at shell but no window appears | App dispatched but no Window Server attached | Switch to RDP |
| `eos-laptop-agent` `/api/health` returns ok but every screenshot/input tool fails | Agent SSH-launched, inherits broken Aqua context | Restart agent from inside RDP terminal |
| `xcodebuild -archive` works fine | Headless xcodebuild is CLI-only, no GUI dependency | Continue over SSH |
| `git pull` / `git push` / `npm install` work fine | Pure CLI, no GUI dependency | Continue over SSH |

## Cross-references

- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - canonical RDP entry recipe (verified 23.6s end-to-end; load every time you go to SY094 GUI)
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` - prior partial-superseded pattern; forbidden web-portal list still applies
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - iOS release flow; can mix SSH (headless legs) and RDP (Xcode/Organizer legs) per the substrate-selection rule
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - meta-doctrine for any GUI recipe
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - origin reflex for why this update lands in the same window Tate stated it
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon as peer; RDP via input.* tools is canonical for the GUI leg
- `~/ecodiaos/docs/secrets/macincloud.md` - cred row, Remote Build Port note, rotation discipline
- status_board row `b2b67296-387c-4f6c-b9d4-8a24a3b28ec7` - TCC grant required as separate Tate-action prerequisite for the RDP-spawned agent
- status_board row `c27c358c-2965-4884-9979-ff2de67b3df7` - Phase 1 sign-in blocked, recipe codified Phase 2

## Forbidden access paths (unchanged from prior pattern, minus SSH)

- macincloud.com web portal in any browser
- desktop.macincloud.com Citrix HTML5
- Fullscreen Citrix Workspace
- Third-party VNC

These remain forbidden per `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md`. SSH is no longer in this list.

## Operational reflex

Before any SY094-touching action, ask one question: **does this tool need the GUI Aqua context?**

- Yes (GUI app, screen capture, click injection, Window Server) -> RDP from Corazon via desktop shortcut
- No (pure CLI, file ops, build scripts, log tail, git, package install) -> SSH via `sshpass -p "$MIC_PASS" ssh user276189@SY094.macincloud.com '...'`

If unclear, default to RDP. Cost of an unnecessary RDP session is small. Cost of a silently-failing SSH-driven GUI flow is large (43 minutes on 5 May 2026 was the worked example).

## Origin

- 5 May 2026 ~10:58 AEST: original SSH ban authored after the 43-minute SSH-driven agent failure. Diagnosis correct, rule over-corrected.
- 7 May 2026 ~11:28 AEST: Tate paid the +AU$9/mo Remote Build Port add-on, authorising SSH for headless work. Doctrine rewritten as substrate-selection. File renamed `never-use-ssh-on-macincloud-rdp-only.md` -> `macincloud-substrate-selection-ssh-vs-rdp.md` via `git mv` (history preserved). All cross-references audited and updated. Authored by fork `fork_mout709g_543eed`.
