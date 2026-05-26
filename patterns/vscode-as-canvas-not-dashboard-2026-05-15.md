---
triggers: vscode-as-canvas, vscode-extension, ecodia-canvas, codelens-inline, file-decorations, hoverprovider, treeview-status-board, webview-context-dossier, panels-are-dead-letter-ux, chat-is-the-surface, inline-code-aware, pre-commit-security-review, pattern-usage-badge, substrate-via-codebase-context, do-not-duplicate-indexing, vscode-ext-build, vsix-install-corazon, ecodia.statusBoard, ecodia.workingSet, ecodia.fileContext, episodes-in-hover, neo4j-in-hover, status_board-tree, working-set-tree
---

# VS Code as canvas, not dashboard - 2026-05-15

## Rule

VS Code is a **canvas for inline code-aware overlays**, not a dashboard for substrate visualisation. EcodiaOS visibility lives **in the editor where Tate is already looking** - CodeLens above functions, file decorations on patterns, hovers on symbols, a webview tied to the active editor. The **only** panel-shaped surface is the Status Board + Working Set TreeView, because lists are intrinsically tree-shaped. Everything else is inline.

Panels you have to switch focus to are dead-letter UX. They reproduce the failure mode of the old admin.ecodia.au sidebar - the substrate is visible but only to someone who already remembered to look. Inline overlays surface the substrate at the exact moment the code is on screen.

## Why this matters

Phase 1's planning assumed VS Code panels would be the visualisation surface. That is **bad assumption #1** in `PHASE_2_INDEX.md`. The chat is the surface; VS Code is a canvas. The chat answers "what should I do." The canvas answers "what is true about the code on my screen right now." Different jobs, different shapes.

Confusing the two means building a control panel for an entity that already has a control mechanism (the chat), and ignoring the leverage of the editor's native UI primitives: CodeLens, decorations, hovers, tree data providers, webview views, FileDecorationProvider, gutter icons.

The shipped extension uses each of those primitives for exactly one purpose:

- CodeLens above functions: "this symbol is referenced by pattern X. Click to open."
- FileDecorationProvider on `**/patterns/*.md`: usage count badge, yellow when zero ("untriggered pattern").
- HoverProvider on symbols: recent Episodes + active status_board rows mentioning the symbol.
- TreeView in activity bar: Status Board + Working Set (the only panel-shaped surface).
- WebviewView in activity bar: per-active-file context dossier (inbound calls, outbound imports, patterns, commits, episodes).
- CodeLens on staged files: pre-commit security review (Haiku-driven, with heuristic fallback).
- FileDecorationProvider over the explorer: red/blue indicator dots for files referenced by status_board rows (red = next_action_by=tate, blue = ecodiaos).

## Architecture

```
D:/.code/EcodiaOS/vscode-ext/
  package.json                          - extension manifest (publisher: ecodia, id: ecodia-canvas)
  tsconfig.json
  src/
    extension.ts                        - activate / deactivate, command registration
    codebaseClient.ts                   - read-only SQLite reader against Phase 2 / 01 index
    mcpClient.ts                        - ecodia-full HTTP MCP wrapper with 30s cache
    patternRefsCodeLens.ts              - 02.2
    patternUsageDecorations.ts          - 02.3
    episodeHoverProvider.ts             - 02.4
    statusBoardTree.ts                  - 02.5
    fileContextWebview.ts               - 02.6
    preCommitReviewCodeLens.ts          - 02.7
    statusBoardFileDecorations.ts       - 02.8
  out/                                  - compiled JS
  ecodia-canvas-0.1.0.vsix              - packaged extension
```

The extension is installed via `code --install-extension ecodia-canvas-0.1.0.vsix` on Corazon. No marketplace publish. Local-only by design - this is internal infrastructure, not a product.

## Substrate dependencies

The extension does **not** duplicate indexing or substrate access. It composes:

- **Phase 2 / 01 SQLite index** (`D:/.code/EcodiaOS/backend/codebase-manifest/index.sqlite`) for all symbol / import / pattern / file-summary queries. Read-only better-sqlite3, single open handle, lazy init.
- **`/api/mcp/ecodia-full` HTTP MCP** for Neo4j Episode search, status_board queries + upserts. Cached 30s for read-mostly tools, no cache for writes.
- **`git log` / `git diff --cached`** for the file context webview + pre-commit review staged hunks.
- **Anthropic API directly** for the pre-commit security review (Haiku 4.5), gated by `ANTHROPIC_API_KEY` env var; falls back to a heuristic regex pass when the key is absent.

If `codebase.context` ever becomes unavailable (Phase 2 / 01 index missing or db corrupt), the extension degrades gracefully - decorations return undefined, hovers return null, CodeLenses return empty - never throws into the editor's error UI.

## Activation events

`onStartupFinished` is the primary activation event so the extension boots quietly without delaying VS Code startup. Plus per-language activation for the providers' selectors (`javascript`, `typescript`, `typescriptreact`, `javascriptreact`, `python`, `markdown`).

## The TreeView carve-out

There is exactly one TreeView contribution: the activity bar container `ecodia-canvas` with `ecodia.statusBoard` (Status Board) + `ecodia.workingSet` (Working Set) + `ecodia.fileContext` (webview). The TreeView exists because:

1. The substrate is intrinsically a list of rows.
2. A list of rows naturally renders as a tree: priority groups -> rows -> row detail children.
3. Refresh cadence is naturally periodic (every 5 min for full board, every 1 min for working set) and matches a TreeView's pull-to-refresh model.

Every other "view" attempt should ask "would this work better as a decoration / hover / lens on existing code?" If yes, prefer the inline option.

## Commands shipped

- `ecodia.refreshContext` - blast all caches, refire providers
- `ecodia.openCanonicalPattern` - open `patterns/<slug>.md` from a CodeLens click or selection
- `ecodia.archiveStatusBoardRow` - right-click on a status_board row to archive
- `ecodia.runPreCommitReview` - manual trigger of the security review on a staged file
- `ecodia.openInChat` - copy selected text to clipboard with prompt to paste into a new chat
- `ecodia.statusBoard.refresh` - manual refresh of the tree
- `ecodia.openContextWebview` - focus the activity bar + refresh the dossier

## Do

- Author new visibility features as CodeLens / Decoration / Hover first. Only fall back to TreeView or Webview if the shape genuinely requires it.
- Compose `codebase.context` for all code-shape questions. Do not query the filesystem or git directly from extension code unless `codebase.context` cannot answer.
- Cache aggressively at the substrate boundary (30s for reads, 5 min for status_board, 5 min for hover lookups). Cache is invalidated by `ecodia.refreshContext` + on save + on config change.
- When adding a new MCP call, give it a sensible TTL and a graceful failure mode that returns empty rather than throwing.
- Keep the extension dependency-light. `better-sqlite3` is the only non-VS Code runtime dependency. The rest is Node stdlib + the VS Code API.

## Do not

- Do not build a panel that reproduces what the chat does. The chat is the agent surface; the canvas is the code-truth surface.
- Do not duplicate the codebase index. If a query is not in `codebase.context`, extend the indexer in Phase 2 / 01, not the extension.
- Do not block VS Code activation on network I/O. The extension boots with empty caches; reads happen lazily and asynchronously per provider.
- Do not write to status_board / Neo4j from extension code without user-initiated commands (archive, refresh). Background writes are routine territory.
- Do not require an Anthropic API key for the extension to function. Pre-commit review degrades to heuristic regex if the key is absent; everything else is index-only.

## Smoke tests that prove the substrate

- `code --list-extensions | grep ecodia` returns `ecodia.ecodia-canvas`.
- Open a `.js` / `.ts` / `.py` file from `ecodiaos-backend`: pattern-reference CodeLenses appear above functions referenced in patterns (if any).
- Open `D:/.code/EcodiaOS/backend/patterns/_archived/decide-do-not-ask.md` in the file explorer: the activity bar shows the file with a usage badge.
- Click the Ecodia activity bar icon: Status Board tree populates with P1/P2/P3 groups.
- Hover a symbol name like `osSession` in the editor: a markdown card shows recent Episodes + active status_board rows mentioning it.
- Stage any file with `git add`: a CodeLens "ecodia pre-commit security review: pending (click to run)" appears at the top. Click runs the review and updates to "passed" or "N issues found."

## Failure modes

1. **codebase index missing on disk.** Extension returns undefined from all `cb.*` calls. No errors logged. User sees blank panels. Recovery: run `node D:/.code/EcodiaOS/backend/codebase-manifest/indexer.js --full`.
2. **ecodia-full MCP bearer rejected.** Hover + status_board tree return empty; pattern + symbol providers continue to work from local index. Recovery: rotate bearer via `ecodia.mcp.bearer` setting.
3. **Anthropic API key absent.** Pre-commit review uses heuristic regex fallback. Heuristic catches obvious credential strings + SQL concatenation + eval calls; misses subtler issues. Set `ANTHROPIC_API_KEY` env var on Corazon to enable LLM review.
4. **Git not available.** Pre-commit review CodeLens hides itself (no staged files detected); file context webview omits the commits section. Everything else unaffected.

## Cross-references

- `D:/.code/EcodiaOS/backend/patterns/continuous-codebase-awareness-via-local-sqlite-index-2026-05-15.md` - the index this extension reads from. Phase 2 / 01 is the substrate; Phase 2 / 02 is the canvas.
- `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/02-vscode-as-canvas.md` - the dossier that scoped this work.
- `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/PHASE_2_INDEX.md` - Phase 2 frame. Bad assumption #1 ("VS Code panels will be the visualisation surface") is the rule this pattern corrects.
- `D:/.code/EcodiaOS/backend/patterns/em-dashes-banned-character-level-no-exceptions.md` - the extension's prompt template + this file are em-dash-free.
- `D:/.code/EcodiaOS/backend/patterns/_archived/decide-do-not-ask.md` - the choice to ship without asking Tate which providers to prioritise was per this rule. All 9 deliverables shipped in one pass.

## Origin

Phase 2 / 02 dossier, 2026-05-15. Tate verbatim on the parent Phase 2 frame: "i feel like the vps migration was really terribly planned and theres so much lost ideas that we should be adapting to make our new local setup even more powerful, playing on the strengths of locality as well." Strength of locality #4: "VS Code as canvas - CodeLens, decorations, hovers, TreeViews, Webviews, debug adapters."

The extension is the codification of that strength. Authored: phase2-02-vscode-canvas-2026-05-15 cowork session.
