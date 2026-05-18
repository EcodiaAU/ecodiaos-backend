# ecodia-preview

Tiny extension that opens .md and .html files in preview mode on demand. Driven by a Claude Code PostToolUse hook so that when Claude writes one of those files in any open IDE (Cursor / VS Code Stable / VS Code Insiders), it pops into preview automatically.

## How it works

- On startup, binds an HTTP server to the first free port in `127.0.0.1:7457-7476`.
- Writes its `{ port, ide, workspaceRoots, pid }` to `%USERPROFILE%/.ecodia-preview/instances.json`.
- On `POST /open-preview {"path": "<absolute-path>"}`:
  - `.md`  -> `markdown.showPreviewToSide`
  - `.html` -> `simpleBrowser.show` (in-IDE tab), falls back to external browser
  - other -> opens in an editor tab
- On deactivate, removes its registry entry.

The companion hook script at `backend/.claude/hooks/open-preview.js` reads the registry, filters by workspace match, and POSTs to every matching instance.

## Install

The extension is the same folder for all three IDEs. The install script junctions it into each extensions dir.

```powershell
powershell -ExecutionPolicy Bypass -File d:\.code\EcodiaOS\backend\laptop-agent\cursor-preview-extension\install.ps1
```

Then reload each IDE window (Ctrl+Shift+P -> "Developer: Reload Window") to pick up the extension.

## Verify

After reload, in any IDE that loaded the extension, the registry file should list its PID:

```powershell
type $env:USERPROFILE\.ecodia-preview\instances.json
```

Manual trigger:

```powershell
curl.exe -X POST -H "Content-Type: application/json" -d '{"path":"d:/.code/EcodiaOS/backend/CLAUDE.md"}' http://127.0.0.1:7457/open-preview
```
