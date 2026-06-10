# Zernio graphic specs - week 2026-W24

Source: `cowork.zernio.weekly_drafts.2026-W24` (6 posts, drafted by sibling cron `zernio-post-draft` 2026-06-09).
Author: cron `zernio-post-schedule-and-graphic-prep`, fire 2026-06-09 22:05 AEST, task 5603dfcb.

## Locked image grammar (per `ecodiaos-social-cadence-and-topic-substrate.md` §4)

Spectral italic on pure white (#FFFFFF), 1080x1080 PNG. One sentence drawn from the body, centred. ECODIAOS byline at the bottom in small caps letterspaced. Template at `backend/drafts/_ecodia-post-*.html`. Render via Puppeteer screenshot. No further design embellishment.

## Per-post specs

### 01 - coexist-android-1.9.0-ship
- Display sentence: "Co-Exist Android 1.9.0 is live in Play production on org.coexistaus.app, versionCode 35."
- Tone: clinical ship-report confidence. T

he numbers carry the post; the image just frames the headline.
- Reference imagery: none. Text-led.
- Placeholder (no-graphic version): post the body text only, no image attached.
- Slot: 2026-06-10 09:30 AEST | LinkedIn + Instagram + Facebook.

### 02 - mac-canonical-workstation-move
- Display sentence: "I moved house."
- Tone: structural moment, dressed quietly. The three-word opener is the whole image. Resist any temptation to enlarge or stylise the second sentence.
- Reference imagery: none. Text-led.
- Placeholder: post the body text only.
- Slot: 2026-06-11 09:30 AEST | LinkedIn + Instagram + Facebook.

### 03 - seedme-commit
- Display sentence: "Tate dropped a product idea in the car on 2026-06-07."
- Tone: commitment moment. Quiet weight.
- Reference imagery (optional second image): a single sentence fragment from the body, rendered the same way, naming the trophic cascade: "Northern quolls, small mammals, insects, pollinators, agriculture." Same Spectral italic, same white, same byline. Use only if Tate wants a second slide on Instagram.
- Placeholder: post the body text only.
- Slot: 2026-06-12 10:00 AEST | LinkedIn + Instagram + Facebook.
- Tate gate: this draft may want a hold until SEEDME has a public artefact url on ecodia.au. Reply with "hold seedme" to defer; default is to ship.

### 04 - headless-ios-ship-via-asc-api
- Display sentence: "Co-Exist 1.9.0 shipped iOS via a fully headless App Store Connect API path from the Mac mini on 2026-06-08."
- Tone: capability moment. The image is the headline; the body unpacks the path.
- Reference imagery: none. Text-led.
- Placeholder: post the body text only.
- Slot: 2026-06-13 10:00 AEST (Saturday) | LinkedIn + Instagram + Facebook. Weekend slot justified as shipped-product milestone per §6 exception.

### 05 - cred-rotation-mac-substrate
- Display sentence: "The credential rotation substrate landed on Mac 2026-06-08, after two prior attempts in the same direction collapsed."
- Tone: structural learning. Spectral italic carries the past-tense weight.
- Reference imagery: none. Text-led.
- Placeholder: post the body text only.
- Slot: 2026-06-13 18:30 AEST (Saturday evening) | LinkedIn only. Technical depth reads cleaner on LinkedIn; Instagram and Facebook audiences are less infrastructure-curious.

### 06 - focusless-ios-sim-driving
- Display sentence: "I can now drive the iOS simulator on Xcode 26 without stealing keyboard focus from the Mac user."
- Tone: capability moment, calmly stated. Tate verified it directly; the post reflects that.
- Reference imagery: none. Text-led.
- Placeholder: post the body text only.
- Slot: 2026-06-14 10:30 AEST (Sunday) | LinkedIn + Instagram + Facebook. Weekend slot justified as shipped-capability milestone per §6 exception.

## Tate workflow

1. Read the specs.
2. Render each display sentence into a 1080x1080 PNG via the `_ecodia-post-*.html` Puppeteer pipeline.
3. Save PNGs at `backend/drafts/zernio-graphics-W24/post-NN.png`.
4. Reply to the spec email with the PNGs attached OR drop them in the drafts folder and say "graphics ready W24".
5. The next cron fire (or a manual fork) picks them up and updates the scheduled Zernio post with the finished visual.

## Scheduling gap surfaced this fire

Zernio MCP connector is not mounted in the current narrow-connector set on Mac. `zernio_create_post` and `zernio_best_time_to_post` are unreachable from this worker. The `suggested_time_aest` values in each draft were resolved against the default windows in `ecodiaos-social-cadence-and-topic-substrate.md` §6 (09:00-11:00 AEST weekdays for LinkedIn-leading, 18:00-20:00 AEST for Instagram-leading), not against a live `zernio_best_time_to_post` probe. Tate or a conductor session needs to either restore the Zernio MCP surface on `ecodia-comms` (or mount a separate `ecodia-zernio` connector) or push these into Zernio via the dashboard. Tracked on status_board this fire.
