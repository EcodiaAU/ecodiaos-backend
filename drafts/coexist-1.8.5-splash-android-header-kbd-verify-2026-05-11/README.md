# Co-Exist 1.8.5 — Splash / Android Header / Keyboard Gap — Verification Notes
fork_mp0jpxrv_55cc20 | 2026-05-11

## Changes shipped

### 2.1 Splash asset swap
- `src/pages/splash.tsx`: `black-logo-transparent.png` (160×160 circle logo) → `black-wordmark.png` (60vw / max 280px, h-auto)
- Android `drawable/splash.png` + 10 density variants (portrait + landscape × 5 densities): regenerated via PIL with `#FAFAF8` background, `black-wordmark.png` centered at 50% image width (portrait) / 55% (landscape)
- iOS `Splash.imageset` (1×/2×/3× @ 2732×2732): regenerated via PIL with `#FAFAF8` background, wordmark at 40% width (1092×293 px)

### 2.2 Android header squish fix
- `android/app/src/main/res/values/styles.xml`: added `<item name="android:windowBackground">@color/splashBackground</item>` to `AppTheme.NoActionBar`
- Root cause: parent `Theme.AppCompat.DayNight.NoActionBar` has a default white/grey window background. With `android:statusBarColor: transparent` + `EdgeToEdge.enable()`, the window background bleeds through into the status-bar area before the WebView renders. The existing `android:background: @null` sets the VIEW background (not the window background), so it didn't fix this. The explicit `android:windowBackground: @color/splashBackground` (#FAFAF8) ensures the transition area is brand-coloured.

### 2.3 Submit button keyboard gap fix
- `src/components/page.tsx` footer `paddingBottom` when `tabsVisuallyHidden` (keyboard open + bottom tabs):
  - Before: `calc(env(safe-area-inset-bottom, 0px) + 0.25rem)` — unreliable on Android gesture nav, which returns 20-30px for `safe-area-inset-bottom` even when keyboard is open, adding unexpected space below buttons
  - After: `fullBleed ? '0px' : '6px'` — fixed 6px regardless of platform, sits flush against keyboard line

## Build verification
- `npm run build` — clean (✓ built in 2.32s)
- `npx vitest run` — 21 test files, 207 tests, all passed

## Simulator/device verification
No simulator available on VPS. Changes are low-risk:
- PNG changes: mechanical PIL generation with known dimensions — pixel analysis confirmed old files had circle logo at center; new files have wordmark. No logic involved.
- `styles.xml`: additive one-liner to existing theme. `android:windowBackground` is a standard Android attribute; `splashBackground` colour (#FAFAF8) already defined in `colors.xml`.
- `page.tsx`: replaced an arithmetic expression with a fixed string literal in one branch of a ternary. The `tabsVisuallyHidden` guard (only fires when keyboard is open + bottom tabs present) limits blast radius to the specific scenario the fix targets.

## Constraints / known risks
- Android splash PNGs use CENTER_INSIDE scale type (per `capacitor.config.ts`). The wordmark is rendered at 50% of image width which is conservative — should look good across all density variants.
- iOS splash is full 2732×2732 for all three slots; the wordmark centring is identical to what Co-Exist used before (just different asset). No framing change.
- `android:windowBackground` applies only after the system SplashScreen API hands off to `AppTheme.NoActionBar` (via `postSplashScreenTheme`). It does not affect the Android 12+ system splash window — that continues to use `windowSplashScreenBackground: @color/splashBackground` which was already correct.
- The 6px footer keyboard gap is a deliberate conservative value. If post-device-testing shows it should be 0px or 8px, it's a 1-character change.

## Files changed
```
android/app/src/main/res/drawable/splash.png
android/app/src/main/res/drawable-port-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/splash.png  (5 files)
android/app/src/main/res/drawable-land-{hdpi,mdpi,xhdpi,xxhdpi,xxxhdpi}/splash.png  (5 files)
android/app/src/main/res/values/styles.xml
ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png   (3x)
ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png (2x)
ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png (1x)
src/pages/splash.tsx
src/components/page.tsx
```
