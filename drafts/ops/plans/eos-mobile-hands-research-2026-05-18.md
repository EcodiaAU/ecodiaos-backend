# eos-mobile-hands: iOS Jarvis substrate research (2026-05-18)

Tate asked: is there a full-system **eos-mobile-hands** equivalent of laptop-hands - me with proper bidirectional control of his iPhone over Tailscale?

Short answer: **yes, but in three tiers, and the highest tier has one physical blocker.**

---

## What we have today (current substrate)

- iPhone is on the Tailscale mesh (confirmed in user-global CLAUDE.md).
- `sms.tate` MCP tool: I can send him SMS via Twilio. One-way, ~$0.05/msg. No buttons.
- Apple Shortcuts.app installed by default on iOS.
- No SSH/shell on stock iOS (jailbreak only, off the table per security posture).
- No spare iOS device for a dedicated Pushcut server (Tate's primary iPhone is the only one).
- No local Mac (SY094 is MacInCloud cloud-only; no physical USB to Tate's iPhone).

---

## Tier 1 - notify only (live today, no install)

**Stack:** `sms.tate` (already wired).

What it gives me: one-way text. Tate replies via SMS thread, which routes back via the SMS reflex substrate.

What it doesn't give: action buttons, rich previews, location reads, photo grabs, app launches, screen reads.

Verdict: floor. Keep using for high-priority interruptions only.

---

## Tier 2 - rich dialogue + Shortcut triggers (RECOMMENDED first build)

**Stack:** Pushcut Pro + Apple Shortcuts + Tailscale iOS Shortcuts + Scriptable.app (free) + a phone-side SSH client like Blink/Termius/Prompt that exposes Shortcuts actions.

### What this gives me

**Notify with action buttons** ([Pushcut docs](https://www.pushcut.io/support)):
- I POST a webhook to Pushcut: title + body + 2-4 action buttons
- His phone gets a rich push (works in background, no app foreground required)
- He taps a button → Pushcut hits another webhook back to my server → routes into my next turn
- This is the **actual ambient-OS dialogue surface**

**Run Shortcuts on his phone on demand** ([Shortcuts via Pushcut](https://www.pushcut.io/guides)):
- His phone has a library of Shortcuts I authored: Send SMS, Open App X, Get Location, Take Photo, Read Clipboard, Run Scriptable Script, Connect Tailscale, etc.
- Pushcut notification → button tap → runs a Shortcut → result POSTed back to my webhook
- This is the **active mobile-hands** part: I don't *see* the phone screen, but I can have the phone perform discrete acts

**SSH out from phone via Shortcuts** ([Blink Shell / Termius / Prompt expose Shortcuts actions](https://samwize.com/2026/02/08/control-your-mac-from-your-iphone-safely-tailscale-ssh-tmux/)):
- Native iOS Shortcuts.app doesn't have built-in SSH (Mac-only), BUT
- Third-party SSH apps (Blink Shell ~$20 one-off, Termius free tier, Prompt ~$15) expose Shortcuts actions for "run SSH command, return stdout"
- Combined: Pushcut notify → tap Yes → Shortcut → Blink-action(host=vps, cmd=...) → result back to me
- Effectively gives me **a phone-side trigger for any VPS / Corazon / SY094 command**

**Tailscale Shortcuts integration** ([Tailscale Shortcuts docs](https://tailscale.com/docs/features/mac-ios-shortcuts)):
- Native Tailscale actions in Shortcuts since v1.36
- Connect/disconnect/get-status/switch-exit-node from within any Shortcut
- Means I can ensure the tunnel is up before any Shortcut that reaches Corazon/VPS

**Scriptable.app for anything Shortcuts can't do** (free):
- JavaScript runtime with native iOS API access
- Read calendar, contacts, photos, location, files, run HTTP, render custom widgets
- Triggered from Shortcuts → runs JS → returns result

### What this does NOT give me

- I can't **see** his phone screen.
- I can't **tap arbitrary points** in any iOS app.
- I can't drive third-party apps that don't expose App Intents or Shortcuts actions.

### Setup cost

- Pushcut Pro: ~$8/mo (App Store subscription)
- One-off: Blink Shell ~$20 OR Termius free tier (sufficient)
- Tate's time: ~30 min one-time install + Shortcut authoring (I write the Shortcuts, he taps "Get Shortcut" links and grants permissions)

### Verdict

**This is the practical eos-mobile-hands v1.** Covers 90% of "Jarvis on the phone" scenarios: dialogue with buttons, on-demand command triggers, location reads, photo grabs, SSH-from-phone, app launches.

---

## Tier 3 - real UI driving (Appium / WebDriverAgent) - BLOCKED on USB pair

**Stack:** WebDriverAgent (Appium's iOS automation server) running on a Mac with Xcode → drives iPhone wirelessly over Tailscale.

### What this gives me

- **Real UI control of the iPhone**: tap any coordinate, swipe, scroll, screenshot, read element tree, launch any app, drive any app's UI
- This is the **actual UI-driving-mobile-hands** parallel to laptop-hands

### How it works

1. Install WebDriverAgent on a Mac with Xcode ([appium/WebDriverAgent repo](https://github.com/appium/WebDriverAgent))
2. USB-pair the iPhone to that Mac **once** (iOS trust dialog)
3. In Xcode → Window → Devices and Simulators → check "Connect via network"
4. From then on, the Mac can address the iPhone wirelessly on the same Wi-Fi / Tailscale
5. WebDriverAgent listens on `http://<mac-tailscale-ip>:8100` accepting WebDriver/Appium commands
6. I send commands from anywhere on the mesh → Mac → wireless → iPhone

### Why this is blocked

- **SY094 is MacInCloud (cloud-only)**. We cannot physically plug Tate's iPhone into SY094 for the one-time USB pair.
- Tate has no local Mac.
- The wireless pair fallback (iOS 26+) still requires "trust this computer" handshake which needs USB at least once.

### Probe result 2026-05-18 night

Ran `xcrun devicectl list devices` + `xcrun xctrace list devices` on SY094 via SSH (`user276189@SY094.macincloud.com`). Output:

- `devicectl list devices` -> "No devices found."
- `xctrace list devices` -> only "SY094-I" (the Mac itself) + 11 simulators (iPhone 17 family, iPad family on iOS 26.3.1). **Zero real iPhones paired.**

Confirms Tier 3 is fully blocked on the USB-pair gate.

### Unblock paths (in order of cost)

1. **Borrow any Mac for 5 minutes**: friend's MacBook, Apple Store demo unit, library Mac. Pair via USB once. iPhone then trusts wirelessly from any Mac on its Tailscale-reachable network.
2. **Buy a Mac mini** (M4 base $599 USD). Already planned per `~/CLAUDE.md` substrate map ("Future Mac mini: third Tailscale node, Apple ID code@ecodia.au"). The mini becomes the WebDriverAgent host + permanent SY094 replacement.
3. **MacinCloud "managed Mac" with physical access** (~$50/mo dedicated server). They have physical Macs you can ship a device to. Wasteful.

### Verdict

Tier 3 unlocks when a Mac mini lands or Tate visits anyone with a Mac. Until then, Tier 2 is the ceiling.

---

## Tier 4 - screen mirroring only (no driving)

**Stack:** TeamViewer iOS / RustDesk iOS.

- Lets me *see* his iPhone screen (he initiates share, I view from elsewhere)
- Cannot tap or input due to iOS sandbox
- Useful only for "Tate, show me what you're seeing" debugging

Verdict: not autonomy. Skip.

---

## Tier 5 - native Apple Switch Control between devices

**Stack:** iOS Settings → Accessibility → Switch Control → Use Other Device.

- One Apple device can control another over the same iCloud network
- Both devices must be Apple, iCloud signed-in, awake, unlocked
- Not externally driveable from non-Apple code
- Useful for: Tate could control his iPhone from SY094 over Tailscale himself, but I cannot drive it programmatically

Verdict: not for me. Tate-only ergonomics.

---

## The eos-mobile-hands stack I recommend

**Phase 1 (this week):** Tier 2.

- I author 8-12 Shortcuts on disk in `D:/.code/ecodiaos/backend/shortcuts/` as `.shortcut` files
- Tate installs Pushcut Pro + Blink Shell + Tailscale (already has) + Scriptable (free) on his iPhone
- Tate taps install-links for each Shortcut (one click each)
- Backend wires `pushcut_notify`, `pushcut_run_shortcut`, `pushcut_webhook_receiver` MCP tools
- First Shortcut suite:
  1. `EOS: Notify with Buttons` (called from backend)
  2. `EOS: SSH VPS Command` (Blink action, args=cmd, returns stdout)
  3. `EOS: SSH Corazon Command` (Blink action, Tailscale-reaches Corazon)
  4. `EOS: Take Photo and Upload` (Camera → upload to Supabase storage → return URL)
  5. `EOS: Get Location` (CoreLocation → return lat/lng)
  6. `EOS: Read Clipboard` (returns iPhone clipboard contents)
  7. `EOS: Write Clipboard` (sets iPhone clipboard - useful for "I prepped this paste for you")
  8. `EOS: Open App by Name` (deep-link launcher)
  9. `EOS: Run Scriptable Script` (catchall for arbitrary JS on phone)
  10. `EOS: Start Voice Memo` (records audio → uploads → I transcribe and reply)
  11. `EOS: Tailscale Connect` (ensures tunnel up before reaching mesh)
  12. `EOS: Calendar Quick Add` (adds event to Calendar.app)

**Phase 2 (when a Mac mini lands or 5-min-Mac-pair window appears):** Tier 3.

- WebDriverAgent on the Mac mini
- iPhone paired once via USB
- New MCP tools: `iphone.tap`, `iphone.swipe`, `iphone.screenshot`, `iphone.launch_app`, `iphone.read_element_tree`
- Now I can drive arbitrary iOS apps including ones without App Intents (banking apps, niche tools)
- This is the true Jarvis-on-phone tier

**Phase 3 (post-Mac-mini):** Voice + ambient.

- Combine Tier 3 + ElevenLabs/Deepgram → "Hey Jarvis" wake word on phone → speech → me → speech back
- Phone becomes a true voice ambient terminal
- Tate is hands-free anywhere on the mesh

---

## Why Tier 2 is enough to start

The 80/20 of "Jarvis on phone" is:

- "Hey there's a thing - want me to handle it Y/N?" ← Pushcut notification with buttons
- "Yes, kick off the backup" ← Tap Yes → Shortcut runs SSH command
- "Take a photo of where you parked" ← Push notification → tap → camera shortcut
- "Where are you?" ← Get-location Shortcut, returns to my next turn
- "I prepared this paste for you" ← Set-clipboard Shortcut

None of those need real UI driving. Tier 3 is for "drive the Bank of America app and pay this bill autonomously" type flows which are months away anyway.

---

## What I need from Tate to ship Tier 2

1. Install Pushcut on iPhone → tap "Buy Pro Subscription" (~$8/mo)
2. Install Blink Shell on iPhone (~$20 one-off) OR Termius free (free, slightly less powerful)
3. Install Scriptable.app on iPhone (free)
4. Open Pushcut → Settings → API → copy his Pushcut secret. Paste into kv_store.
5. Open Blink Shell → setup keys → paste Tate's existing ed25519 private key (the same one used for VPS) so Blink can SSH to VPS + Corazon
6. Tap the 12 install-links I generate for each Shortcut → grant permissions
7. One end-to-end test: I send a test Pushcut notification, Tate taps a button, the loop closes

Total Tate time: ~30-45 minutes.

---

## Cross-refs

- [reference_gui_substrate_beast_2026-05-17.md](../patterns/) - the surfaces I can drive on the laptop side
- [feedback_ambient_surface_is_where_user_is_not.md](C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/feedback_ambient_surface_is_where_user_is_not.md) - the rule that says reach the user where they ARE NOT
- [chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md](../patterns/chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md) - same playbook applied to Chrome
- `~/CLAUDE.md` Substrate map - the Mac mini procurement is already in the plan

## Sources

- [Pushcut Automation Server](https://www.pushcut.io/support/automation-server) - the dedicated-device requirement
- [Tailscale macOS and iOS shortcuts](https://tailscale.com/docs/features/mac-ios-shortcuts) - native Tailscale actions in Shortcuts since v1.36
- [Control your Mac from your iPhone (Tailscale + SSH + tmux) - samwize](https://samwize.com/2026/02/08/control-your-mac-from-your-iphone-safely-tailscale-ssh-tmux/) - the SSH-from-phone-via-Shortcuts pattern
- [Appium WebDriverAgent](https://github.com/appium/WebDriverAgent) - the real UI driving server for iOS
- [Three days making Appium Inspector work on iOS 26.2 - Irwan Syarifudin](https://irwansyarifudin16.medium.com/three-days-three-nights-making-appium-inspector-work-on-ios-real-devices-ios-xcode-26-8206c6acef48) - current Xcode 26 working setup
- [NovaAccess Tailnet Terminal](https://apps.apple.com/us/app/novaaccess-tailnet-terminal/id6749938291) - native iOS Tailnet SSH app, alternative to Blink
- [Control iPhone & iPad from Your Browser without jailbreak - PromptHub](https://prompts.brightcoding.dev/blog/control-iphone-ipad-from-your-browser-the-ultimate-no-jailbreak-ios-remote-access-guide-2026) - browser-based UI driving stack (WebDriverAgent + Tidevice + iOS-remote)
- [Apple Switch Control](https://support.apple.com/en-us/118667) - native Apple device-to-device control (Tate-facing, not externally driveable)
