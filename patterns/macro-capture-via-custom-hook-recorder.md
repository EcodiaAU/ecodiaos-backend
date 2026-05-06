---
triggers: macro-capture, custom-hook-recorder, ahk-recorder, uia-selector-capture, vision-enriched-recording, gui-flow-capture-precision, recipe-from-recording, hotkey-toggle-record, ctrl-shift-r-record, autonomous-release-recipe-foundation
---

# Macro capture via custom OS hook recorder (AHK + UIA + vision)

EcodiaOS captures GUI flows on Corazon by hooking the keyboard and mouse at the OS level, enriching each interaction with a UI Automation selector and a vision-language semantic description, and emitting a 10-section markdown recipe at `status: untested_spec`. This is the v2 of the macro recorder: higher-fidelity than v1 (psr.exe) and the foundation for autonomous release recipes.

The Anthropic-first check passes: AutoHotkey is the existing OS hook substrate on Windows, UI Automation is the Microsoft-shipped accessibility tree, and the vision pass uses Anthropic's `claude-sonnet-4-7` API directly. We are NOT building a parallel screen-recording substrate. We are composing existing tools.

Workflow:

1. Tate presses Ctrl+Shift+R on Corazon. AHK `macro-recorder.ahk` starts.
2. Tate performs the GUI flow.
3. Tate presses Ctrl+Shift+R again. AHK stops, writes `events.jsonl` + `uia-enrichments.jsonl` + `manifest.json` + `frames/` to a session directory under `D:\.code\eos-laptop-agent\macros\recordings\<session-id>\`.
4. Conductor (or a fork) pulls the session directory to the VPS, then runs `node ~/ecodiaos/macros/parsers/recording-to-recipe.js <session-dir> <flow-slug>`.
5. Joiner stitches events + UIA selectors. Vision pass adds semantic descriptions per click via Anthropic's `claude-sonnet-4-7`. Emitter produces the 10-section markdown recipe via the shared `recipe-emitter.js`.
6. Recipe emits with `status: untested_spec` per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.
7. First end-to-end replay against the live UI flips status to `validated_v1`.

## When to use this

- Capturing a flow Tate performs and wants me to learn (e.g. "I'm about to do this Stripe-dashboard sequence; record me").
- High-fidelity capture for a flow where v1 (psr.exe) is not enough. v1 records UIA element name + screenshot only - no raw X/Y, no modifier-key state, no double-click windows, no drag distances. v2 captures all of that.
- Foundation for autonomous release recipes (iOS, Android, ASC, Bitbucket, Stripe, Vercel) where the codified replay path needs both pixel coords AND UIA selectors so it survives both pixel-shift and accessibility-tree-shift drift.

## When NOT to use this

- Quick one-off capture where pixel coords are enough. Use v1 (psr.exe) instead - faster setup, no AHK install required, ships with Windows. See `~/ecodiaos/patterns/macro-capture-via-psr-exe.md`.
- Flows involving sensitive apps (1Password, banking, billing). The privacy denylist will SKIP recording on a denylist hit, but the safer move is to not record those flows at all. The denylist is a backstop, not the primary defence.
- Flows on macOS / Linux. v2 MVP is Win-only. The Mac port is on the v2.1 roadmap.

## MVP scope (6 May 2026)

- Win-only (Corazon).
- Hotkey-toggle (Ctrl+Shift+R) - NOT always-on. Tate verbatim 6 May 2026 15:32 AEST: "Always on was a bit far, yeah". Always-on with full privacy gates is deferred to v2.1+ for re-evaluation.
- Privacy denylist v0: hardcoded `foreground_exe` + `url_substring` (in browser window title) + `window_title_substring` blocklist.
- Selectors: UIA-first via PowerShell `uia-probe.ps1`; pixel-fallback when UIA returns null for the load-bearing element.
- Vision pass via Anthropic API (`claude-sonnet-4-7`), capped at 100 events per session to bound API spend per recording.
- Emit destination: `~/ecodiaos/macros/captures/`.

## v2.1 roadmap

- Mac port (SY094): cliclick + Quartz event taps + macOS Accessibility API (the UIA equivalent).
- Hotkey-pause (Ctrl+Shift+P) for sensitive sub-sections within an otherwise-recordable flow.
- UIA-driven password-field detection: skip events on controls where `IsPassword=true` automatically (no hardcoded denylist needed for password fields once this lands).
- pwsh long-running named-pipe daemon to eliminate the ~500ms PowerShell cold-start cost per click.
- Encryption-at-rest for stored recordings (`events.jsonl`, frames, vision-enrichment outputs).
- Retroactive vision-pass on past recordings (re-walk old captures with a newer model).
- Always-on with full privacy gates (was deferred MVP-to-v3 - re-evaluate after v2.1 ships).

## How a recipe gets validated

1. Emitted recipes have frontmatter `status: untested_spec`.
2. Operator (conductor or Tate) replays the recipe end-to-end against the live UI.
3. On a clean replay, frontmatter flips to `status: validated_v1`. Update the verified-coordinates table date stamp.
4. Per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`, NEVER flip to `validated_v1` without a real replay. The capture proves the flow happened once; it does NOT prove the codified replay path works.

## Privacy denylist v0

The recorder consults a hardcoded denylist on each input event. On a denylist match, the recorder appends a `meta` event of type `denylist_skip` to `events.jsonl` (with `denylist_match` field naming the matching rule) and SKIPS recording the click/keypress that triggered it. Hit count surfaces in `manifest.json` as `denylist_hit_count`.

- `foreground_exe`: `1Password.exe`, `Bitwarden.exe`, `KeePass.exe`, `KeePassXC.exe`, `Lastpass.exe`
- `url_substring` (matched against the browser window title): `bank`, `paypal`, `stripe.com/dashboard`, `admin.google.com`, `appleid.apple.com`, `billing`, `payment`, `checkout`, `wallet`
- `window_title_substring`: `Windows Hello`, `Windows Security`, `Sign in`, `Password`

The denylist is intentionally narrow in v0. v2.1 broadens it via UIA-driven password-field detection (see roadmap) so the recorder skips any control flagged `IsPassword=true` regardless of the surrounding window/URL. Until then, the operator MUST be aware of which apps are denylisted and record everything else with the assumption that keystrokes are captured literally.

## File layout

```
~/ecodiaos/macros/
  parsers/
    recording-to-recipe.js     # CLI glue: joiner -> vision-enrich -> emitter
  lib/
    event-joiner.js            # B1 events.jsonl + B2 uia-enrichments.jsonl + manifest.json -> normalised events
    vision-enrich.js           # Anthropic claude-sonnet-4-7 pass: per-event semantic_description
    recipe-emitter.js          # SHARED with v1. 10-section markdown emitter.
  captures/
    <flow-slug>-<YYYY-MM-DD-HHMM>.md   # emitted recipes (status: untested_spec)

D:\.code\eos-laptop-agent\macros\
  macro-recorder.ahk           # AHK Ctrl+Shift+R hook recorder
  uia-probe.ps1                # PowerShell UIA selector probe (called per-click by AHK)
  recordings\<session-id>\
    events.jsonl
    uia-enrichments.jsonl
    manifest.json
    frames\
      pre-<event_index>.png
      post-<event_index>.png
```

## Origin

Tate verbatim 6 May 2026 15:32 AEST: "this is an insanely important capability for you so we need to give it the attention it deserves. Always on was a bit far, yeah. Lets do the full v1 and v2."

The conductor was hitting GUI replay friction across the recipe library: misses buttons when targets shift 8 pixels, can't zoom into dense UIs, recipes drift between author intent and UI reality on every minor upstream UI revision. Capturing Tate's actual flows once eliminates that drift - the recipe is grounded in a real recorded session, not in coordinates typed from imagination.

Worker B (sub-team B1, B2, B3, B4 of fork `fork_motmiokr_ed2e9c`) shipped v2 in parallel with Worker A's v1. B1 shipped the AHK hook recorder + screenshot bracket + privacy denylist. B2 shipped the UIA tree walker + selector enrichment. B3 shipped the vision pass + the recipe-emit glue. B4 (this worker) shipped the doctrine, Neo4j durable memory, and integration tests.

## Cross-references

- `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` - v1 sibling. Win-builtin (psr.exe) capture, faster setup, less precision (no raw X/Y, no modifier state). Use v1 for quick captures; v2 for high-fidelity / replayable / autonomous-release captures.
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the recipe meta-doctrine: 10-section anatomy, authoring workflow, optimisation workflow, verification tiers, maintenance cadence. Every emitted recipe conforms to this anatomy.
- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` - the Phase 1/2/3 record-mode + auto-author meta-pattern. v1 (psr.exe) and v2 (this) are the substrate behind Phase 2's record-mode.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - the validation gate. Every emitted recipe is `untested_spec` until a real replay flips it to `validated_v1`.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the Anthropic-first check passes: AutoHotkey is the existing Win OS-hook substrate, UI Automation is Microsoft-shipped, the vision pass uses Anthropic's API directly. We compose; we do not reinvent.
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` - capture during recording must NOT steal Tate's foreground. The recorder is passive - it observes Tate's input without driving any input of its own.
- `~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md` - if AHK is wired into the eos-laptop-agent `macro.*` runtime later, restart `pm2 restart eos-laptop-agent` after edits to the AHK or PowerShell scripts so the require-cache picks up the new handlers.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - Corazon's full tool surface (where AHK + UIA + the recording substrate run). The peer paradigm is what makes the OS hook recorder possible.
