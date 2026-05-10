# iMessage Path Degradation Probe — 2026-05-09 23:05 AEST

Fork: `fork_moyczp7o_1dcf2b`. Health canary: `consecutive_failures: 46` since 2026-05-07T01:18 UTC. Both watchers heartbeats absent.

## Root cause classification (per brief Tasks 2-3)

**Primary:** Class (a) + (b) compound. LaunchAgents unloaded from launchd (`launchctl list | grep ecodia` empty) AND macOS TCC has DENIED AppleEvents permission for `/bin/bash` (auth_value=0, last modified 2026-05-08T03:38:44 UTC) and `com.apple.Terminal` (auth_value=0, 2026-05-07T02:15:09 UTC).

**Secondary:** Class (d). The INBOUND watcher script `~/.bin/imessage-watcher.sh` line 21 has the same HMAC `awk '{print $2}'` bug that was fixed in the OUTBOUND script on 7 May 2026 (fork_moutg6ld_898d58). On macOS LibreSSL, openssl outputs a single field — `$2` returns empty string → empty signature header → server rejects every POST with HTTP 400/401. Inbound has never worked since the 7 May fix landed in outbound only. Visible in `/tmp/imessage-watcher.err` as ~80 consecutive HTTP 400 lines ending in a 401.

## Probe results

### SSH context
- Host: `SY094.macincloud.com`, user: `user276189` (uid 508), home: `/Users/user276189`.
- Other GUI user `user270151` is on the same shared Mac — different MacInCloud customer, not relevant.
- Mac uptime: 53 days. No reboot involved.

### Plists
Both on disk under correct user:
```
-rw-r--r--  user276189  May  7 11:32  ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist
-rw-r--r--  user276189  May  7 10:44  ~/Library/LaunchAgents/au.ecodia.imessage-watcher.plist
```

Both reference `$HOME/.bin/imessage-{outbound-watcher,watcher}.sh`, StartInterval 5s, RunAtLoad true, no LimitLoadToSessionType.

### Launchd state
- `launchctl list | grep ecodia` → empty
- `launchctl print user/508` → exists (77 services, but no ecodia agents)
- `launchctl print gui/508` → "Domain does not support specified action" (no GUI session for user276189)
- `launchctl bootstrap user/508 ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist` → `Bootstrap failed: 5: Input/output error`. LaunchAgents need `gui/<uid>` domain which only exists when user has an active GUI (RDP) session.

### Logs
- `/tmp/imessage-outbound.err` last write 2026-05-08 18:42 UTC — sequence: TCC denial errors, then `curl: (22) 502`, then `curl: (28) Failed to connect to api.admin.ecodia.au port 443 after 75003 ms`. Watcher stopped writing after that.
- `/tmp/imessage-watcher.err` last write 2026-05-07 11:02 UTC — 80+ consecutive HTTP 400/401 from inbound webhook (HMAC `$2` bug).

### TCC database (user-level, `~/Library/Application Support/com.apple.TCC/TCC.db`)
| service | client | auth_value | last_modified |
|---|---|---|---|
| kTCCServiceAppleEvents | com.apple.Terminal | 0 (denied) | 2026-05-07 02:15:09 |
| kTCCServiceAppleEvents | /bin/bash | 0 (denied) | 2026-05-08 03:38:44 |

`tccutil reset AppleEvents` returned success but the deny rows persist (sandboxed reset). RDP+admin needed for full reset.

### Outbound queue substrate
6 messages in `imessage_outbound_queue`, all `status='failed'` after attempts=3, all with `last_error: "53:94: execution error: Not authorized to send Apple events to Messages. (-1743)"`. Queue substrate ALIVE; failure is downstream at osascript→Messages.app.

### Apple ID & chat.db
- chat.db readable, owned by user276189 (`-rw-r--r-- user276189 _developer 344064 May 8 00:08`). Apple ID is signed in for user276189.
- com.apple.iChat defaults read OK, suggests Messages.app has been used recently in user276189's GUI session.

## Actions taken from VPS (SSH only, no GUI)

1. **Patched inbound HMAC bug** (class d). `sed -i ""` swapped `awk '{print $2}'` → `awk '{print $NF}'` on `~/.bin/imessage-watcher.sh` line 21. Backup at `~/.bin/imessage-watcher.sh.bak.2026-05-09`. Verified post-patch: HMAC dgst test produces 64-char hex signature.
2. **Attempted `tccutil reset AppleEvents`** — returned success but TCC.db rows persist (need admin/RDP).
3. **Attempted `launchctl bootstrap user/508`** — failed with I/O error 5. Cannot bootstrap LaunchAgents into a domain without GUI.

## What CANNOT be fixed from SSH (RDP-required)

1. Granting TCC AppleEvents permission to `/bin/bash` (and Terminal) for Messages.app — requires interactive System Settings → Privacy & Security → Automation prompt.
2. Bootstrapping LaunchAgents into `gui/508` — requires Tate to RDP-login to instantiate the GUI session.
3. Final verification of Messages.app interactive send — GUI-bound.

## Recipe for Tate (next SY094 RDP, ~2 minutes)

Per `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` for entry. Once on macOS desktop, open Terminal.app and paste:

```bash
# 1. Force a TCC prompt by manually invoking osascript against Messages
osascript -e 'tell application "Messages" to count buddies of (1st service whose service type = iMessage)'
# macOS will pop "Terminal wants to control Messages.app" — click ALLOW.

# 2. Bootstrap the LaunchAgents into the now-live gui session
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/au.ecodia.imessage-watcher.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/au.ecodia.imessage-outbound.plist

# 3. Verify both loaded
launchctl list | grep ecodia
# Expect 2 lines, both with PID (not "-")

# 4. Tail logs for ~10s to confirm no errors
tail -f /tmp/imessage-outbound.err /tmp/imessage-watcher.err &
sleep 12 && kill %1
```

If `osascript` step 1 still fails with `-1743`, open System Settings → Privacy & Security → Automation, find Terminal (or bash) in the list, toggle Messages permission ON, retry. Alternatively `tccutil reset AppleEvents` from a Terminal.app that already has Full Disk Access.

After Tate completes the recipe, the health canary cron (every 6h) will flip `kv_store.health.imessage_path.ok=true` within one cycle. Outbound failed queue rows can be re-queued or accepted as historical loss (>24h old, mostly autonomous-pilot status pings).

## Files & artefacts

- This probe artefact: `~/ecodiaos/drafts/imessage-degradation-probe-2026-05-09-2305.md`
- Inbound script patch on SY094: `~/.bin/imessage-watcher.sh` (live), backup at `~/.bin/imessage-watcher.sh.bak.2026-05-09`
- Affected status_board row: `a828bba9-a5da-4f17-8bc2-9a4dc20f88de`
- Pattern file authored: `~/ecodiaos/patterns/cross-implementation-script-pair-must-stay-in-sync-on-fixes.md` (HMAC `$2`/`$NF` lesson)

## Doctrine surfacing

This failure had two distinct root causes whose individual symptoms looked like the same bug. Compound failures are a signal that several patterns intersect:

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — both inbound and outbound were "wired but dark"; layer 5 (side-effect) failed with TCC; layer 4 (HMAC sig) failed for inbound. Five-layer verification on EVERY listener subsystem would have caught the inbound HMAC bug at first deploy 7 May, not 9 days later via canary.
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` — TCC permission grant is RDP-required; SSH has no GUI Aqua context to fire the macOS consent prompt. Same constraint that blocks `screencapture` over SSH.
- `~/ecodiaos/patterns/imessage-is-primary-contact-channel-to-tate.md` — degradation persisted 46 cycles silently because Twilio fallback fires automatically and Tate didn't notice the channel had quietly downgraded. Canary should escalate at consecutive_failures=10, not silently accumulate.

— Fork `fork_moyczp7o_1dcf2b`, 2026-05-09 ~23:10 AEST.
