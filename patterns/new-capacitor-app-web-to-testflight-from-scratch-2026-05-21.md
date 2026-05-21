---
triggers: new-app-to-testflight, web-app-to-testflight, capacitor-wrap-from-scratch, register-bundle-id-via-api, asc-app-record-via-cdp, testflight-public-link-via-api, beta-app-review-submit-api, goodreach-ios-ship, first-build-new-ios-app, internal-external-testflight-setup, headless-simulator-render-verify, asc-create-app-403-cdp-fallback
status: validated_v1
---

# New Capacitor app: web-only to TestFlight from scratch (end to end)

The universal protocol [[ios-app-asc-headless-ship-protocol]] assumes the app already has an ASC record, a registered bundle ID, and signing on SY094. This file covers the FROM-SCRATCH case: a live web app (Vite/React/etc) with NO Capacitor, NO iOS project, NO bundle ID, NO ASC record, taken all the way to a verified TestFlight build with internal testers live + an external public link in beta review.

Worked end to end 2026-05-21 for Goodreach (`au.ecodia.goodreach`, ASC app id `6771579670`), a Vite/React 19 web app, in one autonomous conductor session. v1.0(1) Delivery UUID `46708d5c`, public link `https://testflight.apple.com/join/eZPVY8Qm`.

## The 9 phases

1. **Recon.** Locate the web repo, confirm it builds (`npm run build`), find the GitHub remote (SY094 must be able to clone it), find a square logo for the app icon. Confirm it is Ecodia-owned (no client-contact gate) or scoped.
2. **Capacitor wrap (local on Corazon).**
   - `npm install @capacitor/core @capacitor/ios && npm install -D @capacitor/cli @capacitor/assets`
   - `capacitor.config.ts`: `appId` (the `au.ecodia.*` convention), `appName`, `webDir: 'dist'`. **Decision: bundle `dist` (a real standalone app, review-safe for external testers) rather than a `server.url` shell.** The shell is faster but Apple 4.2 can flag a pure webview wrapper at external beta review; the audience for a "send it to people" build is external testers, so bundle.
   - `npm run build` (needs a `.env.production` with the PUBLIC client vars only - `VITE_SUPABASE_URL`, anon/publishable key, app url. The anon key is RLS-protected and ships in the client anyway, but keep it gitignored and stage it on SY094 like a GoogleService-Info.plist, never commit service keys).
   - `npx cap add ios` (Capacitor 8 is SPM by default - Package.swift, no CocoaPods, build with `-project App.xcodeproj`).
   - Icons: `npx capacitor-assets generate --ios --iconBackgroundColor '#ffffff'`. **The App Store icon MUST be opaque (colortype 2, no alpha)** or altool rejects it. `--iconBackgroundColor` flattens transparency. Verify the PNG IHDR colortype byte is 2 not 6.
   - **Export-compliance key in `ios/App/App/Info.plist` (MANDATORY at app creation, not post-hoc).** Insert `<key>ITSAppUsesNonExemptEncryption</key><false/>` once, between `CFBundleVersion` and `LSRequiresIPhoneOS`. Bakes the answer into every binary so the "Missing Compliance" gate NEVER appears in TestFlight for any build of this app and no human has to click "No, this app doesn't use encryption" in ASC web. The post-VALID `PATCH /v1/builds/{id} {usesNonExemptEncryption:false}` (kept in `ship-ios.py` as belt-and-braces) becomes a no-op (409 "value is already set") once this key is present - that's the expected healthy state. Applies to every Ecodia app: pure web wrappers use no encryption beyond Apple's TLS, which is exempt; if a future app ever uses CryptoKit or non-exempt crypto, REMOVE the key for that app and handle compliance per Apple's docs. Reason this is here and not at step 6: every app shipped through the from-scratch protocol uses HTTPS-only with no extra crypto, so the answer is invariant - encoding it in Info.plist eliminates one Apple-side click forever.
   - Signing: insert `DEVELOPMENT_TEAM = 86PUY7393S;` after each `CODE_SIGN_STYLE = Automatic;` in `project.pbxproj`. Write `ios/App/ExportOptions.plist` (`method=app-store-connect`, `teamID`, `signingStyle=automatic`).
   - Commit + push `ios/` to the repo (gitignore keeps `.env.production` + `dist` out).
3. **Register the bundle ID - via ASC API (headless).** `POST /v1/bundleIds {identifier, name, platform:"IOS", seedId:"86PUY7393S"}` returns 201. The team key `R8P6K38X47` has App-Manager perms, so this works with no GUI. (Archive with `-allowProvisioningUpdates` would also auto-register it, but registering first lets it appear in the ASC New-App bundle-ID dropdown.)
4. **Create the ASC app record - via Chrome CDP (GUI, NOT API).** `POST /v1/apps` is **403 FORBIDDEN** ("resource 'apps' does not allow 'CREATE'") - app creation is web-only on Apple's API. Drive Tate's logged-in Chrome via the laptop-agent: `gui.enable_chrome_cdp` -> `gui.open_url appstoreconnect.apple.com/apps newTab:true` -> find the `aria-label="New App"` button (`cdp.runJs` enumerate, then `cdp.realClick`) -> click "New App" in the dropdown -> the form fields are NATIVE elements (`#name`, `#sku` inputs; `#primaryLocale`, `#bundleId` are real `<select>`; iOS checkbox + Full Access radio). Set the selects + text inputs via JS with the React-compatible native value setter + dispatch input+change; real-click the checkbox/radio. Click Create. Verify via `GET /v1/apps?filter[bundleId]=...` (authoritative, not screenshot).
5. **Build on SY094.** Clone the repo (PAT from VPS `~/ecodiaos/.env`), stage `.env.production`, `npm install && npm run build && npx cap sync ios`. Then per the universal protocol: keychain unlock + archive (`-project App.xcodeproj`, Automatic, `DEVELOPMENT_TEAM`, ASC API key) -> keychain unlock + exportArchive -> `xcrun altool --upload-app`. Archive signs with the Apple **Development** cert; exportArchive re-signs **Distribution** for app-store-connect - that is normal, not the auto-prov-dev-cert trap (that trap only bites MANUAL multi-target signing).
6. **Build VALID.** Poll `GET /v1/builds` until `processingState=VALID`. Export compliance is already handled by the `ITSAppUsesNonExemptEncryption=false` Info.plist key set at step 2 - the build lands with `usesNonExemptEncryption=false` and the "Missing Compliance" gate is impossible. The legacy post-VALID `PATCH /v1/builds/{id} {usesNonExemptEncryption:false}` returns `409 ENTITY_ERROR.ATTRIBUTE.INVALID` ("value is already set") - that's the healthy state, not a failure. `ship-ios.py` keeps the PATCH as belt-and-braces for any legacy app whose Info.plist hasn't been migrated yet.
7. **Render-verify (do NOT skip for a bundled SPA).** Build for simulator (`-sdk iphonesimulator CODE_SIGNING_ALLOWED=NO`), `simctl boot` + `install` + `launch` + `simctl io <udid> screenshot` (works HEADLESS over SSH - `simctl io screenshot` reads the CoreSimulator framebuffer, unlike `screencapture` which needs Aqua). Pull the PNG and eyeball it. A bundled SPA can white-screen in `capacitor://localhost` from base-path/router issues; a Vite default base `/` + React-Router BrowserRouter renders fine, but verify.
8. **Internal TestFlight (instant, no review).** `POST /v1/betaGroups {name:"Ecodia Team", isInternalGroup:true}` -> assign build -> `POST /v1/betaTesters` for each of the three canonical Ecodia internal testers (relate `apps` + `betaGroups`):
   - `tate@ecodia.au` (Tate, ASC role DEVELOPER, primary device)
   - `code@ecodia.au` (Ecodia Code, ASC role ACCOUNT_HOLDER+ADMIN, second device)
   - `tate.donohoe@gmail.com` (Tate's personal Apple ID, ASC role DEVELOPER, third device / friends-and-family check)

   All three are already registered as ASC team users on the Apple Developer team (id `86PUY7393S`); no per-app user creation needed. Add them at app creation, not later. Internal testers install immediately - no beta review. Note the gmail address is the dotted form (Apple uses email as identifier; Gmail itself ignores dots so either spelling reaches the inbox, but the dotted spelling is what Apple has on file across all Ecodia apps - stay consistent).
9. **External TestFlight + public link.** Set `betaAppReviewDetail` (contact name/phone/email + demo account + `demoAccountRequired:true`), `betaAppLocalizations` (en-AU description + feedbackEmail), `betaBuildLocalizations` (whatsNew). `POST /v1/betaGroups {publicLinkEnabled:true}` -> assign build -> `POST /v1/betaAppReviewSubmissions {build}`. The public link (`testflight.apple.com/join/XXXX`) is live immediately but external installs only work AFTER Apple approves the beta review (hours to ~1 day for a first review).

## Gotchas burned through (so the next one is one pass)

- `POST /v1/apps` is 403 - app record is the ONLY web-only step. Everything else is API.
- App Store icon with an alpha channel = silent altool rejection. Flatten it.
- `cdp.pageScreenshot` responses are large + slow; use `-m 120` and write to a project-dir path (git-bash `/tmp` != Python `/tmp` on Windows - they resolve to different dirs).
- New-app modal: native `<select>` for locale + bundle ID means JS value-set is reliable; pixel-clicking the dropdowns is not needed.
- Internal vs external: internal testers skip beta review (instant); external (incl. public link) needs beta-review approval first.

## Cross-references

- [[ios-app-asc-headless-ship-protocol]] - the per-build ship flow once an app exists (steps 5-6 reuse it)
- [[coexist-ios-headless-ship-recipe]] - the Capacitor SPM template these archive/export commands come from
- [[chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18]] - the CDP path for the one GUI step (app record)
- [[asc-app-record-create-recipe]] - the older captured GUI flow this supersedes for the create-app step
- [[ios-signing-credential-paths]] - the ASC API key signing path
- [[gui-macro-uses-logged-in-session-not-generated-api-key]] - why the app record goes through Tate's logged-in Chrome

## Origin

2026-05-21, Tate: "get the Goodreach app onto test flight... take it from where it is, to being on testflight" then "make decisions for yourself and do it all". Goodreach went from web-only (no Capacitor) to a verified TestFlight build with internal testers live + external public link in beta review, fully autonomous. App id `6771579670`, build v1.0(1) Delivery `46708d5c`, public link `https://testflight.apple.com/join/eZPVY8Qm`.
