---
triggers: macincloud, sy094, mac, ssh, mac-ssh, mac-bootstrap, ios-build, xcode, sshpass, ios-release, ipa, mac-host, remote-mac, agent_token, macincloud.password
class: programmatic-required
owner: tate
---

# creds.macincloud

SSH credentials and machine metadata for SY094, the MacInCloud Mac that hosts iOS builds (Xcode, Simulator, ipa generation). Without this row the entire iOS release pipeline halts at preflight - we cannot SSH to the build host.

## Source

MacInCloud control panel (Tate's account, vendor: MacInCloud). The control panel issues username, password, hostname; the agent token was generated when the laptop agent was installed on SY094.

## Shape

object `{username, password, hostname, agent_token, agent_port, ip, os, service, status, apps, connection, xcode}`

## Used by

- `~/ecodiaos/scripts/release.sh` (preflight SSH bootstrap to SY094: `scripts/release.sh:275-281, 326`)
- `~/ecodiaos/scripts/laptop-agent-staging/macroHandlers/xcode-organizer-upload.js` (requires `ssh_pass` from `creds.macincloud.password`)
- `~/ecodiaos/scripts/laptop-agent-staging/macroHandlers/transporter-upload.js` (same)
- `~/ecodiaos/clients/macincloud-access.md` (canonical access doctrine)
- `~/ecodiaos/clients/app-release-flow-ios.md`
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (Phase A pre-flight - `creds.macincloud.password` is the SSH password used by `mic-fast.ps1` to drive the RDP signin)

## Replaceable by macro?

No. SSH to SY094 IS the bootstrap that ENABLES the macro path on the Mac. The `password` field is what `sshpass` types into the SSH challenge from the VPS.

## Substrate selection (7 May 2026)

SSH password live and authorised for headless work over the Remote Build Port (paid add-on activated 7 May 2026); see `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md`. SSH for headless work (git/scp/build scripts/`xcodebuild`/log tail/launchctl/db migrations). RDP from Corazon for GUI-bound work (Xcode IDE, ASC upload UI, screencapture, cliclick, Messages.app interactive, Android Studio).

The `port` field in the row metadata may need updating to the Remote Build Port number once Tate forwards the activation email or screenshots the MacInCloud Server Details panel; the `remote_build_port_pending: true` flag in the row marks this state. Until updated, use whatever port the row currently exposes.

## Rotation

**No automatic rotation. The password is designated by MacInCloud at purchase time and stays fixed for the life of the rental** (Tate verbatim 2026-05-04 20:14 AEST). If `sshpass` fails with `Permission denied`, the most likely cause is NOT a rotation: check (a) typo or trailing-whitespace contamination in `creds.macincloud.password`, (b) MacInCloud kicked the session due to inactivity (reconnect retries), (c) the rental lapsed (renew via control panel - separate Tate action), or (d) Tate manually changed the password in the panel (rare).

## Restoration if lost

1. Tate logs into the MacInCloud control panel.
2. Reads the SSH credentials from the panel (the original purchase-time password remains the canonical value).
3. Updates `creds.macincloud.password` (and `username`, `hostname` if those changed - they normally do not).

```sql
-- Pseudo-pattern (Tate runs this; agent does not have authority to modify creds without explicit instruction)
UPDATE kv_store SET value = jsonb_set(value::jsonb, '{password}', to_jsonb('NEW_PASSWORD'::text)) WHERE key = 'creds.macincloud';
```

Documented in `~/ecodiaos/clients/macincloud-access.md`.

## Failure mode if missing

All iOS releases blocked at preflight. The `release.sh` driver reaches `die "SSH to $MAC_USER@$MAC_HOST failed. Verify creds.macincloud.password is correct; the password is set at MacInCloud purchase time and does not auto-rotate."` (Note: existing release.sh die-message string still references panel rotation - update to match this doctrine when next on a release-pipeline pass.)
