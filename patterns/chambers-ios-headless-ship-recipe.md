---
triggers: chambers-ios-ship, chambers-testflight, ship-chambers, testflight-chambers, chambers-distribute, chambers-headless-ship, chambers-internal-beta, chambers-ipa, chambers-asc, chambers-altool, chambers-spm-ship, au-ecodia-chambers, chambers-build-bump, chambers-beta-autodistribute, chambers-ship-and-distribute, chambers-ship-script, sy094-chambers
status: validated_v1
---

# Chambers iOS Headless Ship Recipe (SY094 SSH Path) - status: validated_v1

**Use the existing ship scripts on SY094. Do NOT clone fresh, do NOT reinvent.** This is the third app-specific delta on the universal protocol at [ios-app-asc-headless-ship-protocol.md](ios-app-asc-headless-ship-protocol.md). Sister recipes: [coexist-ios-headless-ship-recipe.md](coexist-ios-headless-ship-recipe.md).

## One-line invocations

**Ship + attach to Internal beta group (canonical for routine Chambers TestFlight pushes):**

```bash
ssh user276189@103.246.99.94 \
  'export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/opt/node/bin:$PATH"; \
   cd ~/Desktop/projects/chambers-frontend && \
   python3 ~/asc-scripts/chambers-ship-and-distribute.py'
```

**Ship without auto-attach (generic driver, no beta-group routing):**

```bash
ssh user276189@103.246.99.94 \
  'python3 ~/asc-scripts/ship-ios.py chambers'
```

Both auto-bump build number, run npm install + npm run build + cap sync ios, archive via xcodebuild, export IPA, upload via altool, and (for the first invocation) attach to the Internal beta group. Build surfaces in TestFlight within 60-120s after altool reports success.

## Validated runs

- **Build 1.0.8 (8)** shipped 2026-05-19 23:14 AEST. Delivery UUID `6941021a-7709-4a77-a820-9995f2da309b`. State VALID. Auto-attached to Internal group. Bundle: new constellation logo + unified teal splash (commit fe4c072).
- **Builds 1.0.2 through 1.0.7** shipped 2026-05-17 through 2026-05-19 via the same script.

## App spec (committed at `~/asc-scripts/apps/chambers.json` on SY094)

```json
{
  "slug": "chambers",
  "name": "Chambers.",
  "bundle_id": "au.ecodia.chambers",
  "team_id": "86PUY7393S",
  "asc_app_id": "6770804509",
  "build_dir": "~/Desktop/projects/chambers-frontend",
  "xcode_project": "ios/App/App.xcodeproj",
  "xcode_scheme": "App",
  "github_repo": "EcodiaTate/chambers-frontend",
  "build_system": "spm",
  "cap_sync_required": true,
  "asc_api_key_id": "R8P6K38X47",
  "asc_api_issuer_id": "4b45186b-49e4-4a25-8a63-afd28cf12d3f",
  "asc_api_p8_path": "~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8",
  "marketing_version": "1.0",
  "asv_id": "5074b048-bb17-4ad6-9f10-223f6f3eb51a"
}
```

Same ASC API key as Co-Exist and EOS-mobile (single Apple Developer team `86PUY7393S` covers all Ecodia apps).

## Canonical build path

`~/Desktop/projects/chambers-frontend` on SY094. NOT `~/workspaces/`. Same convention as Co-Exist.

## Pre-flight from a fresh chat

Before invoking the script, ensure the SY094 checkout has the commit you want shipped:

```bash
ssh user276189@103.246.99.94 \
  'cd ~/Desktop/projects/chambers-frontend && \
   git stash push -m "wip-before-pull" 2>/dev/null; \
   git pull origin main && \
   git log -1 --oneline; \
   git stash pop 2>/dev/null || true'
```

The local WIP usually contains build-number bumps from prior runs and Mac path-normalisation in `ios/App/CapApp-SPM/Package.swift` (the Mac fixes Windows-introduced backslashes). The stash-pull-pop workflow preserves those local mods.

If `.env.production` or `ios/App/ExportOptions.plist` is missing, the script will surface the missing file; both are gitignored and live on SY094 only.

## Wrapper script layout (live on SY094)

```
~/asc-scripts/
  apps/
    chambers.json          # spec above
    coexist.json
    roam.json
  ship-ios.py              # universal 10-step driver (reads apps/<slug>.json)
  chambers-ship-and-distribute.py   # chambers wrapper: ship + attach to Internal
  chambers-beta-autodistribute.py   # standalone attacher (no rebuild)
  chambers-testflight-debug.py      # diagnostics
  chambers-testflight-tate.py       # variant
  bootstrap-chambers.py             # one-time app provisioning
  bootstrap-chambers-asv.py         # ASC version creation
  asc-attach-submit.py              # generic attach + submit
  asc-probe.py                      # ASC state probe
  asc-submit-v2.py                  # generic submit-for-review
```

## What the wrapper does (chambers-ship-and-distribute.py)

1. Source `~/.asc-scripts.env` (GITHUB_PAT, KEYCHAIN_PASSWORD)
2. Bump `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` (unless `--skip-bump`)
3. `npm install`
4. `npm run build` (vite to `dist/`)
5. `npx cap sync ios`
6. Unlock login keychain with `KEYCHAIN_PASSWORD`
7. `xcodebuild archive` with automatic signing via ASC API key
8. `xcodebuild -exportArchive` to produce `.ipa`
9. `xcrun altool --upload-app` to TestFlight
10. Poll ASC every 10s for the new build to surface (typically 60-120s)
11. Attach the surfaced build to the Internal beta group via ASC API (`asv_id` from spec)

## Anti-patterns (the reason this doctrine exists)

Future sessions seeing "push chambers to TestFlight" or similar MUST grep these triggers FIRST and use the existing scripts. Specifically do NOT:

- Clone `chambers-frontend` fresh to `~/workspaces/` on SY094. The Desktop checkout is canonical and has Mac-local mods (build number history, Package.swift path corrections).
- Run `xcodebuild archive` directly. The wrapper handles auth, signing, and the post-upload polling race.
- Manually attach builds via the ASC web UI. The wrapper does it programmatically via API key auth.
- Install Node / Cocoapods. Already on SY094 via Homebrew (Node v25 at `/opt/homebrew/bin/node`, pod 1.16.2). Just need to source the right PATH.
- Treat ASC API key R8P6K38X47 as chambers-specific. It works across the full team (Co-Exist, EOS-mobile, ecodia-native, Chambers).

## Prerequisites already in place on SY094 (verify only if a ship fails)

1. SSH access via Remote Build Port (MacInCloud +AU$9/mo add-on, activated 7 May 2026)
2. SY094 login password in `kv_store.creds.macincloud.password`
3. GitHub PAT in `~/.asc-scripts.env` (or `kv_store.creds.github_pat`)
4. ASC API .p8 at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8` (mode 600)
5. Homebrew at `/opt/homebrew`, Node + npm + pod resolvable
6. Xcode 26.3 with command-line tools selected

## Origin

2026-05-19 23:30 AEST. Tate flagged that a fresh chat tried to clone `chambers-frontend` and install Node from scratch when shipping the new constellation logo to TestFlight, despite the working ship script being on SY094 for days. The fresh chat eventually found the script and shipped, but the discovery cost was the wrong shape. Codified the existing surface so future sessions grep this file first.

## Cross-refs

- [ios-app-asc-headless-ship-protocol.md](ios-app-asc-headless-ship-protocol.md) (universal 10-step protocol)
- [coexist-ios-headless-ship-recipe.md](coexist-ios-headless-ship-recipe.md) (sister recipe with SPM + Firebase deltas)
- [sy094-eos-mobile-headless-ship-recipe.md](sy094-eos-mobile-headless-ship-recipe.md) (now-defunct EOS-mobile recipe, retained for historical reference)
- [macincloud-substrate-selection-ssh-vs-rdp.md](macincloud-substrate-selection-ssh-vs-rdp.md) (SSH-vs-RDP routing rule)
