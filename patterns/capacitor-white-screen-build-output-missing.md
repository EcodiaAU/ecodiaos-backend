---
triggers: white screen, white-screen, blank screen, blank page, capacitor ios build, capacitor android build, webview empty, CAPACITOR_BUILD, vite base path, npm run build ios, npm run build android, absolute path assets, relative path assets, webDir, cap sync, dist index.html, build:ios, build:android
---

# Capacitor white-screen: absolute asset paths from web-mode build

Recurring failure class. Every time `npm run build` is used instead of the Capacitor-specific build script, the resulting IPA ships absolute-path asset references that the WKWebView cannot resolve. White screen on launch.

## Rule

**NEVER run bare `npm run build` before `npx cap sync ios`/`npx cap sync android` on a Capacitor project.** Always use the dedicated native build script which sets the `CAPACITOR_BUILD=true` env var.

For Co-Exist: `npm run build:ios` or `npm run build:android` - these are defined in package.json and handle the flag correctly.

## Do

```bash
# iOS
npm run build:ios      # = CAPACITOR_BUILD=true npm run build && npx cap sync ios

# Android
npm run build:android  # = CAPACITOR_BUILD=true npm run build && npx cap sync android
```

## Do NOT

```bash
npm run build          # produces /assets/... absolute paths - web-only
npx cap sync ios       # copies broken absolute-path dist/ into iOS bundle
# result: white screen on device
```

## Why

Vite's `base` config controls whether asset URLs are root-absolute (`/assets/...`) or relative (`./assets/...`). Root-absolute paths work on Vercel/web where there is an HTTP server. In a Capacitor WKWebView on iOS, the app bundle is served from a custom URL scheme (`coexist://localhost`) or file system. Without a real HTTP server at `/`, absolute paths resolve to nothing - the JS bundle silently fails to load and the WebView renders a white screen.

The `vite.config.ts` toggle:
```js
const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true'
base: isCapacitorBuild ? './' : '/',
```

Without `CAPACITOR_BUILD=true`, `base: '/'` → absolute paths → white screen in native.

## Verification before every native build

After `npm run build:ios` / `npm run build:android`, check:

```bash
grep "src=" dist/index.html | head -3
# Must show: src="./assets/...  (relative, starts with ./)
# NOT:       src="/assets/...   (absolute, starts with /)
```

Also verify the iOS public dir was updated:
```bash
grep "src=" ios/App/App/public/index.html | head -3
```

And if an IPA is already exported, verify inside the archive:
```bash
unzip -p /tmp/my-app.ipa "Payload/App.app/public/index.html" | grep "src="
```

## Diagnosis when white screen reported

1. SSH to SY094
2. `grep "src=" ~/Desktop/projects/coexist/ios/App/App/public/index.html | head -3`
3. If starts with `/assets/` → root cause confirmed, run `npm run build:ios`
4. If starts with `./assets/` → root cause is something else (JS runtime error, Firebase crash, missing env var, service worker issue)

## Co-Exist specific notes

- Build script: `npm run build:ios` in `~/Desktop/projects/coexist/package.json`
- `.env.production` is present on SY094 at `~/Desktop/projects/coexist/.env.production`
- Correct build produces `./assets/index-*.js` in `dist/index.html`
- Archive uses `-project App.xcodeproj` (NOT `-workspace` - Co-Exist uses SPM, not CocoaPods)
- Keychain for SSH-headless archive: `security unlock-keychain -p "$PW" ~/Library/Keychains/login.keychain-db && security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db` BEFORE xcodebuild
- Do NOT pass `CODE_SIGN_STYLE=Automatic` to xcodebuild - conflicts with the manual "Ecodia Code" provisioning profile in the pbxproj

## Archive command (SSH-headless, Co-Exist)

```bash
security unlock-keychain -p "$SY094_PW" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
cd ~/Desktop/projects/coexist/ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath /tmp/coexist-<version>.xcarchive \
  -derivedDataPath /tmp/coexist-derived \
  DEVELOPMENT_TEAM=86PUY7393S \
  archive
```

## Prior occurrences

- 1.8.6(4) - 13 May 2026: build run without `CAPACITOR_BUILD=true` via a prior fork that called bare `npm run build`. White screen on Tate's device. Fixed in 1.8.6(5) by running `npm run build:ios`. Delivery UUID: `f45a96ac-f0a9-4b67-bad2-eec7bedc23c7`.
- "Blank page fix: LIVE" in `~/ecodiaos/clients/coexist.md` refers to the same class (git commit `49f674a fix(vite): set base path so SPA routes /events/new and /admin/* render correctly`).

## Origin

Tate verbatim 15:05 AEST 13 May 2026: "build 4 on my phone is just showing a white screen, we've had this problem before, fix that pls". Fork `fork_mp3lkc8s_3254ae` diagnosed and fixed. Doctrine authored same turn per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

## Cross-references

- `~/ecodiaos/clients/coexist.md` - build workflow section, "Pre-Build Checklist"
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - full Co-Exist iOS release recipe
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` - SSH-headless keychain unlock pattern
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - always verify IPA contents before upload
