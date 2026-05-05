---
triggers: never-ssh-macincloud, ssh-mic-forbidden, macincloud-rdp-only, sy094-rdp-only, sy094-no-ssh, macincloud-canonical-path, mic-ssh-banned, sy094-ssh-banned, mic-fucking-useless, ssh-useless-on-mic, sshpass-sy094, sshpass-macincloud, ssh-user276189, sy094-access, macincloud-access, claude-app-signin-sy094, sy094-gui-task, ios-release-via-rdp, sy094-tcc-grant, gui-aqua-context, screencapture-fail, cliclick-fail, eos-laptop-agent-sy094-context, mic-headless-work, on-mac-agent-sy094
---

> **NOTE — 5 May 2026.** This file's cross-ref to `cowork-is-a-gui-tool-not-a-peer-brain.md` refers to a deprecated pattern. The substantive claim — "Cowork can drive Corazon's RDP-shortcut click" — is superseded by the direct Tailscale laptop-agent path per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. The RDP-first rule itself is fully valid and unchanged; only the substrate reference is historical.

# Never use SSH on MacInCloud SY094 - RDP from Corazon is the only canonical access path

The rule is absolute. Do not use SSH (`sshpass -p ... ssh ... user276189@SY094.macincloud.com`) for any task on SY094. Not for GUI sign-in. Not for "headless" compile work. Not for file CRUD. Not for process inspection. Not for "quick probes". Not for the on-Mac agent. The only canonical access path to SY094 is RDP from Corazon via the `MacinCloud_Full_Screen.rdp` shortcut on Tate's Windows desktop, then operate inside the RDP session (terminal, GUI, agent, all of it inside the RDP).

## Origin

Tate verbatim 5 May 2026 ~10:58 AEST after watching `fork_morvioqh_5b4d0b` run 43 minutes via SSH driving the on-Mac agent and produce zero visible result on his RDP:

> "Holy fuck cunt ive said so many times not to use ssh on MIC. You need to codify that right now. Never use ssh for macincloud... its fucking useless"

This is the third strike on this surface (prior corrections led to the existing `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` and the `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` recipe), but those patterns still permitted SSH for "headless / scripted work". This pattern supersedes that nuance with an absolute rule.

## Why SSH on SY094 is useless

Diagnosed 5 May 2026 10:55 AEST during the failed sign-in attempt:

1. **No GUI Aqua context.** SSH'd shell on SY094 inherits a non-GUI Aqua domain. `launchctl print gui/$(id -u)` returns `Could not print domain: 125: Domain does not support specified action`.
2. **Screen capture fails.** `screencapture -x /tmp/foo.png` returns `could not create image from display 0`. Every screenshot via the agent's `screenshot.screenshot` tool returns 0 bytes.
3. **Input injection fails.** `cliclick` and AppleScript-mediated `System Events` clicks have no Accessibility-permission surface to inject into - macOS TCC silently drops the events. Buttons are never pressed; text is never typed.
4. **`open -a AppName` succeeds-then-fails.** The shell command returns 0; the app dispatches; macOS never attaches a GUI window because the spawning context has no Window Server. App processes appear in `ps aux` briefly then vanish, or run with no visible UI for the user in RDP.
5. **The eos-laptop-agent inherits the same broken context.** SSH-launched `node index.js` listens on port 7456 and `/api/health` returns `ok`, but every screenshot/input/process-launch tool fails the same way. The agent appears alive but is functionally dead. Forks driving via this agent run for 30+ minutes producing no visible work — the worst possible failure mode (looks like progress, ships nothing).
6. **`launchctl asuser 501` to re-attach is denied.** Returns `Operation not permitted`. There is no SSH-side workaround to bridge into the GUI session without sudo, and SSH-side sudo is not granted on MacInCloud.

The iOS release recipe (`~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md`) historically narrated SSH as the path for `xcodebuild`/`altool`/git work. Even there, the safe pattern is to RDP in and run those commands from the in-RDP terminal — same single mental model, no risk of accidentally invoking SSH-side. Treat the iOS recipe's SSH steps as deprecated and re-author them onto the RDP-terminal path on next iOS-release iteration.

## What to do instead - the canonical path

For ANY task on SY094, the access pattern is:

1. **RDP into SY094 from Corazon** via the `MacinCloud_Full_Screen.rdp` shortcut on Tate's Windows desktop (Microsoft RDP, NOT Citrix HTML5, NOT macincloud.com web portal). Procedure verified working 4 May 2026 19:43 AEST per `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`.
2. **Operate from inside the RDP session.** Open the terminal inside the RDP. Run `node`, `xcodebuild`, `git`, `osascript`, anything - all inside the RDP. The agent (`eos-laptop-agent`) MUST also be started from inside the RDP terminal so it inherits the GUI Aqua context. SSH-side agent launches are dead-on-arrival.
3. **Drive GUI tools (Cowork, Computer Use, screenshot/input macros) only after the agent is RDP-spawned and TCC permissions are granted** (Screen Recording + Accessibility for `/opt/homebrew/bin/node` and `/opt/homebrew/bin/cliclick` per status_board row `b2b67296-387c-4f6c-b9d4-8a24a3b28ec7`).
4. **Persist the agent across sessions** by registering a LaunchAgent (`~/Library/LaunchAgents/au.ecodia.eos-laptop-agent.plist`) so RDP disconnect doesn't kill it. Without this, every session needs the agent re-started inside the RDP. Authoring this is a follow-up.

## Operational reflex

Before any SY094-touching action: **am I about to type `sshpass`/`ssh user276189@SY094.macincloud.com`? If yes, stop. Use RDP from Corazon instead.**

Forks dispatched against SY094 must include `[APPLIED] ~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md` and explicitly route the work through Corazon RDP, not SSH.

## What this supersedes

- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` — the "Two canonical access paths" framing where SSH was the headless default. Now: RDP-only is canonical. The forbidden list (macincloud.com web portal, Citrix HTML5, fullscreen Citrix Workspace, third-party VNC) still applies. Update that file or mark it superseded.
- The "How to call" SSH examples in `~/ecodiaos/CLAUDE.md` SY094 section.
- The SSH-driven steps in `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md`. To be re-authored on RDP-terminal path on next iOS-release iteration.
- All fork briefs that include `sshpass -p '...' ssh ... user276189@SY094.macincloud.com`. Reject those at brief-review.

## Forbidden list (unchanged from prior pattern)

- macincloud.com web portal in any browser
- desktop.macincloud.com Citrix HTML5
- Fullscreen Citrix Workspace
- Third-party VNC

These remain forbidden per `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md`. The new rule adds SSH to that forbidden list.

## What's allowed

- RDP via `MacinCloud_Full_Screen.rdp` shortcut on Corazon (Microsoft RDP).
- Inside the RDP session: any local commands, terminal, GUI app, file ops, agent.
- Conductor (or any fork) drives Corazon's screen via `input.*` + `screenshot.screenshot` to operate the RDP shortcut, then drives the SY094 GUI through that RDP session via the on-Mac agent (which must be RDP-spawned to have GUI Aqua context).

## Cross-references

- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` — the canonical entry recipe (verified 23.6s end-to-end; load this every time you go to SY094)
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` — the prior partial-superseded pattern (forbidden web-portal list still applies)
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — needs re-authoring onto RDP-terminal path
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — meta-doctrine for any GUI recipe
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — origin for why this file exists
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — Corazon as peer; RDP via input.* tools is canonical
- `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` — [DEPRECATED] historical reference for Cowork driving Corazon's RDP-shortcut click; superseded by tailscale-macro-replaces-cowork.md
- status_board row `b2b67296-387c-4f6c-b9d4-8a24a3b28ec7` — TCC grant required as separate Tate-action prerequisite
- status_board row `c27c358c-2965-4884-9979-ff2de67b3df7` — Phase 1 sign-in blocked, recipe codified Phase 2

## Anti-patterns

- "I'll just SSH in real quick to check X." No. Open RDP. Probe inside RDP.
- "SSH is fine for non-GUI work." It isn't, even when it appears to work, because it splits the mental model and creates a path of least resistance back to the failure mode. RDP-terminal for everything.
- "The on-Mac agent's `/api/health` returns ok via SSH so the surface works." No. `/api/health` is independent of the GUI Aqua context. Every other tool fails. Health-check is a false positive.
- "Tate granted TCC permissions to user276189 once so SSH'd agent should work." No. TCC permissions don't bridge into the SSH session's non-GUI domain. The grants only function within the GUI session that owns the Window Server.
- "I'll just `open -a Claude` over SSH and screenshot from the agent." Both calls succeed-return on the SSH side and silently fail to materialise in the RDP GUI. This is the exact failure mode that wasted 43 minutes on 5 May 2026.

## Verification on doctrine adoption

After authoring this file:

1. Update `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` with a "SUPERSEDED 5 May 2026" header pointing here.
2. Update `~/ecodiaos/CLAUDE.md` SY094 section to remove the SSH guidance and point at this file as the canonical path.
3. Mark `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` with a "SSH steps deprecated - re-author on RDP-terminal path" banner.
4. Surface this pattern in fork briefs touching SY094 via the standard surfacing protocol; PreToolUse hooks should warn on `sshpass.*ssh.*macincloud` patterns in brief content.
