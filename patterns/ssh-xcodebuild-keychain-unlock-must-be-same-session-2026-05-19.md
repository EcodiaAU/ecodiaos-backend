---
triggers: ssh-xcodebuild, sy094-archive, keychain-locked, codesign-permission-denied, set-key-partition-list, security-unlock-keychain, errSecAuthFailed, errSecInternalComponent, sy094-build-recipe, mac-headless-build, ios-ssh-archive, ssh-codesign-fail
---

# SSH+keychain unlock must be in the same SSH session as xcodebuild

## Rule

When driving `xcodebuild archive` / `xcodebuild -exportArchive` over SSH on a remote Mac (SY094 / MacInCloud / any CI builder), the `security unlock-keychain` AND `security set-key-partition-list` calls MUST run in the SAME SSH session that invokes xcodebuild. Splitting them into separate SSH calls fails silently with `errSecAuthFailed` (during codesign in archive) or `errSecInternalComponent` (during re-codesign on export).

## Do

Chain all three commands in a single SSH invocation, joined with `&&`:

```bash
ssh user@host bash -lc '"
  cd ~/project && \
  security unlock-keychain -p $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -s -k $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  xcodebuild -project ... archive ...
"'
```

And again for the export step (export re-runs codesign on the IPA, hits the same keychain ACL):

```bash
ssh user@host bash -lc '"
  cd ~/project && \
  security unlock-keychain -p $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -s -k $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  xcodebuild -exportArchive ...
"'
```

## Do NOT

Do not do this. Each `ssh` invocation gets its own keychain-unlock state - the second call sees a locked keychain again:

```bash
ssh user@host 'security unlock-keychain -p $PWD ~/Library/Keychains/login.keychain-db'
ssh user@host 'security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -s -k $PWD ~/Library/Keychains/login.keychain-db'
ssh user@host 'cd ~/project && xcodebuild archive ...'   # FAILS: errSecAuthFailed
```

Do not assume one unlock at the start of the build pipeline carries through to the export step. The export step runs codesign again on the unsigned IPA wrapper; that codesign call re-queries the keychain ACL and re-prompts for partition-list authorisation. Unlock + set-key-partition-list MUST be repeated immediately before the export-archive call.

## Why this recurs

- `security unlock-keychain` unlocks the keychain for the CURRENT login session, but SSH non-interactive sessions create ephemeral login contexts that do not persist between SSH invocations.
- `security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -k $PWD` is the macOS Sierra+ ACL gate that tells the keychain "this private key is allowed to be used by codesign without an interactive Touch ID / GUI prompt." The ACL persists, but it is checked against the current unlock state - if the keychain re-locks between SSH calls, the ACL silently fails authorisation.
- `xcodebuild archive` and `xcodebuild -exportArchive` BOTH invoke codesign internally. Both need an unlocked keychain with the partition-list ACL set in the current session.
- Auto-provisioning (`-allowProvisioningUpdates`) can mask this failure by silently downgrading to a Development profile (which uses a development cert from the keychain via different ACL path). If you see your build sign with `Apple Development: <name>` when you expected `Apple Distribution`, suspect this.

## Verification

After running the build, inspect the codesign stamp in the build log:

```
Signing Identity:     "Apple Distribution: Ecodia Pty Ltd (86PUY7393S)"
Provisioning Profile: "EcodiaOS Native App Store 2026-05-19"
```

If you see `Apple Development:` when you wanted `Apple Distribution:`, the keychain unlock did not persist into the archive step.

For the export step, the failure is louder:

```
error: exportArchive codesign command failed (...: errSecInternalComponent)
** EXPORT FAILED **
```

## Canonical one-liner to include in every SY094 build script

```bash
KEYCHAIN_PWD="<from kv_store.creds.macincloud.password>"
ssh -o StrictHostKeyChecking=no user@SY094.macincloud.com bash -lc "\"
  cd ~/<project> && \
  security unlock-keychain -p $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  security set-key-partition-list -S apple-tool:,apple:,codesign:,unsigned: -s -k $KEYCHAIN_PWD ~/Library/Keychains/login.keychain-db && \
  xcodebuild -project <X>.xcodeproj -scheme <Y> -configuration Release \
    -archivePath build/<Y>.xcarchive -destination generic/platform=iOS \
    CODE_SIGN_STYLE=Manual \
    PROVISIONING_PROFILE_SPECIFIER=\\\"<profile name>\\\" \
    DEVELOPMENT_TEAM=<team id> \
    CODE_SIGN_IDENTITY=\\\"Apple Distribution\\\" \
    archive 2>&1 | tail -50
\""
```

Repeat the same unlock-then-export shape for the export step.

## Origin

- Phase 1B (Phase 1A + 1B of `ecodia-native`, 2026-05-18 / 2026-05-19): first end-to-end SSH-headless ship of `au.ecodia.native` to TestFlight. Initial archive attempt failed with `errSecAuthFailed` because keychain unlock was issued in a prior SSH call. Resolved by chaining unlock + set-key-partition-list + xcodebuild in one SSH invocation.
- Phase 1.5 (2026-05-19, build 2 with App Group entitlement restored): same failure mode recurred at the export step. Archive step succeeded with the chained unlock; export step (separate SSH call) failed with `errSecInternalComponent`. Resolved by repeating unlock + set-key-partition-list in the export SSH call.
- Recurring failure mode confirmed across at least two ship cycles. Codifying as durable doctrine.

## Cross-refs

- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` (when SSH vs RDP is the right substrate for SY094 work)
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (headless ship recipe pattern this rule fits into)
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` (when to use SSH-headless vs logged-in GUI)
