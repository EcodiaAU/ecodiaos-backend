---
triggers: cdp, chrome driving, play console, app store connect, saas ui, multi-chat tab conflict, send for review, realclick, clickbytag, new tab, gui.open_url, cliclick, alias, parallel chats, tab ownership, mac chrome
status: active
---

# Driving Chrome via CDP: open your own tab, never hijack one, and the Mac click ladder

Origin: 2026-06-08, Co-Exist 1.9.0 Play release. The final step was a UI-only
"Send 1 change for review" click in Play Console. Driving it via CDP went wrong
three ways before it went right. All three recur on every SaaS-console CDP job
(Play Console, App Store Connect, Stripe, Vercel, Supabase), so this is the
canonical how-to. Sister docs: [[parallel-cdp-chat-coordination-via-alias-namespacing]],
[[cdp-helper-library-and-recursive-improvement-2026-05-18]],
[[chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear]],
[[cowork-no-focus-collision]].

## The incident (what went wrong)

1. **Hijacked another chat's tab.** I attached a CDP alias to "the first
   `play.google.com/console` tab" via `cdp.attach_tab`. That tab was being
   driven by a DIFFERENT Claude chat (setting up the Locals app). My navigations
   and theirs fought over the same tab; the app silently switched from Co-Exist
   to Locals mid-flow. I nearly clicked "Send for review" on the WRONG app.
2. **`gui.open_url` is broken on Mac.** When I tried to open my own tab,
   `gui.open_url` failed: it sends Ctrl+T via `cliclick kp:t`, and cliclick
   rejects `kp:t` ("the key name may only be one of: arrow-down ... esc ...").
   It is also the wrong shortcut - macOS new-tab is Cmd+T, not Ctrl+T.
3. **`cdp.clickByTag` missed, then the click landed on stale coordinates.** The
   Play "Send" button has nested markup so `clickByTag` reported "no BUTTON
   matched". Switching to coordinate `realClick` worked, but the first attempt
   missed because the page was still settling ("running quick checks" resolved
   and shifted the layout between measuring the rect and clicking it).

## The rules (do this every time)

### 1. Open your OWN dedicated tab. Never attach to an existing arbitrary tab.
Tate's Chrome is shared by multiple chats. `cdp.attach_tab` to "the first tab
matching a URL" steals whatever another chat is using. Before driving:
- Open a fresh tab for your work and attach a **namespaced** alias
  (`eos-<chat>-<purpose>`, e.g. `cxplay`).
- If you must reuse a tab, first `cdp.list_aliases` / `cdp.listTabs` and confirm
  no other chat owns it. When in doubt, open your own.

### 2. New tab on Mac = AppleScript (not `gui.open_url`, not cliclick).
```bash
osascript -e 'tell application "Google Chrome" to tell window 1 to make new tab with properties {URL:"https://..."}'
```
Then `cdp.listTabs`, find your tab by the URL you just opened, and
`cdp.attach_tab` a namespaced alias to its `targetId`. This is the reliable Mac
primitive until `gui.open_url` is fixed in the laptop-agent (see Rectify below).

### 3. The alias drops on every `cdp.navigate`. Re-attach by targetId after.
`cdp.navigate` reloads the page and detaches the alias. Capture the `targetId`
once, and re-`cdp.attach_tab` it after each navigate before any `runJs`/click.

### 4. Click-reliability ladder (use in order):
1. `cdp.clickByTag({tag:'BUTTON', text:'...'})` - try first.
2. If it reports no match (Material / custom-element / nested-span buttons):
   read the element's center via `runJs`
   (`el.getBoundingClientRect()` -> `{x:r.x+r.width/2, y:r.y+r.height/2}`),
   then `cdp.realClick({x,y})`.
3. **Re-measure the rect IMMEDIATELY before the realClick.** If the page is
   still settling (spinners, async checks, banners resolving) the layout shifts
   and a coordinate measured seconds ago misses. Wait for settle, re-measure,
   then click. Screenshot to confirm the dialog/result.

### 5. Screenshot-verify identity before any consequential click.
The Play Console header showed "Locals." vs "Co-Exist" - that one glance caught
the wrong-app-about-to-be-submitted. Before send/submit/delete clicks, screenshot
and confirm the app name, version, and the exact change being actioned.

### 6. Heavy SaaS SPAs: wait long, use numeric IDs from the manifest.
- Play Console / ASC need 6-7s after navigate before the DOM is ready.
- Link discovery by `<a href>` often fails (they nav via JS/role). Find buttons
  by `innerText` regex over `document.querySelectorAll('button')`.
- The Console URL uses **numeric app IDs**, not package/bundle names. Co-Exist
  Play app id = `4972698454438935612`, dev account (Ecodia Code) =
  `4956975013415025789`. Get these from the canonical manifest
  (`clients/coexist.md`), never from whatever tab happened to be open.

## Rectify (substrate fix, not just doctrine)

`gui.open_url` in the laptop-agent must be fixed for Mac: replace the
`cliclick kd:ctrl kp:t ku:ctrl` new-tab keystroke with the AppleScript
`make new tab` call above (and Cmd, not Ctrl, for any other Mac shortcut it
sends). Until then, Rule 2 is the workaround. TODO tracked in status_board.

## Worked recipe: fully headless + CDP Android release (Co-Exist)

1. Bump `android/app/build.gradle` versionCode/versionName.
2. `npm run build` + `npx cap sync android`.
3. Sign headless via macOS Keychain (no password ever seen):
   passwords stored once by Tate via `security add-generic-password -U -a coexist
   -s COEXIST_KEYSTORE_PASSWORD -w` (+ `COEXIST_KEY_PASSWORD`); `build.gradle`
   `signingSecret()` reads them via `security find-generic-password -w`.
   `./gradlew bundleRelease` -> signed AAB.
4. API stages the release: `androidpublisher` v3 with
   `play-uploader@ecodia-code.iam.gserviceaccount.com` (has full Co-Exist
   release access): edits.insert -> bundles.upload -> tracks.update(production,
   releaseNotes lang `en-GB`, status `completed`) -> **commit with
   `changesNotSentForReview=True`** (the API cannot auto-send-for-review for this
   app).
5. **CDP sends for review** (the only UI step): open own tab to
   `.../app/4972698454438935612/publishing`, click "Send N change(s) for review"
   -> confirm "Send changes for review" (use the click ladder above).

This is the repeatable pattern for every Ecodia Android app: Keychain signing +
service-account API staging + CDP send-for-review.
