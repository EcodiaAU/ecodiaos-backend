# Macro recordings real-promotion attempt — fork_motwgrli_7ba416

**Date:** 2026-05-06 ~20:18 AEST
**Fork:** fork_motwgrli_7ba416
**Origin Tate quote:** 6 May 2026 20:09 AEST verbatim - "Okay regarding those two recordings i made for you earlier and their processing, did that get done? wqe need to amek sure the processing is working perfectly before i go and do the others"

## Verdict

**PIPELINE WORKS END-TO-END for the parser. Promotion-to-handler step is structurally not what the brief assumed and cannot be auto-emitted.**

## What the parser actually produces

- Input: `events.jsonl` + `manifest.json` + `frames/<idx>-pre.png` + `<idx>-post.png` + optional `uia-enrichments.jsonl` in a session dir.
- Pipeline: `event-joiner.js` → `vision-enrich.js` → `recipe-emitter.js`.
- Output: ONE markdown file at `~/ecodiaos/macros/captures/<flow-slug>-<timestamp>.md`, conforming to the 10-section recipe anatomy from `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. Frontmatter `status: untested_spec`.
- The parser does NOT emit executable Node handlers. Handlers under `D:\.code\eos-laptop-agent\macroHandlers\*.js` (the canonical handler dir per `tools/macroSuite.js` line 22) are hand-authored modules implementing `handler.handle({params, helpers})` and registered in `macroHandlers/index.js`.

## Disk-verified state on Corazon (D:\.code\eos-laptop-agent\)

- `macros\` — 9 files: 5 .ahk, post-process.bat, privacy-denylist.json, registry.json, uia-probe.ps1.
- `macros\handlers\` — empty (count=0). The brief's promotion target. Was never the canonical dir.
- `macros\macroHandlers\` — empty (count=0). Also not canonical.
- `macroHandlers\` (sibling of `macros\`, NOT under it) — 17 entries: 11 hand-authored .js handlers (apple-signin, coexist-admin-signin, github-login, gmail-send, macincloud-login, stripe-dashboard, supabase-dashboard, transporter-upload, vercel-login, vercel-redeploy, xcode-organizer-upload), common.js, sshHelper.js, index.js, plus 3 .applescript siblings. **This is the real handler dir.**
- `macros\registry.json` — references `"handler": "macroHandlers/<name>.js"` paths, all of which resolve to the canonical handler dir, not the empty `macros\handlers\` or `macros\macroHandlers\` dirs.

## What did happen this turn

- Re-ran the parser end-to-end on both session dirs already staged on VPS at `~/ecodiaos/drafts/recordings/`:
  - `~/ecodiaos/macros/captures/ios-release-rdp-mac-distribute-to-asc-2026-05-06-1018.md` (8559 bytes, 6 events, exit 0).
  - `~/ecodiaos/macros/captures/asc-build-review-submit-2026-05-06-1018.md` (6902 bytes, 7 events, exit 0).
- Vision was skipped 6/6 + 7/7 with `vision_aborted: no` and `vision_auth_source: os_oauth_chain`. Skip reason: OAuth chain (claude_max → claude_max_2) fell through to deepseek due to weekly token cap on both Max accounts; deepseek's Anthropic-compat proxy returns `[Unsupported Image]` for image content blocks, vision-enrich gracefully marked all events `vision_skipped_reason=deepseek_no_vision_support` and emitted clean recipes anyway. Working as designed per `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` and the vision-enrich.js graceful-skip block.
- Joiner emits one warning per session: `manifest parse error: Unexpected token '﻿', ...` — UTF-8 BOM at start of `manifest.json` written by AHK on Corazon. Non-blocking; manifest parse falls through to `{}` and event extraction still works.
- Leak-scan against `creds.apple.password.value`, `creds.macincloud.password`, `creds.laptop_passkey`, `ChambersTate2026!` — all CLEAN on both recipes.
- Both recipes carry `status: untested_spec` per real-run-before-codification doctrine.

## What did NOT happen and why

- **No promotion of markdown content into a .js file under `macros\handlers\`.** That step in the brief was structurally incorrect: writing markdown content into a `.js` file produces a non-loadable module and the brief's own Step 4c (`node -e "require('/abs/path/recipe.js')"`) would fail. HALTED before that step per "FAIL LOUD" discipline.
- **No new `registry.json` entries.** The registry is a metadata sidecar — adding entries pointing at non-existent or non-loadable handlers would create new phantom rows and reproduce the prior fork's failure mode.
- **No status='validated_v1' rows.** Per `trg_enforce_validated_v1_has_validation_run`, validated_v1 requires a runbook_validation_runs row first; both recipes need a real replay before they can earn that.

## Recording-1 fidelity issue (worth surfacing to Tate)

Looking at the verified-coordinates table for `ios-release-rdp-mac-distribute-to-asc`: 5 of 6 click targets carry the UIA selector `type=pane name="Input Capture Window" class=IHWindowClass` — that's the recorder's own overlay panel, not the iOS distribute-to-ASC UI inside the RDP session. Tate clicked the recorder overlay during the recording instead of (or before) the actual flow. The recipe is well-formed but the captured events do not codify the iOS distribute-to-ASC sequence.

Recording 2 (`asc-build-review-submit`) is more useful: 5 real clicks on App Store Connect Chrome window, 2 keyboard inputs (Enter, Ctrl+v), one labelled-button hit ("Save"), but UIA selectors are React-generated CSS-modules class strings (`Box-sc-18eybku-0 dMIwjk` etc) that are not stable replay anchors across deploys.

## Recommended next steps for Tate

1. **Re-record the iOS-release flow** with the recorder overlay hidden / minimised during capture so the events.jsonl contains the actual distribute-to-ASC clicks, not overlay dismissals.
2. **Hand-author handlers** under `macroHandlers/<flow-slug>.js` from the recipe specs once the captures are clean. The doctrine path `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` describes this; the parser produces the SPEC, not the executable.
3. **Decide whether registry.json should ever auto-update** — currently it's hand-edited. If yes, that is a Phase-2 deliverable for the parser pipeline, not in scope for this brief.

## Files written / probed by this fork

- Parsed: `~/ecodiaos/drafts/recordings/2026-05-06-1931-d7amul/` and `2026-05-06-1938-hnl2c0/`.
- Emitted: `~/ecodiaos/macros/captures/ios-release-rdp-mac-distribute-to-asc-2026-05-06-1018.md`, `~/ecodiaos/macros/captures/asc-build-review-submit-2026-05-06-1018.md`.
- Probed via filesystem.* peer API: `D:\.code\eos-laptop-agent\macros\` (root + handlers + macroHandlers subdirs), `D:\.code\eos-laptop-agent\tools\macro.js`, `D:\.code\eos-laptop-agent\tools\macroSuite.js`, `D:\.code\eos-laptop-agent\macroHandlers\` (canonical handler dir).
