---
triggers: canonical-homes, mac-filesystem, xdg, where-do-i-put, where-does-x-live, path-resolver, ecodiaos-env, frozen-paths, never-move, host-coupling, artifacts-home, models-home, state-home, cache-home, archive-home, backup, time-machine, precious-work-tripwire
category: reference
facet: infra
status: active
---

# Where everything lives on the Mac, and what must never move

Place each data class by the precious-vs-regenerable axis, under the XDG/macOS root the OS already treats correctly. The host path resolver `~/.ecodiaos/env` is the single source of host-specific roots; new scripts source it, never hardcode `/Users/ecodia` (hardcoded literals are what manufactured the `C:/` and `D:/` junk).

**Why:** Hardcoded paths and HOME-root sprawl produced unbounded growth, host-coupling junk, and no map. The fix is canonical homes + a one-file resolver + a never-move invariant set, hardened by the swarm at [[mac-organisation-system-v2-hardened-2026-06-09]] (plan in `backend/drafts/`).

## Canonical homes

| Home | Class | Backed up | Contents |
|---|---|---|---|
| `~/.code` | code (precious) | yes | All git repos, containers, worktrees. Stays put forever (never physically reorganised - coupling cost). |
| `~/PRIVATE/ecodia-creds` | secrets | yes (encrypted) | Credentials. FROZEN, daemon-coupled. |
| `~/.ecodiaos` | runtime + resolver | yes | `coordination/` (coord bus, FROZEN), `laptop-agent.token`, `env` (the path resolver). |
| `~/.config/ecodiaos` | config | yes | Non-secret tuning, cron defs, placement + hygiene allow-lists. |
| `~/.local/state/ecodiaos` | state (append-only) | yes | Heartbeats, run cursors, manifests, quarantine ledger. |
| `~/.local/share/ecodiaos` | data (precious) | yes | `archive/` (dead repos, dead snapshots, gzipped old logs - kept, never deleted). |
| `~/.cache/ecodiaos` | regenerable | NO (TM-excluded) | Models (bge etc), build caches, scratch. Anything rebuildable. |
| `~/Library/Logs/ecodiaos` | logs | optional | Agent logs (Console.app visibility). |

## The resolver (`~/.ecodiaos/env`)

One file per host. A host swap edits this file only. Keys: `CODE_ROOT CONFIG_ROOT STATE_ROOT CACHE_ROOT DATA_ROOT ARCHIVE_ROOT LOG_ROOT CREDS_DIR COORD_ROOT HOST_ID`. Source it in shell scripts; the XDG vars (`XDG_CONFIG_HOME` etc) are set in `~/.zprofile`.

## FROZEN invariant set - never relocate (silent-failure paths)

These have daemon / MCP-server / harness consumers that fail SILENTLY if the path moves. Add-only, never move:
1. `~/PRIVATE/ecodia-creds` - cred-refresher daemon + 3 plists.
2. `~/.ecodiaos/coordination` - coord bus.
3. `~/.code/eos-laptop-agent` - 3 launchd daemons anchored to its WorkingDirectory.
4. `~/.code/ecodiaos/backend/knowledge-index/index.sqlite*` - `.mcp.json` args pointer.
5. `~/.code/ecodiaos/backend/codebase-manifest/manifest.json` + its ROOTS.
6. The auto-memory slug `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory` - encodes the backend cwd; literal in `knowledge-index/indexer.js` + `settings.json`.
7. `~/.claude/hooks/**` - live outside the repo.

Before moving anything, grep the coupling files (3 plists, `.mcp.json`, `manifest.json`, `indexer.js`) for the source path. If it appears, the move is forbidden until those refs change in the same commit and the daemon is `launchctl`-reloaded.

## Backup posture (single-SSD exposure)

This Mac is a single internal SSD with NO Time Machine destination configured = zero backup. The `precious-work-check.sh` tripwire (launchd daily 08:30, `backend/scripts/`) writes `~/.local/state/ecodiaos/precious-work-heartbeat.json` and the `knowledge-sessionstart` hook surfaces a BACKUP ALARM at session boot. Stashes + unpushed commits are precious and unprotected by anything until a backup drive is attached and Time Machine pointed at it. Uncommitted work cannot be saved by git at all.

## Anti-patterns

- Hardcoding `/Users/ecodia` in a new script. Source `~/.ecodiaos/env`.
- Putting new data at HOME root (`~/artifacts` etc). Use the XDG homes.
- Moving a FROZEN path. It fails silently; daemons and MCP servers break.
- Treating "lots of free disk" as "backed up". Free space is not a backup.
