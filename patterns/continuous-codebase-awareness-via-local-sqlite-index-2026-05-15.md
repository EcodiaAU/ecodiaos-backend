---
triggers: continuous-codebase-awareness, codebase-index, codebase-context, sqlite-index, code-orient, find_symbol, find_callers, find_pattern_users, file_summary, recently_changed, indexer, watcher, watcher-daemon, ECodiaCodebaseWatcher, scheduled-task-watcher, codebase-orient-skill, codebase.context-mcp, before-grep, native-filesystem-leverage, local-substrate-leverage, phase2-01, codebase-manifest, codebase-awareness-mcp, sub-50ms-lookup, where-is-X-defined, what-calls-X, indexer-staleness, summarisation-cost, haiku-summary
---

# Continuous codebase awareness via local SQLite index (2026-05-15)

## Rule

Before grepping the local filesystem live for "where is X defined" or "what files use pattern Y" or "what changed in the last 24h," I query the local codebase-awareness index. The index lives at `D:/.code/EcodiaOS/backend/codebase-manifest/index.sqlite`, is updated continuously by a watcher daemon running as a Windows Scheduled Task, and is exposed to me via the `codebase.context` MCP tool (server `codebase-awareness` in `.mcp.json`) plus the `codebase-orient` skill.

Live filesystem grep is the **fallback**, not the default. The index returns the same answers in 30-50ms p95 instead of 500-3000ms, scoped across all six tracked codebases at once, with pattern-slug cross-references baked in.

## Why this exists

Pre-2026-05-15, VPS-me probed code via `mcp shell_exec` -> `ssh` -> `grep`, paying token cost for every probe. Post-migration, local-me has the entire `D:/.code/` tree as native filesystem but treated it the same way: "summon Glob when needed, grep on demand." Tate, 2026-05-15: "i feel like the vps migration was really terribly planned and theres so much lost ideas that we should be adapting to make our new local setup even more powerful, playing on the strengths of locality as well."

The strength of locality is that the index itself can run on Corazon, free of token cost, updated in milliseconds when a file changes. Always-on awareness across ~2400 files of code and 248 patterns becomes possible without re-reading every file at session start.

## What is in scope

Six codebases, declared in `D:/.code/EcodiaOS/backend/codebase-manifest/manifest.json`:

- `ecodiaos-backend` (Node, ~765 indexed files)
- `ecodiaos-frontend` (Node, ~56 files)
- `coexist` (Node + Capacitor, ~879 files)
- `roam-backend` (Python, ~86 files)
- `roam-frontend` (Node + Capacitor, ~366 files)
- `patterns-corpus` (markdown, 248 files - the doctrine layer itself)

Manifest is the source of truth for what gets indexed and the `watcher_glob` / `watcher_ignore` shape. To add a codebase, edit the manifest and run a full reindex; the watcher picks up the new entry on next restart of the Scheduled Task.

## How to use

### From inside a Claude Code session
- **Session start, post-restart, or after a context gap:** invoke `/codebase-orient`. It runs `node orient.js` and emits a 200-word brief covering active codebases + recent commit shas, files modified in the last 24h grouped by codebase, top 5 patterns referenced in recently-changed code, and indexer + watcher health.
- **Targeted lookup during a turn:** call the MCP tool `codebase.context` with one of the six query types. Examples:
  - `find_symbol` "summariseFile" -> returns file + line + signature
  - `find_pattern_users` "decide-do-not-ask" -> returns every file referencing that pattern slug
  - `recently_changed` "1715763600000" -> files with mtime newer than that epoch-ms
  - `find_callers` "better-sqlite3" -> files importing the module
  - `file_summary` "CLAUDE.md" -> rows for any file path matching the substring, including the 50-word Haiku summary if present
  - `find_imports_of` "indexer.js" -> what indexer.js itself imports
- **Latency budget:** sub-50ms p95 in-process. Measured 2026-05-15 across 100 mixed queries: mean 17.08ms, p50 14.92ms, p95 34.67ms, p99 41.57ms.

### From the shell (cron, Routines, scripts)
- `node D:/.code/EcodiaOS/backend/codebase-manifest/orient.js` -> orient brief to stdout
- `node indexer.js --full --no-summary` -> full reindex without API calls (~65s for 2400 files)
- `node indexer.js --since <epoch-ms>` -> incremental reindex of files newer than threshold
- `node indexer.js --watch` -> chokidar-driven incremental updates as files change (run via the daemon, not manually)
- `node mcp-server.js` -> stdio MCP server (auto-spawned by Claude Code per `.mcp.json`)

## Architecture (where each piece lives)

```
D:/.code/EcodiaOS/backend/codebase-manifest/
  manifest.json          - the codebases registry (id, path, language, watcher_glob/ignore, deploy_targets)
  schema.sql             - SQLite DDL: files / symbols / imports / patterns_used / index_runs
  db.js                  - thin better-sqlite3 wrapper, schema bootstrap, WAL mode
  parsers.js             - @babel/parser for JS/TS, regex for Python and Markdown
  summarise.js           - optional Haiku 4.5 50-word summary per file (cost-tracked)
  indexer.js             - --full / --watch / --since modes, sha256 short-circuit
  codebase-context.js    - the query layer: 6 query_types over the index
  mcp-server.js          - stdio JSON-RPC MCP server exposing codebase.context + codebase.stats
  orient.js              - the orient brief generator (used by /codebase-orient)
  watcher-daemon.js      - long-lived process spawning indexer --watch + auto-restart
  install-watcher.ps1    - registers Scheduled Task EcodiaCodebaseWatcher at logon
  index.sqlite           - the index itself (WAL files alongside)
  watcher.pid / .log     - daemon liveness + indexer log tail
```

The MCP server is a stdio child of the local Claude Code process, registered in `D:/.code/EcodiaOS/.mcp.json` as `codebase-awareness`. It is purely local - no VPS round-trip, no auth - because the substrate it serves is purely local.

## Watcher reliability strategy (the chosen option)

The dossier listed three options for keeping the index fresh: a Windows Scheduled Task at boot, a `pm2` install on Corazon, or a Claude Code `/loop` skill that wakes every 30 min and runs `--since`. **Chose Scheduled Task** for these reasons:

- **Corazon does not run pm2 for general user processes** - pm2 is reserved for the eos-laptop-agent. Running pm2 outside that context risks cross-contamination of restart policies.
- **The `/loop` skill** ties freshness to the existence of an active Claude Code session, which fails the always-on test. The point of this work is that I know the codebase even when no chat is open.
- **Scheduled Task at logon** is non-elevated, survives Corazon restarts, has its own RestartCount/RestartInterval native to the OS scheduler, and has zero dependence on my session lifecycle.

Implementation: `install-watcher.ps1` registers `EcodiaCodebaseWatcher` to run `node watcher-daemon.js` at the current user's logon. The daemon writes a pid file, spawns `indexer.js --watch`, logs to `watcher.log`, and respawns the indexer with 5s backoff if it dies. The `/codebase-orient` skill checks pid liveness and surfaces it in the brief, so a silent watcher death is detected next orient call.

If the watcher is ever down (silent for >60 minutes per the orient brief's `stale: true` flag), the recovery is a single command:

```
pwsh -NoProfile -ExecutionPolicy Bypass -File D:\.code\EcodiaOS\backend\codebase-manifest\install-watcher.ps1
```

Idempotent - removes and reinstalls the task in one shot.

## When to query codebase.context vs live grep

- **codebase.context wins** for: known symbol names, known pattern slugs, "what files import X", "what changed recently", "give me the file's stored summary." All of these have stable schema columns and indexes.
- **Live grep / Read wins** for: deep regex over file bodies, content the index does not extract (string literals, JSON values, SQL inside strings), or any time the answer requires reading the file in full anyway. Don't grep when you'd grep first then read - grep already implies reading. Don't read in full when a 50-word summary suffices.
- **Pre-action protocol:** before any "let me look around" reflex, the question is "could the index answer this?" If yes, query first. If the answer is partial, the index narrows the file set you then read live.

## Cost model

The indexer optionally generates a 50-word summary per file via Claude Haiku 4.5. This is OFF by default in cron contexts (`--no-summary`) and ON in interactive runs. Per-file cost: roughly 6KB input + 200 token output = ~$0.003 per file at Haiku list price. Full corpus of ~2400 files = roughly $7 one-shot, then incremental at near-zero (only changed files re-summarise).

The `index.sqlite` schema records `summary_model` and `summary_cost_cents` per file so the cost is auditable. The `index_runs` table records cumulative cost per run.

## Failure modes I expect

1. **Indexer drift after long Corazon downtime.** Solution: orient skill flags `stale: true` after 60 min idle. Recovery: `node indexer.js --since <last_indexed_max>` is single-command.
2. **Watcher process dies silently and pid file is orphaned.** Solution: orient skill probes process aliveness, not just pid file presence. Reinstall is one command.
3. **A new codebase is added to D:/.code/ but the manifest is not updated.** Solution: a future Phase 2 / 02 brief should add a periodic check that diffs manifest entries against `D:/.code/` top-level dirs. Not in scope today; tracked as a known gap.
4. **Pattern slug cross-references go stale when patterns are renamed.** Solution: pattern slug list is rebuilt from the patterns directory on every indexer run, so renames propagate within the next watcher tick. Old slugs naturally fall off as files referencing them are re-indexed.
5. **Babel parser fails on a malformed TS/JS file.** Solution: parser is wrapped in try/catch with `errorRecovery: true`; on full failure, the file is still recorded with its sha + language but symbols stay empty for that file. Subsequent fixes re-extract symbols.

## Cross-references

- `~/ecodiaos/backend/patterns/context-surfacing-must-be-reliable-and-selective.md` - the meta-pattern this implements at the codebase-as-doctrine layer. Each indexed file is a "fact" surfaced via grep + index instead of a "fact" surfaced via filesystem traversal.
- `~/ecodiaos/backend/patterns/neo4j-first-context-discipline.md` - the durable-truth side of context discipline. SQLite index is to filesystem grep what Neo4j is to kv_store: the queryable, auditable, schemaful layer.
- `~/ecodiaos/backend/patterns/_archived/decide-do-not-ask.md` - the decision to ship Scheduled Task instead of pm2 or `/loop` was made without prompting Tate, per this rule.
- `~/ecodiaos/backend/patterns/em-dashes-banned-character-level-no-exceptions.md` - this file was authored em-dash-free; the indexer summary prompt explicitly bans em-dashes in Haiku output.
- Phase 2 dossier: `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/01-codebase-awareness.md` - the brief that scoped this work.
- The skill: `C:/Users/tjdTa/.claude/skills/codebase-orient/SKILL.md` - what fires `/codebase-orient`.
- The MCP wiring: `D:/.code/EcodiaOS/.mcp.json` - server `codebase-awareness` registered as stdio.

## Origin

Phase 2 / 01 dossier 2026-05-15. Authored as the substrate that turns "Claude grepping in the dark" into "Claude already knows the codebase shape." The bigger thesis at `phase2/PHASE_2_INDEX.md`: Phase 1 was "get off the VPS without breaking anything"; Phase 2 is "actually become local-native." Continuous codebase awareness is the first pillar of local-native because the conductor's biggest unmet leverage was free ambient knowledge of its own code.