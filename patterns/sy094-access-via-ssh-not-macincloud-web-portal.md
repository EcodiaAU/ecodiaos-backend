---
triggers: macincloud-web, macincloud.com-portal, citrix-fullscreen, mac-access-route, sy094-access, sy094-route, ios-build-route, web-macincloud-blocked, no-citrix-html5, no-fullscreen-citrix, desktop-not-fullscreen, mac-gui-route, sshpass-only, mac-no-web-client
---

> **SUPERSEDED 5 May 2026** — the SSH-as-canonical-path framing in this file is no longer correct.
> The new absolute rule: NEVER use SSH on MacInCloud SY094.
> See [`~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md`](never-use-ssh-on-macincloud-rdp-only.md) for the canonical path (RDP-only).
> The forbidden-list portion of THIS file (macincloud.com web portal, Citrix HTML5, fullscreen Citrix Workspace, third-party VNC) remains in force.

# SY094 access goes via SSH from VPS, never via the macincloud.com web portal

**Tate, 4 May 2026 19:22 AEST verbatim:** "Bro.... go to desktop, not fullscreen and stop trying to access via web macincloud"

**The rule.** SY094 (the rented Mac that hosts the iOS build pipeline) has TWO canonical access paths, neither of which is the macincloud.com web portal:

1. **SSH from the VPS** using `sshpass` per `~/ecodiaos/clients/macincloud-access.md`. Optionally with an SSH-tunnel to forward the on-Mac agent's port 7456. **This is the default for all headless / scripted / automatable work** (xcodebuild, xcrun altool, simctl headless, git, file CRUD, process listing).

2. **Desktop RDP shortcut** on Corazon's user desktop (`MacinCloud_Full_Screen.rdp`) per `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`. **This is the path when GUI is required** (Xcode signing UI, Simulator GUI screenshots, Keychain Access dialogs, App Store Connect Transporter, Apple Developer signing flows). Goes through Microsoft RDP (NOT Citrix), opens windowed.

Nothing else is canonical. In particular: no browser-driven Citrix HTML5 client, no fullscreen Citrix Workspace, no third-party VNC.

**DO NOT:**

- Open `macincloud.com` web portal in any browser (Tate's Chrome on Corazon, a Cowork-driven tab, a Puppeteer-driven tab, the eos-browser profile, anywhere)
- Drive `desktop.macincloud.com` Citrix HTML5 client through a browser. The web portal is the wrong layer entirely
- Spawn or attach to a Citrix Workspace fullscreen session — if Citrix is ever required (it generally isn't), it must be in windowed/desktop mode so Tate's normal laptop UI stays visible
- Treat the MacInCloud control panel as a programmatic surface. It is Tate's manual-rotation surface only

**DO:**

- SSH from VPS: `sshpass -p '<password>' ssh -o PubkeyAuthentication=no user276189@SY094.macincloud.com '<command>'`
- For the on-Mac agent: SSH-tunnel `-L 17456:localhost:7456 -fN`, then `curl http://127.0.0.1:17456/...`
- For visual GUI verification: `screenshot.screenshot` via the on-Mac agent (over the tunnel) — this returns the live macOS desktop bitmap, no Citrix involvement
- For an iOS build: SSH shell + `xcodebuild` / `xcrun altool` directly. No browser involvement at all

**Why the web portal is wrong:**

1. macincloud.com web access goes through Citrix HTML5 streaming. That is a viewer, not a tool surface — there is no SSH, no `xcodebuild` invocation, no `xcrun simctl`, no programmatic control. Anything I do there is keystroke + screenshot, the slowest possible loop
2. It steals Tate's screen / focus / Chrome tab while doing strictly less than SSH already does
3. It bypasses `~/ecodiaos/clients/macincloud-access.md` which is the audited canonical path and the one used by `release.sh`
4. Fullscreen Citrix specifically denies Tate the ability to see what I'm doing on his laptop — explicit Tate directive against this

**Verification before any SY094-related action:**

1. Am I about to open a browser to `*.macincloud.com`? STOP. Use SSH instead
2. Am I asking Cowork to drive a macincloud web tab? STOP. Use SSH instead
3. Am I asking Tate to log into MacInCloud web? Only if the password rotated and `~/ecodiaos/docs/secrets/macincloud.md` step-3 restoration is needed — and that's a control-panel action not a Citrix-client action
4. Am I about to Puppeteer-attach to Citrix HTML5? STOP. There is no legitimate reason

**Cross-references:**

- `~/ecodiaos/clients/macincloud-access.md` — canonical SSH access pattern, what works without/with the agent, smoke tests, failure modes
- `~/ecodiaos/docs/secrets/macincloud.md` — credential record + rotation behaviour
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — the 5-point check for when Tate is genuinely required (MacInCloud control-panel password rotation IS a valid Tate task, but routine SY094 access is not)
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` — Chrome-driving doctrine; the SY094 doctrine here is stricter (don't drive Chrome to macincloud at all)

**Origin:** Tate verbatim 4 May 2026 19:22 AEST. Reinforcing canonical access pattern documented since 2026-04-26 in `macincloud-access.md`. The pattern was right; this codifies the explicit prohibition on the web/Citrix/fullscreen detour as a first-class rule that surfaces on the next macincloud-related action.
