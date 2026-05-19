---
name: ios-headless-build-needs-keychain-unlock-via-macos-login-password
description: SSH-headless iOS builds on SY094 fail at codesign with errSecInternalComponent when the macOS login keychain is locked. SSH sessions cannot prompt for unlock interactively. Pre-unlock the keychain at the start of the build and extend its lock timeout so subsequent steps + future builds don't re-trigger the lock.
triggers: ios-build, ios-headless, sy094, macincloud, errSecInternalComponent, codesign-failed, keychain-locked, keychain-unlock, security-unlock-keychain, user-interaction-is-not-allowed, ssh-headless-codesign, xcodebuild-archive-fail, macos-login-keychain, set-keychain-settings, ssh-ship.py
metadata:
  type: pattern
---

# iOS SSH-headless builds need the keychain pre-unlocked

## The failure

`xcodebuild -archive` on SY094 over SSH returns:

```
errSecInternalComponent
Command CodeSign failed with a nonzero exit code

** ARCHIVE FAILED **
```

with multiple frameworks failing CodeSign in sequence. Probing the
keychain directly returns:

```
security: SecKeychainCopySettings ~/Library/Keychains/login.keychain-db:
User interaction is not allowed.
```

## Why

The login keychain holds the iOS signing identity (Apple
Development / Apple Distribution certs + private keys). When the
keychain is locked, codesign can read the cert chain (public material)
but cannot access the private key without an unlock. Locally-running
Xcode would prompt the user for the macOS login password; an SSH
session has no UI to prompt to, so codesign aborts with
`errSecInternalComponent` (the catch-all for "I tried to do crypto
and the system refused").

The keychain locks for two reasons:
1. The macOS login user is not logged in via Aqua (pure-SSH session,
   no GUI Aqua context).
2. The keychain has an auto-lock timeout that fired since the last
   unlock.

## The fix (every build step that signs)

`security unlock-keychain -p <login_password>` BEFORE any
`xcodebuild archive` or `xcodebuild exportArchive`. Plus
`security set-keychain-settings -lut 86400` ONCE to extend the
auto-lock timeout to 24h so subsequent steps in the same build, and
any builds within the next day, don't re-lock between archive and
export.

Example wrapper for the headless ship pipeline:

```bash
security unlock-keychain -p "$SY094_LOGIN_PW" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 86400 ~/Library/Keychains/login.keychain-db
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -archivePath /tmp/build.xcarchive \
  -destination generic/platform=iOS archive \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  ...
```

## Where to get the password

`kv_store.creds.macincloud` is the canonical source. Pulled via:
- MCP path (post-2026-05-19): `mcp__ecodia-full__kv_store_get key=creds.macincloud`
  works directly because `creds.macincloud` is on `KV_READ_ALLOWLIST`
  per [[kv-store-creds-deny-needs-explicit-ops-allowlist]].
- SQL fallback (any session): `SELECT value FROM kv_store WHERE key
  = 'creds.macincloud'` via `mcp__ecodia-full__db_query`.

The value is a JSON object; the password is at `.password`. The same
field unlocks both the SSH session (via sshpass or paramiko) and the
keychain (via security unlock-keychain) - macOS uses the unified login
password for both.

## What this DOESN'T fix

- `errSecInternalComponent` from causes OTHER than locked keychain.
  If unlock returns OK but archive still fails, check:
  - Signing identity is actually present (`security find-identity -v
    -p codesigning`)
  - DEVELOPMENT_TEAM matches the cert's team
  - The ASC API key has Admin role (needed by `-allowProvisioningUpdates`)
- A keychain that's never had the credentials loaded. `security
  list-keychains -d user` should show login.keychain-db; if it doesn't,
  the user account is misconfigured.
- Pure-SSH sessions cannot run anything that requires the GUI Aqua
  context (cliclick, screencapture, AppleScript GUI calls). For those,
  RDP into SY094 first per [[macincloud-substrate-selection-ssh-vs-rdp]].

## Pre-build checklist

Before any iOS SSH-headless ship arc:

```bash
ssh user276189@sy094.macincloud.com 'bash -lc "
  security unlock-keychain -p XXX ~/Library/Keychains/login.keychain-db &&
  security set-keychain-settings -lut 86400 ~/Library/Keychains/login.keychain-db &&
  security find-identity -v -p codesigning | head -5
"'
```

Expect 4+ valid identities (Apple Development + Apple Distribution
for both personal team and Ecodia Pty Ltd). If you see "0 valid
identities found" the keychain is unlocked but the certs are missing,
which is a separate problem.

## Origin

Tate 17:30 AEST 2026-05-19 after the conductor hit
`errSecInternalComponent` mid-build during the 1.8.11(43) ship arc on
Co-Exist. Unlock + extend-timeout sequence landed the rest of the build
in one go: archive succeeded, export succeeded, altool upload succeeded,
1.8.11(44) followed an hour later without re-locking.

## Cross-refs

- [[kv-store-creds-deny-needs-explicit-ops-allowlist]] -
  `creds.macincloud` is on the allowlist so MCP can fetch the password
  without the direct-SQL workaround.
- [[macincloud-substrate-selection-ssh-vs-rdp]] - the broader doctrine
  on when to use SSH vs RDP into SY094. Headless signing needs SSH +
  pre-unlocked keychain.
- [[sy094-eos-mobile-headless-ship-recipe]] and the Co-Exist
  `ssh-ship.py` - reference shipping pipelines that already call
  unlock-keychain, just often with stale hardcoded passwords.
