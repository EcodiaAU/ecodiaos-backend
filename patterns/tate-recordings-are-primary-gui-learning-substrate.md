---
triggers: tate-recordings, gui-learning, capacity-expansion, ctrl-shift-r, macro-record-mode, phase-2-macro, record-not-perform, tate-available-window, gui-flow-codification, learn-by-watching-tate, demonstration-by-tate, tate-keyboard-time, capture-the-flow, record-the-flow, tate-at-keyboard, recording-vs-performing, learn-gui-from-tate, tate-teach-gui, recordings-teach-me-gui
---

# Tate-recordings are the primary GUI-learning substrate while he is available

While Tate is at the keyboard, the highest-leverage capacity-expansion ask is "record this flow", not "do this flow for me." A recording becomes a permanent macro the conductor can call with `macro.run({name})` forever. Performing the flow on Tate's behalf, or asking Tate to describe it in chat, produces work that disappears the moment Tate stands up. This file is the rule that future cold-start sessions must hit before they default to the disposable-help posture.

The asymmetry is severe. A 30-second flow recorded once becomes ~0-second on every future call. The same 30-second flow performed via 15 chat round-trips burns Tate's attention every time, never compounds, and dies with the session. Treat every Tate-at-keyboard window as one-shot capacity expansion: the macros recorded today are how every future session is faster.

## The rule

When Tate is at the keyboard and a GUI flow is needed (any web SaaS UI, any desktop app, any multi-step authenticated path), the default is:

1. Tell Tate which macro name to record.
2. Tate hits Ctrl+Shift+R on Corazon.
3. Tate performs the flow with his hands.
4. Tate says "stop" (or hits Ctrl+Shift+R again).
5. Recorder writes a raw session directory on Corazon at `D:\.code\macro-recordings\<session-id>\` containing `events.jsonl` + `manifest.json` + `frames\` (pre/post screenshots per event). `<session-id>` is auto-generated, format `YYYY-MM-DD-HHMM-<6-char-slug>`.
6. Conductor pulls the session directory to the VPS (via `filesystem.readFile` per file, or `shell.shell` `Compress-Archive` then `filesystem.readFile` of the zip).
7. Conductor runs `node ~/ecodiaos/macros/parsers/recording-to-recipe.js <session-dir> <flow-slug>`. The joiner stitches events + UIA + vision-enrichment, the emitter produces a 10-section markdown recipe at `~/ecodiaos/macros/captures/<flow-slug>-<YYYY-MM-DD-HHMM>.md` with frontmatter `status: untested_spec`.
8. Conductor reviews the emitted recipe, smoke-tests it (replay end-to-end against the live UI).
9. On a clean replay, conductor flips frontmatter to `status: validated_v1` and (when the destination is high-leverage / reusable) promotes the file to `~/ecodiaos/patterns/<flow-slug>-recipe.md`. There is NO `macro.promote(...)` API and NO `registry.json` - promotion is a deliberate edit + git commit, governed by `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.

After promotion the flow is callable forever. Every subsequent session reaches the same destination by reading the recipe and replaying it.

## Mechanic (substrate, shipped 6 May 2026)

- Hotkey: `Ctrl+Shift+R` on Corazon. Toggle (start, then again to stop).
- Two paired versions live side by side, both emit through `~/ecodiaos/macros/lib/recipe-emitter.js`:
  - **v1 (psr.exe wrapper):** Win-builtin Problem Steps Recorder. Captures UIA element name + screenshot only, no raw X/Y. Raw .mht lands at `~/ecodiaos/macros/captures/_raw/<slug>-<ts>.mht` after pull from Corazon. Parser at `~/ecodiaos/macros/parsers/psr-exe-to-recipe.js`. Detail in `~/ecodiaos/patterns/macro-capture-via-psr-exe.md`.
  - **v2 (custom OS hook recorder):** AHK + UIA + per-event vision-language enrichment via Anthropic claude-sonnet-4-7. Recorder source: `D:\.code\eos-laptop-agent\macros\macro-recorder.ahk`. Output: `D:\.code\macro-recordings\<session-id>\events.jsonl` + `manifest.json` + `frames\`. Captures raw X/Y, modifier state, UIA selector, foreground app + window title, and a vision description per event. Glue at `~/ecodiaos/macros/parsers/recording-to-recipe.js`. Detail in `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md`.
- Emitted recipe: a 10-section markdown file per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` (origin, when-to-use, pre-flight, verified coords table, step-by-step, verification protocol, fast-path checklist, speed wins, failure modes, anti-patterns), frontmatter `status: untested_spec`, written to `~/ecodiaos/macros/captures/<flow-slug>-<YYYY-MM-DD-HHMM>.md` until reviewed and promoted. There is NO `proposed/` directory and NO .js handler files - emitted recipes are markdown.
- Promotion is conductor work, fork-dispatched per `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md`. The fork reads the captures/ recipe, runs the smoke replay, edits coords/triggers if needed, flips frontmatter to `status: validated_v1`, and (for high-leverage destinations) moves the file to `~/ecodiaos/patterns/<flow-slug>-recipe.md` via git mv + commit. There is NO `macro.promote(...)` API surface; promotion is a manual edit-and-commit gate.

## Do

- DO ask Tate to record any GUI flow he is about to perform on my behalf, BEFORE he performs it. The 5-second overhead of starting a recording is the entire price of permanent codification.
- DO scope each recording to a single named destination. `stripe-dashboard-charges`, `appstoreconnect-team-id`, `coexist-admin-leaders`. One recipe per destination.
- DO review the produced recipe before promoting. The recipe is `untested_spec` until smoke-tested. Promotion without verification is the same failure shape as approving a Factory commit blind.
- DO prefer recording over hand-coding for any new flow once Phase 2 is shipped. Hand-coding is for flows where Tate is not available and the macro is needed now.
- DO log every `macro.run` call. Phase 3 (auto-author from runs) cannot work without a clean runs corpus.
- DO surface this rule on cold-start orientation when `<perception_summary>` shows Tate is active and a GUI task is pending.

## Do NOT

- DO NOT ask Tate to perform a multi-step authenticated GUI flow without simultaneously asking him to record it. That session's work disappears the moment Tate stands up. Burn the small overhead every time.
- DO NOT auto-promote a recording. The conductor reviews and smoke-tests; promotion is a deliberate act.
- DO NOT record flows that include credential entry without the password-redaction guard (see `macros-record-mode-and-auto-author-from-runs.md`). A leaked password in a stored macro is a real risk.
- DO NOT treat "Tate described the flow in chat" as equivalent to "the flow is recorded." Description is conversation; recording is a substrate write that survives the session.
- DO NOT skip the recording when the flow is "trivially short." Three steps recorded once beats three steps re-derived every cold-start.

## When Tate is away

No new recordings are possible (the hotkey lives on Corazon, Tate's hands are required). The available paths are:

1. Existing macros via `macro.run` (preferred when the destination is already covered).
2. Hand-coded handlers in Factory or fork (Phase 1 path) when the flow is needed now and no recording exists.
3. Defer the flow to the next Tate-at-keyboard window if it is non-urgent.

The wrong move while Tate is away: spinning a chain of `input.*` + `screenshot.*` calls to manually walk through a flow that should have been recorded the last time Tate was at the keyboard. That is a missed Phase 2 opportunity, not a Phase 1 win.

## Anti-pattern (the recurring failure mode)

A future session sees Tate is at the keyboard and a GUI task surfaces (e.g. "log into Stripe and update a webhook"). The default reflex is to drive the flow via chat: "Tate, can you open Stripe and click the webhooks tab?" That session's work expires when Tate stands up. The right reflex is: "Tate, hit Ctrl+Shift+R, name it `stripe-webhooks-update`, do the flow, then `macro.run` it forever after." Same five seconds of Tate's time, infinitely more durable artefact.

## Origin

Tate, 6 May 2026 ~19:17 AEST verbatim: "we'll get back to the recordings i do to teach you (if you arent sure what that is, it needs to be very very highly codified as your way of learning gui while im available and how it works"

Context: Phase 2 of the macro doctrine substrate landed earlier the same day via `fork_motmiokr_ed2e9c` (manager fork, 5 worker sub-forks). Both v1 (psr.exe wrapper) and v2 (custom OS hook recorder) are shipped and emit through the shared recipe-emitter. The doctrine had been authored at `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` but was not yet surfaced as a Core Operating Doctrine subsection in `~/CLAUDE.md`. Tate's instruction is to codify the recording-vs-performing default very high so that cold-start sessions hit the rule before they default to disposable chat-driven help.

The codification lands as a Core Operating Doctrine subsection in `~/CLAUDE.md` between the Fork-pending-work-at-session-start subsection and the Full-permission-means-execute-the-outcome subsection. Order matters: the rule is absolute on cold-start when Tate is at the keyboard.

## Cross-references

- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` - the parent doctrine. Phase 1 (hand-coded), Phase 2 (Tate-records), Phase 3 (auto-author from runs). This file is the very-high-codification of the Phase 2 default.
- `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` - v1 substrate detail.
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` - v2 substrate detail.
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - 10-section recipe anatomy that the recording emitters produce.
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` - promotion review is fork work, not main work.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - sibling rule: a recipe is `untested_spec` until smoke-tested. Promotion without verification is the failure mode this guard prevents.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - the codification protocol this file follows. Tate stated the rule at 19:17 AEST on 6 May 2026; the three writes (pattern file, INDEX.md, CLAUDE.md cross-ref) land in the same fork window.
