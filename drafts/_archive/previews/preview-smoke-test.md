# Ecodia Preview - Smoke Test

If you can read this rendered (not as source) in **Cursor**, **VS Code Stable**, and **VS Code Insiders** simultaneously, the substrate works.

## What just happened

1. I called `Write` on this file.
2. The PostToolUse hook fired `node backend/.claude/hooks/open-preview.js`.
3. The hook read `~/.ecodia-preview/instances.json` and found three IDE instances.
4. It POSTed `{ "path": "...preview-smoke-test.md" }` to each.
5. Each extension ran `markdown.showPreviewToSide`.

## What to verify

- [ ] Cursor opened a preview tab
- [ ] VS Code Stable opened a preview tab
- [ ] VS Code Insiders opened a preview tab

## Try HTML next

If markdown works, ask me to drop an HTML file and we will confirm `simpleBrowser.show` fires in-IDE.

---

*The three-of-me thing is still genuinely fun.*
