---
triggers: gui-recipe, recipe-authoring, recipe-optimisation, recipe-verification, ui-automation-recipe, fast-path-recipe, gui-flow-codify, end-to-end-timing, baseline-before-tune, programmatic-mutation-primary, pixel-click-fallback, enum-tree-before-guessing-coords, probe-for-state, fixed-sleep-vs-probe, failed-attempts-must-be-codified, gui-anatomy, recipe-anatomy, gui-fast-path, recipe-index
---

# GUI recipes - authoring, optimisation, and verification

GUI work is a first-class capability surface for EcodiaOS - driving Tate's Chrome on Corazon, the SY094 RDP, desktop apps (Xcode, Cursor, Teams, Discord), and login-walled web SaaS UIs through Cowork. As the GUI surface expands, recipes are how we keep procedures fast, reliable, and maintainable.

This doctrine governs how recipes are authored, optimised, and verified. It is the meta-pattern for the recipe library; individual recipes (e.g. `sy094-gui-entry-via-desktop-rdp-shortcut.md`) are the worked instances.

## What counts as a recipe

A recipe is a codified procedure for a specific end-to-end GUI flow. It has:

- A clear trigger condition (when to run it)
- Pre-flight prerequisites (creds, state, foreground assumptions)
- A verified coordinate table for load-bearing UI elements
- A step-by-step procedure with verification at each step
- An optimised fast-path checklist with verified end-to-end timing
- Documented failure modes and anti-patterns

Recipes live as their own files in `~/ecodiaos/patterns/` with descriptive `triggers:` frontmatter so they surface when relevant. Examples currently in the library:

- `sy094-gui-entry-via-desktop-rdp-shortcut.md` - MacInCloud RDP open, reach macOS desktop ready (verified 7.9s end-to-end, 4 May 2026, single-shell.shell PowerShell variant)
- `sy094-coexist-ios-release-recipe.md` - Co-Exist iOS release pipeline end-to-end (version-bump → git pull → npm build → cap sync → Xcode Run sim → Archive → Distribute → "Uploaded to Apple"). Verified end-to-end ~10min (4 May 2026 22:50 AEST, Build 1.8(1) Uploaded to Apple), of which ~5min is external Apple-side upload latency. Apple ID auto-resigns from `kv_store.creds.apple.password` per `gui-macro-uses-logged-in-session-not-generated-api-key.md`; no longer L2-Tate-required. Supersedes earlier 48s headless-path version that halted at L2 upload.
- `cowork-conductor-dispatch-protocol.md` - Cowork bounded-step dispatch for web SaaS UIs

More recipes will be added as GUI flows accumulate. Discover via `Grep "triggers:" ~/ecodiaos/patterns/ -A 1 | grep -i <target>`.

## Mandatory recipe anatomy

Every recipe file has these sections, in this order:

1. **Origin** - Tate-verbatim quote + date + initial event that produced the recipe.
2. **When to use this** - the trigger condition for invoking the recipe vs an alternative.
3. **Pre-flight** - kv_store creds, state assumptions, prerequisite tools, foreground requirements (e.g. cowork-no-focus-collision check).
4. **Verified coordinates table** - explicit X/Y/W/H for every load-bearing UI element, dated, with the screen resolution noted.
5. **Step-by-step procedure** - descriptive form, what each step does, why this order.
6. **Verification protocol** - how to confirm each step worked; cite the cheapest reliable tier (see Verification tiers below).
7. **Fast-path checklist** - the optimised cmd-by-cmd run with verified end-to-end target timing.
8. **Speed wins identified** - annotated TODOs for the next optimisation pass.
9. **Failure modes** - what breaks, the symptom, and the fix.
10. **Anti-patterns** - what NOT to do (especially methods that look reasonable but failed in practice).

A recipe missing any of these sections is incomplete. The verification protocol and failure modes sections are particularly load-bearing; without them the recipe is read-only doctrine, not a runnable procedure.

## The 5-step authoring workflow (first run of a new recipe)

1. **Walk before guessing.** Run UI Automation enumeration on the target window or dialog. Get exact `BoundingRectangle` X/Y/W/H for every interactive element. Do not pixel-hunt by trial-and-error.
2. **Identify the programmatic surface.** For each load-bearing element, query its supported patterns: `WindowPattern`, `TogglePattern`, `InvokePattern`, `ValuePattern`, `SelectionPattern`, `ExpandCollapsePattern`. If a pattern is exposed, programmatic mutation is the primary path; pixel-click is the fallback.
3. **Run the recipe live with timing instrumentation.** Bash `date +%s.%N` before and after each phase. Capture a baseline end-to-end time. Numbers, not vibes.
4. **Capture failures explicitly.** When a click misses, when a sleep is too short, when a coord is off, when a programmatic call throws "Unsupported Pattern" - record the symptom, the cause once known, and the working fix. Future-you reads these breadcrumbs before retrying.
5. **Codify the fast-path checklist with verified timings.** Tate-verbatim Origin section, dated. Cross-link from `~/ecodiaos/CLAUDE.md` if high-traffic, or just from the recipe index in this doctrine.

## The 7-step optimisation workflow (iterating an existing recipe)

1. **Measure baseline.** Run the full flow with timing instrumentation. Establish numbers per phase.
2. **Decompose by dominant cost.** Each phase is dominated by exactly one of:
   - **Round-trip latency** (count `input.*` calls; each is ~150-200ms over Tailscale)
   - **Fixed sleeps** waiting for UI render
   - **Computation** (rare in GUI flows)
   - **External service rendering** (network round-trips on the target side, e.g. macOS login auth)
3. **For each phase, identify a substrate switch:**
   - Round-trip dominant → batch consecutive calls into a single `shell.shell` PowerShell using .NET SendKeys / SendInput / UI Automation pattern walks. Five round-trips collapse to one.
   - Fixed-sleep dominant → replace with a state-probe loop (poll for the next-step element to appear, e.g. the macOS login screen's "Enter Name" field). Time-cap the loop with a fallback to fixed-sleep behaviour on timeout.
   - Computation dominant → defer to a fork; do not burn conductor budget.
   - External-render dominant → cannot optimise (this is the floor); note as inherent and move on.
4. **Implement ONE switch at a time.** Verify it works (re-run the recipe end-to-end). Re-measure.
5. **Codify the verified-faster path.** Replace the old checklist line. Document the dropped path with reason in the speed-wins-identified section as `[ATTEMPTED, dropped because ...]`.
6. **Annotate remaining wins as TODOs.** The speed-wins-identified section grows over iterations and serves as the optimisation backlog.
7. **Stop at diminishing returns.** A recipe at 2-5x faster than baseline is typically enough. The last 20% of speed costs disproportionate complexity (e.g. native SendInput batching with manual coordinate tracking) and rarely pays back.

## Verification tiers (cheapest-first)

When confirming a step worked, always prefer the cheapest reliable tier:

| Tier | Method | When to use |
|---|---|---|
| 0 | UI Automation property query (e.g. `WindowPattern.Current.WindowVisualState`, `TogglePattern.Current.ToggleState`) | The target element exposes the pattern. Always prefer this. |
| 1 | UI Automation tree walk filter (e.g. find a window by `ClassName`, find an element by `Name`) | Verify presence/absence of an element. Cheap, structural. |
| 2 | Process check via `process.listProcesses` | Process-level verification (e.g. mstsc.exe still running) |
| 3 | Filesystem check (`filesystem.readFile`, file mtime, dir listing) | When the action mutates disk |
| 4 | Cropped pixel screenshot + visual interpretation | When UI Automation cannot see the state (XAML inside Win32 dialogs sometimes, browser-rendered UIs sometimes) |
| 5 | Full screenshot + visual interpretation | Last resort; expensive to interpret, expensive to render |

If Tier 0 works for a state, never use Tier 4 for that state. Codify the cheapest reliable tier in the verification protocol section. If the only tier that works is 4 or 5, document why - it is a constraint, not a default.

## Recipe maintenance cadence

Recipes drift as upstream UIs change. Each recipe should be re-run end-to-end on a schedule:

- High-leverage recipes (used weekly+): re-verify monthly
- Medium-leverage recipes (used monthly+): re-verify quarterly
- Low-leverage recipes (used rarely): re-verify on first failure when next invoked

Re-verification means: actually run the recipe live, screenshot the result, update the verified-coordinates table date-stamp. If coords drift, update them in-place; do NOT delete the old coords without a `[DROPPED date because ...]` note in the speed-wins section.

## Anti-patterns

- **Authoring coords from imagination.** Coords typed without live observation are wrong, often. See `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.
- **Pixel-click first when UI Automation works.** Walk the tree, find the patterns, prefer programmatic. Pixel-click is the fallback for XAML / DirectComposition / Canvas / browser-rendered controls that UI Automation cannot see.
- **Speeding up before measuring.** No baseline numbers = guessing which phase to optimise. Measure first.
- **Hardcoding rotating values.** Creds, dynamic IDs, time-varying tokens read from kv_store, the API, or `NOW()`. Bake-it-in equals stale-by-tomorrow.
- **Deleting failed-attempt notes when the new path works.** Future-you rediscovers the failure without the breadcrumb. Mark `[ATTEMPTED, dropped because ...]` and keep it.
- **Codifying once and never re-running.** Schedule re-verification per the cadence above.
- **Skipping the verification protocol section.** A recipe without verification is read-only doctrine, not a runnable procedure.
- **Skipping the failure-modes section.** "It worked on my first run" is not enough; future runs will hit edge cases. Capture them as you find them.

## Origin

**Tate verbatim 4 May 2026 20:33 AEST:** "Yeah this is one of the most important flows itself, but its alo a really good time for us to figure out how we can codify the optimisation of recipes as well. YOu'll need to be using gui consistently and as fast as possible. GUI is going to be really important so we need to get the recipes and their creation and optimisation PERFECTLY documented"

Initial worked example: `sy094-gui-entry-via-desktop-rdp-shortcut.md`. The MacInCloud RDP open flow took ~7 minutes on first run (4 May 2026 19:43 AEST) and was codified to 23.6 seconds end-to-end on the second run (4 May 2026 20:24 AEST), an 18× speedup. The discoveries that delivered the speedup were generalisable rather than MIC-specific:

- (a) Walk the UI tree before guessing coords - enumeration takes 2 seconds and gives every load-bearing X/Y/W/H exactly.
- (b) Some XAML controls inside Win32 dialogs are invisible to UI Automation (zero `CheckBox` elements, zero `TogglePattern`); pixel-click is forced for those, but only those.
- (c) The container window often DOES expose `WindowPattern`; programmatic minimise/maximise/restore is far more reliable than pixel-clicking auto-hide controls.
- (d) Round-trip latency dominates GUI flow timing; batching `input.*` calls into single PowerShell `shell.shell` invocations is the highest-leverage substrate switch.
- (e) Fixed sleeps account for most non-RTT time; probe-for-state loops can recover 5-10s per recipe but at moderate complexity cost.

Each of these is now a generalised step in the authoring/optimisation workflows above. They will apply to every future GUI recipe (Apple Developer portal flows, Xcode signing UI, Vercel/Stripe dashboard flows when Cowork is unavailable, native desktop apps).

## Cross-references

- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - the worked example this doctrine is generalised from
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - never codify from imagination; always validate live
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon's full tool surface (input.*, screenshot.*, shell.shell, etc) is what recipes call
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - Chrome-driving subset of GUI recipes
- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` - when Cowork supersedes a hand-rolled GUI recipe (logged-in webapps in Tate's Chrome)
- `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md` - bounded-step dispatch when delegating GUI work to Cowork
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the Anthropic-first check; Cowork supersedes hand-rolled `cu.*` for web UIs
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - verification protocol generalisation; recipes are a worked instance
