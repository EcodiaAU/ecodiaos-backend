---
triggers: gui-recipe, recipe-authoring, recipe-optimisation, recipe-verification, ui-automation-recipe, fast-path-recipe, gui-flow-codify, end-to-end-timing, baseline-before-tune, programmatic-mutation-primary, pixel-click-fallback, enum-tree-before-guessing-coords, probe-for-state, fixed-sleep-vs-probe, failed-attempts-must-be-codified, gui-anatomy, recipe-anatomy, gui-fast-path, recipe-index, computer-use, computer-use-api, vision-grounded-clicks, path-a-vs-path-b, first-run-authoring-driver, recorded-macro-vs-computer-use, anthropic-computer-use-tool, author a gui recipe, write a gui recipe, codify a gui flow, verify a gui recipe, optimise a gui recipe, 10-section recipe, how do i write a recipe, new recipe, document a gui flow
---

> **NOTE — 5 May 2026.** Cowork is deprecated as the primary UI-driving substrate. The substrate selection table below originally listed Cowork as the default first-run driver for logged-in webapp flows. This is superseded by the direct Tailscale laptop-agent path via `input.*` + `screenshot.*` + `shell.shell` composed as macro/GUI recipes. See `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. Cowork-via-Claude-Desktop remains a fallback option for specific hard-to-reach UI surfaces, but is no longer the default.

# GUI recipes - authoring, optimisation, and verification

GUI work is a first-class capability surface for EcodiaOS - driving Tate's Chrome on Corazon, the SY094 RDP, desktop apps (Xcode, Cursor, Teams, Discord), and login-walled web SaaS UIs via the Tailscale laptop-agent. As the GUI surface expands, recipes are how we keep procedures fast, reliable, and maintainable.

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

### Per-step verify is mandatory (6 May 2026 addition)

Section 6 (Verification protocol) above is NOT just an outer "did the recipe work end-to-end" check. Every codified recipe MUST include explicit per-step pre/post-verify probes for each load-bearing step in the procedure. A pre-verify confirms the click target is reachable BEFORE the input fires; a post-verify confirms the action LANDED after. Without per-step verify, recipe drivers chain blind inputs and fail silently when the target window is Z-buried, hidden, or not foreground.

Mandate: every recipe's verification protocol section (or a sub-table inside the step-by-step procedure) MUST list per-step preconditions and postconditions in the format:

| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |
|---|---|---|---|---|

See `~/ecodiaos/patterns/gui-step-verify-protocol.md` for the canonical protocol — sections (A) pre-step verify, (B) post-step verify, (C) time budget, (D) foreground-recovery sub-protocol, (E) cropped visual-diff verification, (F) step-drive loop template. The first worked instance is the per-step verify table in `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` (Step verification protocol section). New recipes must follow that shape; existing recipes must add the per-step table on next re-verification pass.

Origin (6 May 2026, ~5min flail driving the MIC RDP recipe): the recipe's outer verification ("screenshot Finder visible") was correct but never reached because the inner steps chained blindly when Tate held foreground in another app. Pre/post per-step verify catches the Z-buried-dialog failure mode in <500ms; without it the conductor wasted ~5 minutes on chained focus-steal tricks.

## The 5-step authoring workflow (first run of a new recipe)

1. **Walk before guessing.** Run UI Automation enumeration on the target window or dialog. Get exact `BoundingRectangle` X/Y/W/H for every interactive element. Do not pixel-hunt by trial-and-error. **If UIA returns nothing for the load-bearing controls (XAML / Canvas / DirectComposition / browser-rendered): switch first-run authoring driver to Computer Use (Path B) instead of conductor verify-then-click — see substrate selection below.**
2. **Identify the programmatic surface.** For each load-bearing element, query its supported patterns: `WindowPattern`, `TogglePattern`, `InvokePattern`, `ValuePattern`, `SelectionPattern`, `ExpandCollapsePattern`. If a pattern is exposed, programmatic mutation is the primary path; pixel-click is the fallback.
3. **Run the recipe live with timing instrumentation.** Bash `date +%s.%N` before and after each phase. Capture a baseline end-to-end time. Numbers, not vibes.
4. **Capture failures explicitly.** When a click misses, when a sleep is too short, when a coord is off, when a programmatic call throws "Unsupported Pattern" - record the symptom, the cause once known, and the working fix. Future-you reads these breadcrumbs before retrying.
5. **Codify the fast-path checklist with verified timings.** Tate-verbatim Origin section, dated. Cross-link from `~/ecodiaos/CLAUDE.md` if high-traffic, or just from the recipe index in this doctrine.

## First-run authoring substrate selection (Path A vs Path B vs UIA)

GUI flows have three viable first-run authoring drivers. Pick by target characteristic; do not default to the slowest path (conductor verify-then-click) just because it is always available.

| Driver | When to use first-run | Codified output | Cost / latency |
|---|---|---|---|
| **UI Automation tree walk + pattern mutation** (Tier 0/1) | Target exposes UIA properties for every load-bearing element | Recipe with programmatic-mutation primary, pixel-click fallback | Free, ~50-100ms per click |
| **Path B — Anthropic Computer Use API** | Target has XAML/Canvas/DirectComposition/browser-rendered controls UIA cannot see, AND flow is novel (no recorded macro yet exists) | Click sequence captured during the validated run; Phase 3 of the Computer Use spec auto-exports to a Path A recorded macro | ~$0.02-0.10/click on Sonnet 4.6, ~3-8s per turn |
| **Path A — recorded macro (Path A)** | Recipe is already validated end-to-end; we are encoding the proven sequence for fast replay | Single-shell PowerShell / shell script with batched action sequence | Free, ~50ms per click batched |
| **Conductor verify-then-click** (Tier 5) | Fallback when Computer Use is unavailable (rate-limited, cost-capped, beta header rejected) | Should not be codified — it is the slow default we are trying to replace | ~$0.10-0.20/click and 3+ screenshots per click |

**Default first-run driver for novel desktop / RDP flows:** Path B (Computer Use). Validated runs auto-export to Path A for next-time replay (per Phase 3 of the Computer Use integration spec).

**Default first-run driver for novel logged-in webapp flows:** Direct Tailscale laptop-agent (`input.*` + `screenshot.*` + `shell.shell`) per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. The Cowork path (Claude Desktop dispatch) is a fallback when the direct path encounters an accessibility-tree wall.

**Default replay driver for any validated recipe:** Path A (recorded macro). Always faster than re-invoking Computer Use.

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
| 4-α | Anthropic Computer Use API vision-grounded element identification (`computer_20251124` tool, optional `zoom` action) | When UI Automation cannot see the state AND the conductor's own vision is unreliable on small/dense targets. Sends the screenshot to a Claude model trained against the computer-use action vocabulary; model returns precise click coordinates (and can `zoom` into a region for detail). ~3-8s and ~$0.02-0.10 per call. Cheaper and faster than the conductor's verify-then-click loop on novel/dense UIs; more expensive than tiers 0-4 on simple targets. See `~/ecodiaos/drafts/computer-use-api-integration-spec-2026-05-04.md`. |
| 5 | Full screenshot + visual interpretation by the conductor (verify-then-click loop) | Last resort; expensive to interpret, expensive to render, slowest of all tiers because each click usually takes 3+ screenshots to land. Use only when no other tier is wired or when Computer Use is rate-limited / cost-capped. |

If Tier 0 works for a state, never use Tier 4 for that state. Codify the cheapest reliable tier in the verification protocol section. If the only tier that works is 4-α or 5, document why - it is a constraint, not a default.

**Tier 4-α placement reasoning:** Computer Use lives between cropped pixel screenshot (Tier 4) and full conductor verify-then-click (Tier 5) because (a) it operates on screenshots so it inherits Tier 4's "no UIA available" precondition, (b) it is meaningfully cheaper and more reliable than the conductor's own visual interpretation (Tier 5), and (c) it is meaningfully more expensive than a tight cropped pixel match. It is the right substrate when UIA fails AND the target is novel or dense enough that conductor-vision is the actual bottleneck.

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
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - the canonical step-verify protocol (pre/post-verify, time budgets, foreground-recovery tiers, cropped visual-diff, step-drive loop template) that all recipes must implement. Added 6 May 2026 after the MIC RDP drive flail.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - never codify from imagination; always validate live
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon's full tool surface (input.*, screenshot.*, shell.shell, etc) is what recipes call
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - Chrome-driving subset of GUI recipes
- `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` - replacement doctrine: Tailscale laptop-agent via `input.*` + `screenshot.*` + `shell.shell` is now the default UI-driving substrate (supersedes Cowork)
- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` - [DEPRECATED] historical reference for the Cowork-as-primary era
- `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md` - [DEPRECATED] bounded-step dispatch protocol for Cowork; historical reference
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the Anthropic-first check; Computer Use is the canonical answer for desktop / RDP / OS-level driving (analogue to Cowork for webapps)
- `~/ecodiaos/drafts/computer-use-api-integration-spec-2026-05-04.md` - Computer Use API integration spec (Path B as first-run authoring driver, auto-export to Path A recorded macro for replay, drift detection via re-fall-back to Computer Use)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - verification protocol generalisation; recipes are a worked instance
- `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` - v1 capture substrate (Win-builtin Problem Steps Recorder MHTML parser) that emits 10-section recipes via the shared `recipe-emitter.js` library. Use for quick captures where pixel coords aren't required.
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` - v2 capture substrate (AHK + UIA + Anthropic vision pass) that emits 10-section recipes via the shared `recipe-emitter.js` library. Use for high-fidelity captures (raw X/Y, modifier state, UIA selectors) and as the foundation for autonomous release recipes.
