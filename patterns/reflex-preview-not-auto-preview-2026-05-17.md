---
triggers: reflex-preview, reflex-not-auto, post-tool-use-noise, auto-fire-noise, broad-matcher-hook, write-edit-multiedit-hook, hook-fires-on-everything, deliverable-vs-incidental, preview-substrate-tuning, auto-preview-retired, ide-preview-noise, reflex-pattern-vs-auto-pattern, hook-matcher-discipline, broad-matcher-without-path-gating
---

# Reflex over auto - PostToolUse hooks on broad matchers without path/intent gating become noise generators

When a PostToolUse hook fires on a broad tool matcher (`Write`, `Edit`, `MultiEdit`, `Bash`) without a path / intent / scope filter, it fires on every invocation - including all the incidental writes the agent makes during normal work (internal docs, drafts, INDEX regen, pattern files, audit reports). If the side-effect of the hook is visible to a downstream human (opens an IDE tab, sends a notification, posts to a channel), that human sees noise. The intended signal - the small subset of writes meant for them - drowns in it.

**Default to a reflex pattern instead of an auto pattern when the side-effect targets a human.** Author a small CLI / endpoint the agent invokes explicitly when it has decided the artefact is for the human. Skip the hook wiring entirely. The agent's judgement is the filter.

## Do

- DO write a small explicit-invocation CLI / script when the action should fire SOMETIMES based on agent intent. Name it `reflex-<action>.js`. Document one-liner usage at the top.
- DO use PostToolUse hooks when the action should fire ALWAYS based on tool invocation alone (em-dash detector, cred-mention surface, token-saver truncation, status-board write check) - these are safety nets / context surfacers, not human-targeted notifications.
- DO add a path or intent gate to a PostToolUse hook if you genuinely want auto-fire but only for a narrow slice. Example: `matcher: "Write|Edit"` + an `if: "Write(./drafts/preview-*)"` permission-rule filter. Or check the path inside the hook script and `process.exit(0)` for everything outside the slice.
- DO retire a hook the moment Tate flags it as noise. The cost of recreating it later is small; the cost of leaving noise in his view is recurring.

## Do NOT

- DO NOT wire a PostToolUse hook on `Write|Edit|MultiEdit` (or any broad matcher) when its side-effect is visible to a human and not every invocation is intended for that human. The agent will write a thousand files for a thousand reasons; the human only wants to see one.
- DO NOT keep an auto-fire hook alive "because it sometimes saves a step." If you have to apologise for the noise more than once, the math is against the hook.
- DO NOT pretend "the user can ignore the noise." Noise is friction. Friction compounds.
- DO NOT delete the underlying script when retiring the hook - keep it on disk with a DEPRECATED header in case the slice-gated version becomes worth re-enabling.

## How to apply

When designing a new feedback / notification / substrate-write that you want to trigger based on what the agent does:

1. **Is the side-effect visible to a human?** If no - a hook is fine. If yes - continue.
2. **Does it need to fire EVERY time the trigger event happens?** If yes - hook. If no - reflex.
3. **If reflex:** write `backend/.claude/hooks/reflex-<name>.js` taking explicit args. The agent calls it via `node <path> <args>` whenever its judgement says fire. No hook wiring.
4. **If hook with a narrow slice:** add a path / intent / permission-rule filter and document the slice in the hook's header comment.

## Origin

Auto-preview substrate shipped 2026-05-16 wired a PostToolUse `Write|Edit|MultiEdit` hook that POSTed every previewable file write to all running IDEs' preview extensions. Within 24 hours Tate flagged it as noise: it was opening previews for internal docs, draft pattern files, INDEX regen output, audit drafts - none of which were for him. Verbatim 2026-05-17 Telegram 05:32Z: "Right now it opens every single Md/html doc in the preview... that is not always necessary so it should be more of a reflex that you can do at will + it should open in a new tab but within any currently open."

Retired the hook same turn. Replaced with `backend/.claude/hooks/reflex-preview.js` (explicit CLI) + router.js update.

**Follow-up the same session (Telegram 05:51Z):** Tate refined the routing: "open a new tab set ONCE, so the maximum is 2 tab sets, one with all the claude chats, and one with the previews, but then any subsequent previews still open in the previews tab set, so that each set takes up half the screen, just for QoL." Router updated to detect the "preview group" (first non-active editor group with the highest viewColumn); first preview spawns it via showPreviewToSide / moveEditorToRightGroup, every subsequent preview focuses the existing group and uses same-group commands (markdown.showPreview, simpleBrowser.show, vscode.open with explicit viewColumn) so the new tab lands inside. Reuse-if-already-open still wins over both paths.

Episode: Neo4j node 2909 ("Auto-preview hook retired - replaced by reflex-preview + reuse-in-current-group router").

Cross-refs: [[auto-preview-md-html-on-write-2026-05-16]] (the now-narrowed pattern), [[hooks-must-not-fire-inside-applied-pattern-tags]] (sibling - hooks must not generate their own noise), [[tate-facing-context-blocks-must-not-render-to-frontend]] (sibling - downstream-human surface must not show internal substrate noise).
