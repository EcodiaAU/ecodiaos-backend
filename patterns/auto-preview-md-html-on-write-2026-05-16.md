---
triggers: auto-preview, md-preview, html-preview, html-mockup, markdown-deliverable, preview-substrate, ecodia-preview, simple-browser, markdown-show-preview, ctrl-shift-v, ide-preview, write-md-to-disk, write-html-to-disk, html-in-chat, mockup-in-chat, rendered-output, preview-extension, cursor-extension, vscode-extension, three-ides-concurrent, reflex-preview
narrowed_at: 2026-05-17
narrowed_reason: Tate flagged the auto-fire-on-every-write was opening previews for files never intended for him (patterns, internal docs, drafts). Auto-fire retired; preview is now a deliberate reflex.
superseded_by: reflex-preview-not-auto-preview-2026-05-17
---

# Write .md and .html to disk - render via the explicit reflex (post-2026-05-17)

When you have an artefact for Tate to read as a rendered doc - mockup, draft, report, proposal, briefing - Write it to disk under `backend/drafts/<slug>.md` (or `.html`) AND THEN call the reflex:

```
node d:/.code/EcodiaOS/backend/.claude/hooks/reflex-preview.js <abs-path>
```

The reflex POSTs the path to every running IDE's preview extension (registry: `%USERPROFILE%/.ecodia-preview/instances.json`). Each extension opens the file in preview mode - reusing an existing tab if one is already open for that file, otherwise opening in the currently-active editor group (not a side pane).

**This is the reflex pattern, not the auto pattern.** The earlier PostToolUse Write|Edit|MultiEdit hook that fired on every write was retired 2026-05-17 because it opened previews for every .md/.html the agent touched (internal patterns, INDEX regen output, doctrine drafts) - noise, not signal. See `[[reflex-preview-not-auto-preview-2026-05-17]]` for the doctrine.

This means: **never paste large HTML or Markdown content as a code block in chat when the deliverable is "show Tate the rendered output."** Write the file to disk and fire the reflex. The preview appears in the group he is looking at. The chat stays clean.

## Do

- DO Write `.md` deliverables (mockups, drafts, reports, proposals, briefings) to a sensible path under `backend/` (typically `backend/drafts/`, `backend/docs/`, or a domain-specific folder). The preview pops automatically.
- DO Write `.html` deliverables (UI mockups, dashboards, prototypes, rendered reports) to disk the same way. The preview opens via `simpleBrowser.show` as an in-IDE tab.
- DO include enough surrounding styling in `.html` mockups that the in-IDE preview reads well on its own (self-contained `<style>` block, no external deps unless intentional).
- DO trust that all currently-running IDE windows whose workspace contains the file will pop a preview. The hook auto-discovers via the registry at `%USERPROFILE%/.ecodia-preview/instances.json`.
- DO use this for one-shot visual artefacts and for living documents alike. The preview re-renders on subsequent Edit calls (well, simpleBrowser may need a manual refresh for HTML - acceptable).

## Do NOT

- DO NOT paste a 200-line HTML mockup into a chat code block "so Tate can see it." Write it to disk. The preview opens.
- DO NOT dump a long Markdown report as inline chat content when the point is for Tate to read it as a rendered doc. Write to `backend/drafts/<slug>.md`. Reference the path in chat.
- DO NOT instruct Tate to manually open or preview a file you just wrote. The substrate handles that.
- DO NOT bypass the hook by writing through `mcp__supabase__storage_upload` or a fork's filesystem call when an in-session Write would have triggered preview naturally. Write directly when the goal is "render this for Tate now."
- DO NOT assume the preview hasn't fired just because you can't see it. Tate's IDE windows are on his screen, not yours. Ask if the preview popped if you need confirmation.

## Substrate verification

If a fresh session needs to confirm the substrate is alive before relying on it:

```bash
cat "$USERPROFILE/.ecodia-preview/instances.json"
```

Should list one entry per running IDE window (Cursor / VS Code Stable / VS Code Insiders), each with `port`, `ide`, `workspaceRoots`. Empty file or missing file = extensions not loaded; tell Tate to reload his IDE windows (`Ctrl+Shift+P -> Developer: Reload Window`) and re-verify.

Direct manual trigger (bypasses hook, useful for debugging):

```bash
curl.exe -X POST -H "Content-Type: application/json" \
  -d '{"path":"d:/.code/EcodiaOS/backend/drafts/foo.md"}' \
  http://127.0.0.1:7457/open-preview
```

## Components

- Extension source: `backend/laptop-agent/cursor-preview-extension/` (single source, junctioned into all three IDE extensions dirs)
- Hook script: `backend/.claude/hooks/open-preview.js`
- Hook registration: `backend/.claude/settings.json` -> `PostToolUse` -> matcher `Write|Edit|MultiEdit`
- Registry: `%USERPROFILE%/.ecodia-preview/instances.json` (each extension self-registers on activate, unregisters on deactivate, prunes dead PIDs on start)
- Port range: `127.0.0.1:7457-7476` (first free port per IDE instance)

## Origin

Tate, 2026-05-16 ~15:00 AEST verbatim: "if we could use an extension + tailscale to automatically open the files in preview mode instead of code, that would be so nice. Like if i were to ask you for a html mockup right now, you'd write it up and open a new tab for me in cursor (since you're cursor), with it in preview mode"

Built and verified end-to-end same session. HTML smoke test (dark-glass card) confirmed `simpleBrowser.show` opens in-IDE across all three concurrent IDE instances.

After verification, Tate verbatim: "okay that is fucking PERFECTTTTTT. Now we need to codify it so that any chat in future knows to do this rather than jsut writing and storing md and html files."

The behavioural shift codified here is the second half of that quote: future chats should reach for Write→preview as the default rendering substrate, not chat-embedded code blocks.

## Cross-refs

- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` (this pattern follows that rule)
- `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` (Write to disk is action; pasting in chat is plan-shaped output)
