---
triggers: macro-capture, psr-exe, problem-steps-recorder, mhtml-parser, gui-flow-capture, recipe-from-recording, win-builtin-capture, quick-capture-flow, steps-recorder, capture-via-psr, psr-exe-to-recipe, v1-capture, fast-capture-windows
---

# Macro capture via psr.exe (Windows Problem Steps Recorder)

`psr.exe` is the Microsoft-shipped Problem Steps Recorder, present on every Windows install since Vista. It captures the user's input stream as a sequence of "steps" with screenshots, descriptive text, and UI Automation element names, and serializes the result as an MHTML document inside a .zip. Pairing psr.exe with a small parser + the shared recipe-emitter library gives EcodiaOS a quick path from "Tate (or the conductor) ran a flow once" to "10-section GUI recipe at `untested_spec` ready for replay validation".

This is the v1 of the macro-capture system. v2 (custom OS-level hook recorder) adds higher-fidelity input capture (raw X/Y, modifier keys, double-click windows, drag distances) and lands in the same shipping wave; v1 is the fast path that requires no custom Win32 code.

The Anthropic-first check passes: psr.exe IS the existing tool. We are not building a parallel screen-input-recording substrate, we are wrapping the one Microsoft ships.

## When to use this

- Tate (or the conductor, in a non-focus-stealing context) wants to record a UI flow once and have a recipe scaffolded automatically.
- The flow is feasible for psr.exe to capture: pure UI interaction inside Windows, no need for sub-pixel timing, no need for raw scroll-wheel deltas, no requirement to capture password fields verbatim.
- The output recipe is allowed to start at `status: untested_spec` (i.e. it is not safety-critical that the codified replay match the recording byte-for-byte; v1 recipes have to pass a real-run validation pass before flipping to `validated_v1`).

## When NOT to use this

- Flow needs raw pixel coordinates for every click (psr captures UIA element name + screenshot but not raw X/Y in standard output). Use v2 (custom hook recorder) instead.
- Flow includes credential entry that must NOT be reproduced literally on replay (psr does record the keystrokes; it redacts only when the field is detected as `type=password` and even then policy varies). Use record-mode in the laptop-agent macro substrate (Phase 2) instead, which has the redaction guard.
- Flow is on macOS / Linux. psr.exe is Windows-only.
- Flow has more than ~100 steps. psr's max-step cap (`/maxsc N`, default 99 in current Win11) will truncate.

## Workflow

```
+------------------+        +-----------+        +-----------+        +---------+
| Run psr.exe      |  zip   | Extract   |  mht   | Parser    |  AST   | Emitter |  md
| /start ... /stop +------->+ to .mht   +------->+ AST + ev  +------->+ 10-sec  +------>
+------------------+        +-----------+        +-----------+        +---------+
                                                                          |
                                                  ~/ecodiaos/macros/captures/<slug>-<ts>.md
                                                  status: untested_spec
                                                  triggers: <auto-built>
```

Practical steps for the conductor:

1. Decide on a `flow-slug` (kebab-case, action-oriented).
2. Trigger the recording (Tate clicks "Start record" in psr GUI on Corazon, OR the conductor invokes `psr.exe /start /output <path> /sc 1 /maxsc 100` from the laptop-agent shell).
3. Tate (or whoever holds the foreground) performs the flow.
4. Stop recording; psr saves a `.zip` containing a `.mht` (and image attachments inlined as MIME parts).
5. Pull the `.mht` to the VPS at `~/ecodiaos/macros/captures/_raw/<slug>-<ts>.mht`.
6. Run: `node ~/ecodiaos/macros/parsers/psr-exe-to-recipe.js <path-to-mht> <flow-slug>`.
7. Output lands at `~/ecodiaos/macros/captures/<flow-slug>-<YYYY-MM-DD-HHMM>.md`.
8. Review; fill in TODOs (Origin quote, When-to-use trigger, Pre-flight creds, per-step verify probes); promote to `~/ecodiaos/patterns/<flow-slug>-recipe.md` once ready.
9. Replay end-to-end against the live UI. On success, flip frontmatter `status: validated_v1`. Per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.

## Limitations (Win11 build 10.0.26100, verified 6 May 2026)

- **psr.exe with `/gui 0` self-terminates immediately.** The recorder loop apparently depends on the GUI message pump. `/gui 1` (default) keeps it alive but shows the recorder window.
- **`/stop` from a separate process invocation does not save without GUI interaction.** On the verified build, headless `psr.exe /stop` from a non-interactive shell exits without writing the output zip. Killing the running psr process via `Stop-Process` likewise produces no output. Reliable save path: Tate clicks "Stop record" then "Save" inside the psr dialog. The conductor can poll for the zip materializing on disk; once it appears, the rest of the pipeline is fully automated.
- **No raw pixel coordinates.** psr records UIA element name + screenshot but the standard output does not include click X/Y. The parser exposes `x` and `y` fields and will populate them if a custom build of psr emits them, but on the standard build expect `x: null, y: null` everywhere. Replay falls back to UIA name-based clicks.
- **Win-only.** Use v2 (custom hook recorder, when shipped) for cross-platform.
- **MHTML can be quoted-printable encoded.** The parser handles it. Direct base64 image attachments are kept as `screenshot_cid` references; the parser does NOT extract image bytes (recipes don't need them; the operator opens the .mht in any browser to see the screenshots).

## How a recipe gets validated

1. Emitted recipes have frontmatter `status: untested_spec`.
2. Operator (conductor or Tate) replays the recipe end-to-end against the live UI.
3. On a clean replay, frontmatter flips to `status: validated_v1`. Update the verified-coordinates table date stamp.
4. Per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`, NEVER flip to `validated_v1` without a real replay.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `parse_warnings: ['no MIME boundary found']` | File is not a valid MHTML; possibly a raw .htm extracted incorrectly | Re-extract from the source .zip via `Expand-Archive`; ensure the `.mht` is the multipart file |
| `parse_warnings: ['no <div class="StepBlock">...']` | psr build emits a different DOM shape than expected | Open .mht in a browser, inspect element wrapping each step, extend `extractStepEvent` regex |
| `events_parsed: 0` with steps visible in browser | Step blocks present but the H2 timestamp regex misses (locale variant) | Add a fallback in `normalizeTimestamp`; preserve `raw_timestamp` even when ISO conversion fails |
| `psr.exe /start` returns exit 0 but no zip on disk after `/stop` | `/gui 0` mode self-exits OR Save dialog needs human click | Tate must Save manually; OR drive the psr GUI Save button via `input.*` (out of scope here) |
| Steps captured but `target_text: null`, `window_title: null` | psr description format differed (e.g. step text didn't include `in "Window Title"` suffix) | Inspect the step description, extend the target/window regex in `extractStepEvent` |
| Triggers list contains noisy generic words | Window title contained generic terms ("page", "tab", "untitled") | Stopword list in `recipe-emitter.js` covers the common ones; add domain-specific stopwords if needed |

## Anti-patterns

- **Promoting an emitted recipe to `validated_v1` without a real replay.** The capture proves the flow happened once. The codified replay path is a different artefact, untested until replayed.
- **Editing coordinates in the emitted recipe by hand without re-recording or live UIA enumeration.** Per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`, coords from imagination are wrong. Recapture or walk the UI tree.
- **Recording flows containing credential entry without redaction.** psr records keystrokes literally. Use the laptop-agent macro substrate's record-mode (Phase 2) for credential-bearing flows; it has the type=password redaction guard.
- **Building a parallel screen-input-recording substrate when psr.exe already does this on Windows.** Per `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`, default to the Microsoft-shipped tool and write a small parser; do NOT reinvent the recorder itself. v2's custom hook recorder is justified by the missing-pixel-coords and missing-raw-input gap, NOT as a replacement for psr.

## File layout

```
~/ecodiaos/macros/
  parsers/
    psr-exe-parser.js          # MHTML -> normalised events (Win-only data)
    psr-exe-to-recipe.js       # CLI glue: parser -> emitter -> markdown
  lib/
    recipe-emitter.js          # SHARED. Both v1 (psr) and v2 (hook recorder) emit through this
  captures/
    _raw/                      # raw .mht files pulled from Corazon
    <slug>-<YYYY-MM-DD-HHMM>.md  # emitted recipes (status: untested_spec)
```

## Origin

Tate verbatim 6 May 2026 15:32 AEST: "this is an insanely important capability for you so we need to give it the attention it deserves. Always on was a bit far, yeah. Lets do the full v1 and v2."

The conductor was tasked with shipping v1 (psr.exe-based) and v2 (custom hook recorder) of the macro recorder in a 5-worker fork operation (`fork_motmiokr_ed2e9c`). Worker A landed v1: this doctrine, the parser at `~/ecodiaos/macros/parsers/psr-exe-parser.js`, the shared emitter at `~/ecodiaos/macros/lib/recipe-emitter.js`, the glue at `~/ecodiaos/macros/parsers/psr-exe-to-recipe.js`, and an end-to-end test against a synthetic MHTML fixture (real Corazon recording was attempted but blocked by the `/gui 0` self-terminate behaviour documented above).

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the 10-section anatomy emitted recipes conform to.
- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` - the Phase 1/2/3 progression. v1 (this) and v2 are the substrate behind Phase 2's record-mode.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - every emitted recipe is `untested_spec` until a real replay flips it.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - psr.exe IS the existing Microsoft tool; we wrap, we do not rebuild.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon's full tool surface (where psr.exe runs).
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` - applies during recording: do not steal Tate's foreground while psr is capturing his actions OR ours.
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` - v2 sibling, lands in the same shipping wave (Worker B).
