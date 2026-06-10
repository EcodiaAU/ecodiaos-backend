# Release Walker - Architecture (revised per Tate 2026-06-09)

> Layered extension: the state-matrix, exploration, and parity layers are
> specified in STATE-MATRIX.md (2026-06-10) and shipped in
> backend/scripts/release-walker/. Sections below remain the canonical
> base design for the walk + detector taxonomy.

Authority: this document is the canonical design. Replaces the initial synthesis after Tate's constraints overrode the Routine/SMS/email path. No code ships until Tate signs off.

---

## 1. ONE-LINE GOAL

A skill the conductor invokes (or a reflex hook nudges him to invoke) that walks an app end-to-end on the Mac against its on-disk spec, collates every non-GREEN finding to status_board, and is the conductor's build-verification gate before any ship/push/release.

---

## 2. CONSTRAINTS THAT SHAPE THIS (Tate, 2026-06-09)

These are HARD. Every section below honours them.

1. **No Anthropic Routines.** Mac is always awake; that is the purpose of the Mac-canonical posture. Execution is local.
2. **No SMS, no email.** Both are useless overseas. All findings collate to status_board; the conductor follows up directly in chat.
3. **Hooks fine, no webhooks, no scheduled cloud agents.**
4. **Spec location unified, content grassroots.** Every app's spec lives at one well-known path within its repo. Each app's maintainer (the conductor) authors the content.
5. **Diff-walk propagates through component dependencies.** Changing a centralised input component re-walks every surface that consumes it, not just the file that changed.
6. **This is a tool the CONDUCTOR uses to verify builds.** Not autonomous escalation, not a notifier. The conductor is the judge + fix loop.

---

## 3. ARCHITECTURE OVERVIEW

### Component diagram

```
   Tate types /release-walk OR
   conductor reflex hook fires on ship-intent
              |
              v
   +-----------------------------+
   |  Skill: /release-walk       |   (or /diff-walk)
   |  invoked by CONDUCTOR       |
   +--------------+--------------+
                  |
                  | conductor runs the walker locally
                  | (foreground for fast runs, scheduler.delayed for long ones)
                  v
   +-----------------------------------------+
   |  Walker (bash + maestro + jq on Mac)    |
   |  - reads spec.yml                       |
   |  - boots ONE device                     |
   |  - enumerates per platform              |
   |  - runs detectors D1..D11               |
   |  - issues verdict                       |
   +----+---------+--------------------------+
        |         |
        |         | every non-GREEN finding
        |         v
        |     +-----------------------------------+
        |     | status_board                      |
        |     | walker:<app>:<sha>:<finding-id>   |
        |     | priority=2 next_action_by=ecodiaos|
        |     +-----------------------------------+
        v
   +-----------------------+
   | Neo4j Episode         |
   | (terse run record)    |
   +-----------------------+

   The conductor, on his NEXT turn or session start, sees the priority=2
   rows on status_board and works through them in chat: read finding,
   judge, fix in app code, re-run walker.
```

### Why local Mac (not cloud, not Routine)

Tate's constraint #1. Mac-canonical is the architecture. Routines are removed entirely.

- **Fast spec-only validation** runs in the conductor's foreground turn (seconds).
- **Full device walks** schedule via `scheduler.delayed` with `delay: "in 1m"` so the conductor stays responsive. The scheduler poller fires the prompt to a worker tab on the laptop-agent. The worker brief carries the spec path + run-id + verify gate. The worker runs maestro + capture, writes findings to `status_board`, then `coord.signal_done` + `coord.close_my_tab`.
- **The wake protocol, cloud brain, SMS budget, and daily digest are all deleted.**

### File layout

```
backend/scripts/release-walker/
|-- README.md                       # 1-page; full doctrine in patterns/
|-- bin/
|   |-- release-walk.sh             # the `/release-walk` entrypoint
|   |-- diff-walk.sh                # the `/diff-walk` entrypoint
|   `-- spec-registry.sh            # resolves <app> -> spec path (see Section 5)
|-- lib/
|   |-- enumerate-ios-native.sh     # idb ui describe-all wrapper
|   |-- enumerate-android-native.sh # uiautomator dump wrapper
|   |-- enumerate-capacitor-android.sh  # adb forward + CDP
|   |-- enumerate-capacitor-ios.sh  # ios-webkit-debug-proxy
|   |-- tap.sh                      # platform-aware tap (coord vs CDP)
|   |-- boot-device.sh              # ONE device, owned, no pool
|   |-- capture.sh                  # screenshot + AX dump -> run dir
|   |-- impact-graph.sh             # symbol -> consuming-surface resolution (diff-walk)
|   `-- verdict.sh                  # writes status_board + Neo4j
|-- detectors/
|   |-- d1-surface-absence.sh ... d11-crash.sh
|   `-- README.md                   # the taxonomy table
`-- runs/                           # ephemeral; pruned >7d
```

Per-app specs are NOT under this tree. They live in each app repo. See Section 5.

### Data flow

1. Conductor invokes `/release-walk <app>` (or `/diff-walk <app>`).
2. `bin/release-walk.sh` resolves the spec path via `spec-registry.sh`.
3. Walker inserts `status_board` row `walker:<app>:<sha>` priority=3 status=running.
4. Walker boots the device, walks flows authored from spec, dumps artifacts to `~/.local/state/release-walker/runs/<run-id>/`.
5. Walker runs detectors D1-D11 against artifacts.
6. For each non-GREEN finding, walker writes a per-finding `status_board` row priority=2 next_action_by=ecodiaos with the spec line + observed value + artifact path.
7. Walker writes one Neo4j Episode summarising the run.
8. Conductor, in his next turn or at session start, reads the priority=2 rows and works through them: judge, fix in app code, re-run walker.

---

## 4. DETECTOR TAXONOMY

Unchanged from the prior synthesis. Detector design is decoupled from the Routine/notification questions Tate overrode, so this section stands as-is.

Every detector emits `(class, severity, evidence_path, expected_per_spec, observed)`. **No spec anchor, no fire** (sole exception: D11 crash).

| # | Class | Bug caught | Signal source | FP risk | S/N |
|---|---|---|---|---|---|
| **D1** | Surface absence | Spec lists a surface; hierarchy dump doesn't contain it on prescribed path | Maestro `view-hierarchy` / idb AX / uiautomator / CDP DOM | Low | High |
| **D2** | Surface unreachable | Surface exists in tree, prescribed nav path doesn't reach it (tap sinkhole, dead button) | Action trace + hierarchy diff before/after each tap | Low | High |
| **D3** | Wrong-platform surface | iOS opens an Android-shape surface (or vice versa) per per-platform spec block | Per-platform spec + landing hierarchy | Low | High |
| **D4** | Persistence violation | Spec says "X survives cold restart"; post `killApp + launchApp(clearState:false)` state != spec | Pre-kill snapshot vs post-relaunch snapshot, both vs spec | Low | High |
| **D5** | Nav-loop / back-stack | Spec: "back from Saved returns to Discover"; observed: loop / app-exit / wrong dest | Action trace + system back + hierarchy after | Low | High |
| **D6** | Form-submit completion | Spec: "after submit, surface X with toast Y within Zms"; observed: spinner forever / silent fail / wrong surface | Action trace + extendedWaitUntil + network log | Low | High |
| **D7** | iOS-26 sheet auto-dismiss | Sheet expected; collapses because walker re-polled hierarchy | Hierarchy dump cadence (one snapshot per sheet) | Low if discipline holds | High |
| **D8** | iOS-26 Form toggle un-flippable | Toggle didn't flip because walker tapped label not handle point | Pre-tap vs post-tap toggle `value` | Low | High |
| **D9** | SwiftUI disabled-state mis-render | Spec: "Submit disabled until valid"; visually enabled while empty | Vision (Read on PNG) + spec line stating "disabled here" | Low if anchored | Medium |
| **D10** | Scroll-mechanism failure | Spec: "WHAT THEY SAY appears after swipe UP"; anchor doesn't change OR top doesn't restore | Hierarchy + screenshot pair before/after swipe | Low | High |
| **D11** | Crash / ANR / WebView-blank | Process gone, ANR dialog, blank-white WebView | `adb shell pidof` / ANR dialog match / white-with-no-DOM | Low | Highest |

### Signal-only collectors (NEVER produce verdicts alone)

Per-surface screenshot, per-surface hierarchy dump, per-action network log, per-kill-relaunch process state. **Pixel-hashing, hero-band variance, md5 checks, and per-screen tap memory are all out.**

### Explicitly rejected

- **Visual-regression-vs-previous-run.** Spec is ground truth, not the previous run. A bug codified in the baseline is "fine forever".
- **Pixel-variance "broken UI" detector.** The cream onboarding bug. No spec anchor, false-flags every minimalist surface.

---

## 5. PER-APP SPEC: UNIFIED LOCATION, GRASSROOTS CONTENT

### Location convention (unified)

Every app puts its spec at:

```
<app-repo-root>/.release-walker/spec.yml
```

The walker resolves `<app>` -> repo via `bin/spec-registry.sh`, a flat lookup table:

```
# backend/scripts/release-walker/bin/spec-registry.sh
declare -A SPEC_REGISTRY=(
  [locals]=/Users/ecodia/.code/locals-shared/.release-walker/spec.yml
  [coexist]=/Users/ecodia/.code/coexist/.release-walker/spec.yml
  [glovebox]=/Users/ecodia/.code/glovebox/.release-walker/spec.yml
  [goodreach]=/Users/ecodia/.code/goodreach/.release-walker/spec.yml
)
```

Adding an app = one line in the registry + spec file in the app repo. The registry is the only central artefact; spec content is per-app.

For Locals (three-native), the spec lives in `locals-shared` (shared between iOS + Android) and references both platforms.

### Spec schema

```yaml
app: <app-id>                       # locals | coexist | glovebox | goodreach
shape: three-native | capacitor
platforms: [ios, android]
artifact_dir: ${ARTIFACT_DIR}

roles:
  - id: anon
    description: "First-time, never-onboarded user"
  - id: customer-authed
    description: "Returning user with saved favourites"
    seed:
      email: walker+customer@ecodia.au
      password_kv: kv_store.creds.walker_customer_pw

surfaces:                           # surface inventory; D1-D3 anchor here
  - id: discover
    platforms:
      android: { landing_after_onboarding: true,
                 elements: [chip:Cafe, chip:Food, search] }
      ios:     { landing_after_onboarding: false }
    uses_components:                # NEW: diff-walk symbol propagation
      android: [MerchantCard, CategoryChip, SearchBar, Tokens.Brand]
      ios:     [MerchantCardView, CategoryChipView, SearchBarView, Theme]
  - id: merchant-detail
    elements: [hero, about, what-they-offer, what-they-say]
    scroll_required: true            # triggers D10 mandatory
    iOS_uses_sheet: true             # triggers D7 single-poll discipline
    uses_components:
      android: [MerchantCard, HeroImage, AboutBlock, Tokens.Brand]
      ios:     [MerchantDetailView, HeroImageView, AboutBlock, Theme]

flows:
  - id: launch-and-onboard
    role: anon
    template: tests/e2e/flows/01-launch-and-onboarding.yml
    detectors: [D1, D2, D3, D11]
    walks_surfaces: [splash, onboarding-1, onboarding-2, onboarding-3, discover]

persistence:                        # D4 anchors
  - claim: "completed onboarding does not re-show after kill+launch"
    fires_after: launch-and-onboard
    probe: { kill: true, relaunch_clear_state: false,
             expect_landing_surface: { android: discover, ios: map-all-categories } }

back_stack:                         # D5 anchors
  - from: saved-list
    press: back
    expect_landing: discover

forms:                              # D6 anchors
  - id: signup
    on: signup-surface
    fields: [email, password]
    submit_label: "Create account"
    expect: { surface: onboarding-step-1, within_ms: 4000 }
    capacitor_input_via: coord_tap   # MANDATORY for capacitor apps
```

### What is NEW vs the prior spec

- **`uses_components:` per surface.** This is the wiring that makes diff-walk symbol-propagating. See Section 6.
- **`walks_surfaces:` per flow.** Explicit list of which surfaces a given flow exercises. Diff-walk uses this to map "which flows must run when surface X is impacted".
- **`notification_channels:` field is DELETED.** The SMS, email, and digest options are all gone. Findings always go to status_board.

### Worked example: Locals (three-native)

Lives at `/Users/ecodia/.code/locals-shared/.release-walker/spec.yml`.

```yaml
app: locals
shape: three-native
platforms: [ios, android]
artifact_dir: ${ARTIFACT_DIR}

roles:
  - id: anon
  - id: customer-authed
    seed: { email: walker+locals@ecodia.au, password_kv: kv_store.creds.walker_locals_pw }

surfaces:
  - id: discover
    platforms:
      android: { landing_after_onboarding: true,
                 elements: [chip:Cafe, chip:Food, chip:Drinks, search-bar] }
      ios:     { landing_after_onboarding: false }
    uses_components:
      android: [MerchantCard, CategoryChip, SearchBar, Tokens.Brand]
      ios:     [MerchantCardView, CategoryChipView, SearchBarView, Theme]
  - id: map-all-categories
    platforms:
      android: { reachable_from: [discover] }
      ios:     { landing_after_onboarding: true,
                 elements: [map, button:"All categories"] }
    uses_components:
      android: [MapScreen, MapStyle, MerchantMarker, Tokens.Brand]
      ios:     [MapView, MapStyle, MerchantMarker, Theme]
  - id: merchant-detail
    elements: [hero-image, about, what-they-offer, what-they-say]
    scroll_required: true
    iOS_uses_sheet: true
    uses_components:
      android: [MerchantDetailScreen, HeroImage, AboutBlock, FavoriteToggle, Tokens.Brand]
      ios:     [MerchantDetailView, HeroImageView, AboutBlock, FavoriteToggle, Theme]
  - id: saved-list
    reachable_from: [discover, merchant-detail]
    uses_components:
      android: [SavedListScreen, MerchantCard, EmptyState, Tokens.Brand]
      ios:     [SavedListView, MerchantCardView, EmptyState, Theme]

flows:
  - id: launch-and-onboard-android
    role: anon
    platform: android
    template: /Users/ecodia/.code/locals-shared/tests/e2e/flows/01-launch-and-onboarding.yml
    detectors: [D1, D2, D3, D11]
    walks_surfaces: [splash, onboarding-1, onboarding-2, onboarding-3, discover]
  - id: merchant-detail-anon
    role: anon
    template: /Users/ecodia/.code/locals-shared/tests/e2e/flows/03-merchant-detail-anon.yml
    detectors: [D1, D7, D10, D11]
    walks_surfaces: [discover, merchant-detail]
  - id: save-merchant
    role: customer-authed
    template: tests/e2e/flows/04-save-merchant.yml
    detectors: [D1, D2, D6, D11]
    walks_surfaces: [merchant-detail, saved-list]

persistence:
  - claim: "completed onboarding does not re-show after kill+launch"
    fires_after: launch-and-onboard-android
    probe: { kill: true, relaunch_clear_state: false,
             expect_landing_surface: discover }
  - claim: "favourites survive cold restart"
    fires_after: save-merchant
    probe: { kill: true, relaunch_clear_state: false,
             expect_visible_in: saved-list }

back_stack:
  - from: saved-list
    press: back
    expect_landing: discover         # the bug from 2026-06-09 - codified
```

### Worked example: Coexist (Capacitor)

Lives at `/Users/ecodia/.code/coexist/.release-walker/spec.yml`.

```yaml
app: coexist
shape: capacitor
platforms: [ios, android]
artifact_dir: ${ARTIFACT_DIR}

roles:
  - id: anon

surfaces:
  - id: launch
    elements: [button:"Sign in", button:"Continue"]
    uses_components: { web: [LaunchPage, PrimaryButton, Tokens] }
  - id: signup
    elements: [input:email, input:password, button:"Create account"]
    form: signup
    uses_components: { web: [SignupPage, FormInput, PrimaryButton, Tokens] }
  - id: signin-prompt
    elements: [button:"Sign in", button:"Skip"]
    uses_components: { web: [SigninPromptPage, PrimaryButton, SecondaryButton, Tokens] }

flows:
  - id: launch-and-signin-prompt
    role: anon
    platform: android
    template: /Users/ecodia/.code/coexist/tests/01-launch-and-signin-prompt.yml
    detectors: [D1, D2, D11]
    walks_surfaces: [launch, signin-prompt]
  - id: signup-surface
    role: anon
    platform: android
    template: /Users/ecodia/.code/coexist/tests/02-signup-surface.yml
    detectors: [D1, D6, D11]
    walks_surfaces: [signin-prompt, signup]

forms:
  - id: signup
    on: signup
    fields: [email, password]
    submit_label: "Create account"
    expect: { surface: post-signup-landing, within_ms: 6000 }
    capacitor_input_via: coord_tap   # MANDATORY per maestro-tapon-by-text doctrine

persistence: []
back_stack: []
```

---

## 6. DIFF-WALK: SYMBOL-PROPAGATING IMPACT GRAPH

This is the substantive new mechanism. `/diff-walk <app>` walks only the surfaces a code change actually impacts, but propagates through the dependency graph so a change to a centralised component re-walks every consumer.

### Algorithm

```
INPUT: <app>, git base (default HEAD~1 or last-green sha from status_board)

1. CHANGED_FILES   = git diff --name-only <base> HEAD
2. CHANGED_SYMBOLS = parse each changed file, extract exported symbols
                     (Kotlin: top-level fun/class/object/val; Swift: public/internal types;
                      TS/Vue: exported components/types/tokens)
3. EXPANDED        = CHANGED_SYMBOLS + transitive closure via grep:
                     for each symbol S in CHANGED_SYMBOLS:
                       for each import of S in repo:
                         the importing file's exported symbols join CHANGED_SYMBOLS
                       cap closure depth at 3 (pragmatic - design-token-deep changes
                       blow out to full-walk anyway, which is what we want)
4. IMPACTED_SURFACES = { surface IN spec.surfaces
                         WHERE any(s.uses_components) INTERSECTS EXPANDED }
5. IMPACTED_FLOWS    = { flow IN spec.flows
                         WHERE any(f.walks_surfaces) INTERSECTS IMPACTED_SURFACES }
6. RUN flows in IMPACTED_FLOWS (full detector set per flow)

If IMPACTED_FLOWS covers > 60% of all flows -> upgrade to full walk
                                               (token threshold; cheaper to just full-walk)
```

### Falls back to full walk

- Token / brand / theme changes (everything imports `Tokens`) -> full walk.
- Spec changes -> full walk (the contract moved).
- Walker self changes -> full walk (regression discipline).
- Closure depth 3 reached on every leaf -> full walk (too entangled to slice).

### Example: change to centralised `<FormInput>` in Coexist

```
CHANGED_FILES   = [coexist/src/components/FormInput.vue]
CHANGED_SYMBOLS = [FormInput]
EXPANDED        = [FormInput, SignupPage, LoginPage, SettingsPage, ProfileEditPage]
                  (all files that `import FormInput` -> their exported page components)
IMPACTED_SURFACES = surfaces whose uses_components.web includes any of EXPANDED
                  = [signup, login, settings, profile-edit]
IMPACTED_FLOWS  = flows that walk any of those surfaces
                  = [signup-surface, login-flow, settings-edit, profile-edit-flow]
```

Walker walks all four flows. The change to one component is verified across every surface that consumes it.

### Implementation

`lib/impact-graph.sh` exposes:

```bash
impact_graph <app> <base-sha> -> emits IMPACTED_FLOWS as JSON array
```

It uses ripgrep for the import-closure search and `yq` over the spec for the surface/flow projection. Cap on recursion depth is hard-coded at 3.

---

## 7. WALKER ENUMERATION STRATEGY

Unchanged from the prior synthesis (this layer is platform-mechanical and Tate's constraints didn't touch it). Four shapes, four enumeration paths. Walker detects platform shape on first attach.

### 7a. Native iOS (SwiftUI) - `idb ui describe-all`

```bash
UDID=$(xcrun simctl list devices booted -j | jq -r '.devices[][] | select(.state=="Booted") | .udid' | head -1)
idb ui describe-all --udid "$UDID" > /tmp/ui.json
jq '[.. | objects | select(has("AXFrame")) | {label: (.AXLabel // .AXValue), role: .type, frame: .AXFrame}]' /tmp/ui.json > /tmp/elements.json
```

Enumerate by **role + visible frame, never class name**. Toggle handle hint = `frame.x + frame.width - 24` (iOS-26 point-tap rule).

### 7b. Native Android (Jetpack Compose) - `uiautomator dump`

```bash
adb -s emulator-5554 shell uiautomator dump /sdcard/ui.xml
adb -s emulator-5554 pull /sdcard/ui.xml /tmp/ui.xml
xmlstarlet sel -t -m '//node[@bounds and (@text!="" or @content-desc!="" or @resource-id!="")]' \
  -v '@bounds' -o '|' -v '@text' -o '|' -v '@content-desc' -n /tmp/ui.xml
```

**Ignore `clickable` attribute** (Compose lies). Tappability = `bounds + (content-desc OR text OR resource-id)`.

### 7c. Capacitor Android (WebView) - CDP via `adb forward`

```bash
SOCK=$(adb -s emulator-5554 shell cat /proc/net/unix | awk -F'@' '/chrome_devtools_remote/ {print $2}' | head -1)
adb -s emulator-5554 forward tcp:9223 localabstract:"$SOCK"
WS=$(curl -s http://127.0.0.1:9223/json | jq -r '.[] | select(.type=="page") | .webSocketDebuggerUrl' | head -1)
```

**Discriminating rule:** for Capacitor inputs that need the IME, tap via `adb shell input tap <px> <py>` - NOT CDP `Input.dispatchMouseEvent`. CDP is for enumeration + state; OS input is for keyboard work. Codified in doctrine `maestro-tapon-by-text-misses-capacitor-webview-input-use-coord-tap`.

### 7d. Capacitor iOS (WKWebView) - `ios-webkit-debug-proxy`

```bash
brew install ios-webkit-debug-proxy
ios_webkit_debug_proxy --config='null:9221,:9222-9322' &
curl -s http://localhost:9221/json | jq '.[] | select(.deviceId | startswith("SIM"))'
```

**iOS-26 sheet single-poll discipline** applies: `DOM.getDocument` counts as polling, so `.sheet(isPresented:)` dismisses on the second call. **One AX read per surface, then screenshot, then act.** No re-reads.

---

## 8. FINDINGS PIPELINE (REPLACES NOTIFICATION ROUTER)

Per Tate's constraint #2 + #6: the SMS, email, and digest channels are all out. The conductor IS the loop.

### What the walker writes

Every walker run writes:

1. **One run-summary row** to `status_board`:
   - `id`: `walker:<app>:<sha>`
   - `entity_type`: `task`
   - `priority`: 3 (if all GREEN) or 2 (if any non-GREEN)
   - `status`: terminal - `green` / `findings` / `walker_crashed`
   - `next_action_by`: `ecodiaos` (if findings) or `tate` (only if walker itself crashed - rare)
   - `notes`: one-line summary + run-id + artifact dir

2. **One per-finding row** for each non-GREEN detector hit:
   - `id`: `walker:<app>:<sha>:<finding-id>`
   - `entity_type`: `task`
   - `priority`: 2
   - `status`: `open`
   - `next_action_by`: `ecodiaos`
   - `notes`: spec line | observed | artifact path (PNG + AX dump)

3. **One Neo4j Episode** per run:
   - `type`: `conductor_observed`
   - terse - counts of GREEN / AMBER / RED + spec sha + walker sha.

### What the conductor does

On the next turn after a walk, or at session start (status_board P1/P2 sweep is already in the SessionStart hook), the conductor sees the priority=2 walker rows. For each:

1. Read the row notes + the artifact PNG + AX dump.
2. Judge: real defect, walker false positive, or spec wrong.
3. If real defect: fix in app code, re-run `/release-walk <app>`, expect GREEN.
4. If walker false positive: schedule a walker-self-improvement worker via `scheduler.delayed` (per Section 9 allowed list).
5. If spec wrong: edit the spec, re-run.

The conductor closes the row in the same turn it acts. Status board hygiene reflex applies (already a 0th-class doctrine).

### What is deleted

- The notification router.
- SMS escalation, SMS close-the-loop, SMS daily digest.
- Email channel entirely.
- The `notification_channels:` spec field.
- The Mac-asleep wake protocol.
- The daily 0800 digest cron.
- The `kv_store.tate_overseas_until` toggle.

---

## 9. SAFETY BOUNDARIES

### Allowed without sign-off

- Run the walker on any owned device (sims, emulators named `walker-*`).
- Write `status_board` rows in the `walker:*` namespace.
- Write Neo4j Episodes.
- Conductor reads walker findings and fixes app code in normal chat flow.
- Conductor schedules walker-self-improvement workers (lib/, detectors/, spec authoring) via `scheduler.delayed` under the existing dispatch-fact-gate.

### Hard-denied

- **The walker NEVER edits the app under test.** Only the conductor (in chat) edits app code, having read the finding and judged it.
- **No SMS, no email** from the walker. Ever.
- The walker NEVER pushes to a client repo.
- The walker NEVER touches `git push --force` or `pm2 delete`.
- The walker NEVER bypasses `dispatch-fact-gate`.

The wake protocol, overseas-resilience path, and Tate-escalation channel are all removed. The conductor is the loop.

---

## 10. TRIGGER SURFACE

### Skills

Two:

```
/release-walk <app> [--platform=ios|android|both] [--depth=smoke|full]
/diff-walk <app> [--vs=last-green|HEAD~1|<sha>]
```

- `/release-walk` = full walk per Tate's constraint ("full walk on releases").
- `/diff-walk` = symbol-propagating impact walk per Section 6 ("diff on pushes").

Skill location: `~/.claude/skills/release-walker/SKILL.md` and `~/.claude/skills/diff-walker/SKILL.md`. The skill is a thin launcher that runs `bin/release-walk.sh` or `bin/diff-walk.sh` and reports the run-id.

Execution context choice in the skill body:
- **Smoke depth or diff-walk** under ~3 minutes -> foreground in the conductor's turn.
- **Full depth** -> `scheduler.delayed` with `delay: "in 1m"` so the conductor stays responsive. The scheduler poller fires a worker tab on the laptop-agent. Worker brief carries spec path + run-id + verify gate (run completes + at least one row written + `coord.signal_done` + `coord.close_my_tab`).

### Reflex hook

`UserPromptSubmit` hook, tight regex. The hook NUDGES the conductor; it does NOT block.

File: `.claude/hooks/release-walker-reflex.js`. Trigger regex:

```
\b(ship|release|push to (testflight|asc|play|the store)|submit (the build|to (testflight|review|play))|cut a (build|release)|go live|deploy to (prod|production)|tag a release)\b
```

Does NOT match: bare "push", bare "deploy", bare "build".

Injection on match (system-reminder, conductor-only):

```
[release-walker-reflex] Detected ship/release intent for <app-inferred-from-cwd-or-prompt>.
Before any rebuild/sign/upload step, run /release-walk <app>.
Skip ONLY if status_board has a `walker:<app>:<sha>` row younger than 30 minutes
with status=green for the current HEAD sha.
Recent walker rows for this app: <inline status_board.query result>
```

The hook does the status_board query itself and inlines the evidence so the conductor does not double-walk.

There is also a **diff-walk nudge** on `PostToolUse` for `Edit`/`Write` against tracked app files: if the cumulative diff since the last walker run touches >5 files, inject a reminder to run `/diff-walk <app>`. Cheap, conductor-only, ignorable.

---

## 11. BUILD ORDER

### Phase 1 - Walker walks Locals Android end-to-end, conductor reads findings

**Deliverables:**
- `backend/scripts/release-walker/` skeleton + `bin/release-walk.sh` + `bin/spec-registry.sh` + `lib/boot-device.sh` + `lib/enumerate-android-native.sh` + `lib/capture.sh` + `lib/verdict.sh`.
- Detectors `d1-surface-absence.sh`, `d2-surface-unreachable.sh`, `d5-nav-loop.sh`, `d10-scroll-mechanism.sh`, `d11-crash.sh`.
- `/Users/ecodia/.code/locals-shared/.release-walker/spec.yml` (full schema, Android-only initially).
- `~/.claude/skills/release-walker/SKILL.md`.
- Three doctrine files already codified (iOS-26 sheet single-poll, SwiftUI toggle point-tap, Capacitor input coord-tap).

**Wipe (in same phase, before substrate ships):** the audit's `wipe` list (boot-simulators, ensure-avd-pool, serial-for, run-flow, seed-test-db, app-config, visual-review, init-app-tests, ecodia-test, coverage-discover, network-profile, write-substrate, registered-apps, templates, parallel-chat-collision pattern, android-emulator-foreground-preflight pattern, ~20 assertion-pass YAMLs).

**Acceptance:** `/release-walk locals --platform=android` writes one run-summary row + zero-or-more per-finding rows to status_board. Conductor on next turn sees rows, reads artifacts, judges. End-to-end loop closes on at least one real finding (either fixed in app code or marked walker false-positive with spec adjustment).

### Phase 2 - iOS + Capacitor enumeration + diff-walk

**Deliverables:**
- `lib/enumerate-ios-native.sh`, `lib/enumerate-capacitor-android.sh`, `lib/enumerate-capacitor-ios.sh`.
- `lib/tap.sh` with the platform-aware switch.
- `lib/impact-graph.sh` per Section 6.
- `bin/diff-walk.sh` + `~/.claude/skills/diff-walker/SKILL.md`.
- Detectors D3, D4, D6, D7, D8 added.
- Specs at `.release-walker/spec.yml` in coexist, glovebox, goodreach repos with `uses_components:` populated.

**Acceptance:** `/release-walk locals --platform=both` walks both stacks. `/release-walk coexist` walks the Capacitor stack. `/diff-walk locals --vs=HEAD~1` correctly walks only the impacted flows for a synthetic centralised-component change (e.g. edit MerchantCard.kt and verify all three card-consuming flows fire).

### Phase 3 - Reflex hooks + D9

**Deliverables:**
- `.claude/hooks/release-walker-reflex.js` (UserPromptSubmit, tight regex).
- `.claude/hooks/diff-walk-nudge.js` (PostToolUse on Edit/Write).
- D9 (disabled-state) added with vision-anchored discipline.

**Acceptance:** Reflex hook fires on every ship-intent prompt, stays silent on every non-ship prompt. Diff-walk nudge fires after >5 Edit/Write tool uses against tracked app code. D9 catches a real disabled-state bug on a flow Tate has flagged.

---

## 12. EXIT CRITERIA

"Conductor trusts this enough to use as the default pre-ship gate" = ALL of:

1. **Stability:** 14 consecutive days where every walker invocation reaches a terminal status (green / findings / walker_crashed). Measured by status_board row completeness - every `walker:*:*` row in the window has a terminal status.

2. **Zero false-positive escalations:** an escalation is "false" if the conductor judges the finding "not a real defect, spec was wrong". Target: <=1 per app per 14 days. >1 fails the bar; spec discipline tightens.

3. **All four apps covered:** Locals (both platforms), Coexist, Glovebox, Goodreach all have committed specs at `<repo>/.release-walker/spec.yml` and at least one GREEN run in the trailing 7 days.

4. **Reflex hook proven:** ship-intent regex has fired >=10 times in the trailing 14 days; in every case the conductor either ran the walker or had a recent GREEN row to skip on. No "conductor said ship and walker did nothing" incidents.

5. **Diff-walk propagation proven:** at least 3 instances where a centralised-component change correctly triggered diff-walk of every consuming surface (logged via the impact-graph evidence line in status_board notes).

6. **No code touched on apps by the walker:** zero walker-originated diffs in app repos in the trailing 14 days. Confirms the safety boundary held.

When all six are GREEN, the walker is promoted from drafts/ to canonical doctrine. The reflex hook stays on permanently.

---

## END

SMS, email, Routines, cloud execution, and wake protocols are all out. The Mac is awake. The conductor is the judge. The walker is the tool. That is the design.
