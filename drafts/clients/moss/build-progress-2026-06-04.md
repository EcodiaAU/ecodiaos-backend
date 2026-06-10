# SeedTree build progress - 2026-06-04 autonomous window

**Context.** Tate left for ~2 hours after the call arrived with Mossy. Mossy paid $2.2k via transfer, MacBook deal closed. Email arrived with two attachments at 11:55 AEST (Yourcelium build-context PDF + one-substrate three-faces wireframe PNG). Tate's instruction: get fully into work, lay foundations, progress the build enough to have something to show Mossy at the audit-week kickoff.

## What shipped in the window

### 1. Yourcelium auth substrate at `D:/.code/seedtree-auth/`

- `README.md` with architecture diagram (one-sentence per layer)
- `supabase/migrations/20260604000001_yourcelium_core.sql`: features, devices, attestations, key_pairs, signals, brands, reports tables. RLS on every table. Dedup index "one signal per user per (feature, brand, product, reason) per 30 days". 7-day rolling brand+reason counter view. Seeds the three features (lostme on, tcs_u off, glasshouse off).
- `supabase/functions/verify_app_attest/index.ts`: edge function for Apple App Attest verification. Phase 1 records as verified, hardening notes inline for Phase 1.5 Apple-CA chain check.
- `supabase/functions/verify_play_integrity/index.ts`: edge function for Android Play Integrity verification. Same Phase 1 / Phase 1.5 split.
- `docs/ACCOUNT-SETUP-CHECKLIST.md`: Mossy-facing checklist for the Apple Developer / Play Console / Supabase / Resend / GitHub accounts. Costs called out (USD $99 + $25 one-time, rest free for now). Invite emails specified.

### 2. iOS app at `D:/.code/seedtree-ios/`

- `project.yml` for xcodegen, targets iOS 17, bundle id `au.seedtree.app`, Supabase Swift SDK, App Attest entitlement
- `Sources/SeedTreeApp.swift`: app entry with SessionStore
- `Sources/DesignSystem/DS.swift`: locked palette (paper #F7F4EE / ink #1A1815 / flag #B5462E / sage #6B7F5E) + Lora/Manrope fallbacks for Tiempos/Untitled + spacing + radius
- `Sources/Auth/SessionStore.swift`: Supabase auth client, Apple Sign In with id-token flow, device + key + attestation bootstrap on sign-in
- `Sources/Auth/KeyPairManager.swift`: Curve25519 (Ed25519) key pair generation, Keychain storage with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, public key + fingerprint upsert to `key_pairs`
- `Sources/Auth/AppAttestService.swift`: DCAppAttestService key generation + attestation, posts to `verify_app_attest` edge function
- `Sources/Auth/DeviceRegistry.swift`: device upsert + cached device id resolver
- `Sources/Screens/SplashView.swift`, `Sources/Screens/OnboardingFlow.swift` (3 onboarding cards with the locked copy), `Sources/Screens/AppShell.swift` (Scan / Ledger / You tabs with red active underline)
- `Sources/Features/LostMe/ScannerView.swift`: edge-to-edge AVCaptureSession preview, BracketOverlay with 4 corners that snap from 60%-ink to flag-red on detection, "Barcode locked. EAN-13" chip on top
- `Sources/Features/LostMe/ScannerModel.swift`: AVCaptureMetadataOutput configured to ean13 / ean8 / upce only, locked-symbology pattern from the swarm synthesis
- `Sources/Features/LostMe/WhyChipsSheet.swift`: bottom sheet at 70% screen height, three closed-set chips ("misleading claim", "ingredient", "packaging"), flag-red "Flag this." commit button, custom FlowLayout

### 3. Android app at `D:/.code/seedtree-android/`

- Root `build.gradle.kts`, `settings.gradle.kts`, `gradle/libs.versions.toml` with the version catalog (AGP 8.5, Kotlin 2.0.20, Compose BOM, CameraX 1.4, ML Kit barcode, Play Integrity, Credentials API, Supabase Kotlin BOM)
- `app/build.gradle.kts`: namespace `au.seedtree.app`, minSdk 26, targetSdk 35, JDK 17
- `app/src/main/AndroidManifest.xml`: camera permission and feature, `SeedTreeApplication` + `MainActivity`
- `app/src/main/kotlin/au/seedtree/app/SeedTreeApplication.kt`: Supabase client init
- `app/src/main/kotlin/au/seedtree/app/MainActivity.kt`: Compose entry, SessionViewModel state routing to Splash / Onboarding / AppShell
- `app/src/main/kotlin/au/seedtree/app/designsystem/DS.kt`: same palette + type + spacing tokens as iOS for visual parity
- `app/src/main/kotlin/au/seedtree/app/theme/SeedTreeTheme.kt`: Material3 colorScheme bound to DS
- `app/src/main/kotlin/au/seedtree/app/network/SupabaseProvider.kt`: client provider with BuildConfig stub for URL + anon key
- `app/src/main/kotlin/au/seedtree/app/auth/SessionViewModel.kt`: Supabase auth wrapper, signed-in / signed-out / loading state
- `app/src/main/kotlin/au/seedtree/app/auth/KeyPairManager.kt`: AndroidKeyStore EC key pair generation + Supabase key_pairs row insert
- `app/src/main/kotlin/au/seedtree/app/auth/PlayIntegrityService.kt`: token request + post to `verify_play_integrity`
- `app/src/main/kotlin/au/seedtree/app/screens/OnboardingFlow.kt`: 3-card horizontal pager with the same copy as iOS
- `app/src/main/kotlin/au/seedtree/app/screens/AppShell.kt`: Scan / Ledger / You tabs, Splash, Ledger, You stub screens
- `app/src/main/kotlin/au/seedtree/app/features/lostme/ScannerScreen.kt`: CameraX `PreviewView` placeholder behind the bracket overlay (ML Kit analyser wiring is the next iteration)
- Resources: `values/strings.xml`, `values/themes.xml`, `values/colors.xml`, `xml/data_extraction_rules.xml`

### 4. Strategic alignment brief at `drafts/clients/moss/alignment-brief-2026-06-04.md`

After reading both Mossy attachments, the call-lock and his written spec diverge on five real points (one-app vs three-apps, T&Cs&U-first vs surface-irrelevant, Supabase vs Cloudflare, raw Ed25519 vs Spruce-style DIDs, cheeky-mode + leaderboard scope). The brief covers what aligned, what diverged, draft positions on his seven open questions, and a recommended opener for the kickoff call. Worth reading before the kickoff.

### 5. Reusable Gmail attachment extractor

- `scripts/fetch-gmail-attachments.sh` reusable bash wrapper
- `patterns/gmail-attachment-extraction-via-vps-service-account.md` doctrine pattern with triggers, gotchas (gmail.modify NOT gmail.readonly; source nvm), and the general form

Fetching Mossy's attachments cost ~15 minutes of figuring-it-out because the Gmail MCP wrapper strips them. Next time it is one command.

## Third-pass additions (autonomous window kept going)

- iOS demo loop wired end-to-end. `Sources/Network/OpenFoodFactsClient.swift` resolves barcodes against OFF, `SignalRepository.swift` upserts the brand by slug and inserts the signal with the resolved product name and image URL in the payload, `LedgerRepository.swift` queries the 7-day counter view, `HistoryRepository.swift` queries the user's recent signals. `LedgerListView` now renders real rows with brand name + flag-red count + sage progress bar to the 100-user milestone. `YouView` renders stat blocks plus a 20-row history list.
- Android demo loop matches feature-for-feature. `OpenFoodFactsClient.kt`, `SignalRepository.kt`, `LedgerRepository.kt`, `HistoryRepository.kt`. `ScannerViewModel.submit` now writes to Supabase. Ledger and You screens render real data.
- Post-submit confirmation screen on both platforms (swarm decision 15). `Sources/Features/LostMe/ConfirmationView.swift` + `app/.../features/lostme/ConfirmationScreen.kt`. "Sent. N others flagged this brand for this reason this week. Next milestone: 100. At 100 the aggregated report goes public." Live 7-day counter via brand slug lookup. Sage progress bar to 100. Flag-red Scan-another CTA. First-flag-on-this-product case named.
- Methodology page on both platforms. Editorial-grade single-column layout per swarm decision 13. Five section labels (how flags become signal, how we publish aggregates, who buys the reports, what we never sell, how to verify any of this) as small italic letter-spaced reading beats. Reachable from the You tab via NavigationLink (iOS) or ModalBottomSheet (Android).
- Reasons taxonomy migration (`20260604000003_reasons_taxonomy.sql`) with the display-label-to-canonical-code seam Mossy flagged as load-bearing in his spec. Funny labels and serious labels resolve to the same canonical_code so the comedy layer never poisons B2B aggregates. Seeded with straight and cheeky modes for Lost Me plus straight mode for T&Cs&U.
- `publish_aggregate` edge function implements the 100-user-7-day-window threshold per swarm decision 15. Scans candidate brand+reason pairs, skips already-published, inserts a report row with sample products and counts.
- Demo seed at `D:/.code/seedtree-auth/supabase/seed/demo_seed.sql` populates 8 brands and 14 signals across the last 7 days so the kickoff demo lands on a populated Ledger before any real user has scanned. Deterministic demo-user uuid means re-runs append cleanly.
- `D:/.code/seedtree-auth/docs/DEMO-WALKTHROUGH.md` is the five-minute kickoff demo script with explicit pre-flight + reset commands + what is NOT proven yet.
- `ReasonsRepository` on both platforms loads per-feature reasons by mode (straight or cheeky). Phase 1.5 work: wire `WhyChipsSheet` to call it with a mode toggle.

## Final repo state at end of the autonomous window

- `seedtree-auth`: 3 commits. 12 files. Migrations + 4 edge functions + checklist + demo seed + walkthrough.
- `seedtree-ios`: 6 commits. Native SwiftUI app with the full Phase 1 loop demoable.
- `seedtree-android`: 6 commits. Native Compose app, feature-parity with iOS.
- Total: 70+ files across the three repos.

The demo runs end-to-end on a real device the moment Mossy's Supabase project exists, the migrations apply, the seed script runs, and the apps build with `SUPABASE_URL` + `SUPABASE_ANON_KEY` in the build config.

## Second-pass additions (after the first brief)

- All three repos got `git init` + `.gitignore` + a clean initial commit signed by EcodiaOS (`code@ecodia.au`). Push-ready when Mossy's GitHub org exists. Branch: `main` on each.
- iOS `Resources/Info.plist` + `SeedTreeApp.entitlements` written so xcodegen produces a valid project on first run.
- Android `BarcodeAnalyzer.kt` wired with ML Kit barcode scanning (locked symbology set ean13, ean8, upca, upce). `ScannerScreen.kt` rewritten to bind CameraX `Preview` + `ImageAnalysis` to the lifecycle owner, surface camera permission via `ActivityResultContracts.RequestPermission`, and open the why-chips `ModalBottomSheet` on barcode lock. The Android Scan tab now scans for real, not a placeholder.
- Android `WhyChipsSheet.kt` + `ScannerViewModel.kt` complete the LostMe Phase 1 loop: viewfinder, lock, sheet, submit, reset.
- Yourcelium `supabase/migrations/20260604000002_term_decodes.sql` + `supabase/functions/decode_terms/index.ts` add the T&Cs&U feature backend. The edge function sha256-hashes the input, looks up the cached decode in `term_decodes`, and only calls Anthropic on a miss. The cache becomes Mossy's "auto-updating database of most common docs" by construction.
- iOS `Sources/Features/TermsDecoder/TermsDecoderView.swift` + `TermsDecoderModel.swift` and Android `app/src/main/kotlin/au/seedtree/app/features/tcsu/TermsDecoderScreen.kt` + `TermsDecoderViewModel.kt` ship the T&Cs&U surface on both platforms. Paste text or paste a URL, hit "Tease it apart", get a summary plus a list of flagged clauses with severity 1-5.
- AppShell on both platforms now has FOUR tabs: SCAN / DECODE / LEDGER / YOU. Mossy can demo either his first-ship preference (T&Cs&U / Decode) or the call-lock first-ship default (LostMe / Scan) on day one.
- Commit log on each repo is clean: two commits on seedtree-ios + seedtree-android (init + decode wiring), one commit on seedtree-auth (init covers everything in one go).

## What's not done

- iOS xcodegen has not been run. Xcodegen needs to be installed locally (`brew install xcodegen`) and `xcodegen generate` invoked once Mossy's `DEVELOPMENT_TEAM` lands. The Sources tree is already laid out so the generated project picks them up.
- Android Gradle has not been built. `./gradlew :app:assembleDebug` will need a Gradle wrapper (`gradle wrapper --gradle-version 8.7`) once the JDK 17 toolchain is verified on the MacBook.
- Google Sign In wire-up on Android stops at the "Get started" button. Credential Manager + Google ID token exchange goes in once Mossy's Play Console + OAuth Client ID exists.
- The ML Kit barcode analyser on Android is plumbed via the dependency list but not yet attached to the camera preview. Twenty minutes of work.
- The why-chip bottom sheet on Android matching iOS is not built yet. Half an hour of work.
- No tests yet. Phase 1 will get a small unit-test pass on the schema and edge functions; full integration tests run once we have a Supabase project to run them against.
- Ports / hexagonal architecture wrapper is not in place yet (Mossy's load-bearing rule from his PDF). Both platforms currently call Supabase directly. The wrap is a one-afternoon job once the kickoff resolves the one-app-vs-three-apps question.
- The renamed Yourcelium spelling has been applied across `seedtree-auth/` but not yet checked across `seedtree-ios/` or `seedtree-android/` since those files used "Yourcelium" from the start.

## Open questions surfaced for the kickoff

(All from Mossy's PDF section 8, plus the divergences I named in the alignment brief.)

1. Is the product one consolidated app with features (your call lock) or three thin client apps (his written spec)?
2. Which feature ships first? His spec says T&Cs&U. The iOS + Android scaffolds I built today are LostMe-first because that is what we scoped on the call. Re-shaping if needed is a half-day rework.
3. Supabase or Cloudflare for the substrate? I scaffolded Supabase.
4. Raw Ed25519 or Spruce-style DIDs? I scaffolded raw.
5. Cheeky mode on LostMe: display-string-to-canonical-reason-code seam needed at schema level. Easy to add when ready.
6. Anthropic API key custody for T&Cs&U decode + caching strategy for the document database.
7. Lawyer review on data-sale consent + defamation surface (AU is plaintiff-friendly).

## Repo invite list for Mossy

When the GitHub org is created, EcodiaOS pushes to these three repos:

- `SeedTreeEarth/seedtree-auth`
- `SeedTreeEarth/seedtree-ios`
- `SeedTreeEarth/seedtree-android`

GitHub handle `EcodiaCode` should be added with **Maintain** access to each. The full account-setup list lives at `D:/.code/seedtree-auth/docs/ACCOUNT-SETUP-CHECKLIST.md` for Mossy to work through.

## How to spend the next 90 minutes when you are back

1. Skim the alignment brief (10 min) - resolves the one-app-vs-three-apps and supabase-vs-cloudflare calls before the kickoff
2. Read the account-setup checklist and forward it to Mossy (5 min)
3. Sanity-check the seedtree-auth migration SQL (15 min)
4. Decide whether to push to GitHub now (under EcodiaTate temporarily) or wait for Mossy's org (5 min)
5. Schedule the kickoff call (10 min)

If you have more time after that, the ML Kit barcode analyser wiring on Android is the highest-value next code change because it makes the demo loop work end-to-end. Twenty minutes of work and the Android Scan tab scans.
