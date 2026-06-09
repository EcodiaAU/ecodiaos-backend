# Whole-Mac Organisation System - v1 design (to be swarm-hardened)

## Grounded state (probed 2026-06-09)

- Disk: 3.6 TB internal SSD, 3.5 TB free (4% used). No external "Turbo" volume mounted (it was external, gone). Space is solved for years.
- `~/.code` 8.5 GB: ecodiaos 4.5G, migration-snapshots 1.4G (dead), coexist 996M, ~22 more repos flat.
- `~/.claude/projects` 1.7 GB session logs, 1.3 GB of it dead Corazon-era (`D---code-...`), unbounded growth (~1 GB/week).
- backend internal: node_modules 711M, knowledge-index 315M (model+deps), drafts 305M, a literal `C:` junk dir (5M) + `replay_pid2832.log` (3.4M) at root.

## Verdict

Space is a non-issue. The Mac is organised by accretion, not by a system: no lifecycle (logs/snapshots grow forever), no placement rule (a new repo/artifact lands by hand), no map (where-things-live is a memory test), and a host-coupling bug manufactures `C:` junk dirs. Same gamble as the documents problem, one level up.

## Four problems (none are space)

1. Unbounded growth, no rotation (session logs 1.7G, snapshots 1.4G).
2. No canonical placement rule (`~/.code` is a flat bag of ~25 mixed things).
3. Host-coupling junk: hooks hardcoding `C:/Users/tjdTa/...` create literal `C:` dirs on Mac.
4. No filesystem map; where-does-X-live relies on memory.

## Design - extend the knowledge-system pattern to the whole machine

The knowledge system shipped today (one tree, one front door, lifecycle hooks, a freshness canary) is the template. Same four ideas at machine scale.

### 1. Canonical homes (overlay-first, not a big physical reorg)

Keep `~/.code` as the repo home (already mostly right). Add the homes for what currently sprawls inside repos / `.claude`:
- `~/.code/` - active git repos only (one repo per dir, dir name = GitHub repo).
- `~/.code/ecodiaos/backend/knowledge/` - doctrine corpus (built).
- `~/PRIVATE/` - credentials (laptop-agent-blocked).
- `~/artifacts/` - large non-versioned binaries: macro-recordings, screenshots, PDFs, audio, build outputs.
- `~/models/` - ML models (bge-small cache etc), regenerable.
- `~/state/` - machine state: rotated logs, session-log archive, the SQLite indexes, caches. Regenerable/rotatable.
- `~/archive/` - cold storage: dead repos, migration-snapshots, old session logs. Compressed.

Overlay-first means: do NOT move existing repo paths (breaks IDE workspaces, hardcoded paths, CLAUDE.md). Add the new homes for sprawl, reorganise repos opportunistically later.

### 2. Placement doctrine + hook

A decision procedure for where anything new goes (the filesystem analogue of the knowledge "one obvious home" rule), surfaced by a PreToolUse hook when a write targets outside the canonical homes (e.g. a `.png/.mp4/.pdf` artifact in a repo, a new non-git top-level dir in `~/.code`).

### 3. Lifecycle automation - the missing piece

A `mac-hygiene` canary (cron, once scheduler healthy; or launchd) that:
- rotates session logs (keep ~14d hot in `~/.claude/projects`, gzip-archive older to `~/archive/session-logs`, drop dead-host keys `D---code` / `Volumes-Turbo`).
- expires migration-snapshots past a window to `~/archive` or deletes.
- sweeps junk: literal `C:` dirs, stray root logs (`replay_pid*.log`), `.DS_Store`, orphaned lockfiles.
- reports reclaimable space, alerts on rot rather than silently accumulating.

### 4. Filesystem manifest - `mac.where`

A small queryable map of canonical locations and their purpose (sibling to `knowledge.lookup`). Locations are stable, so a doc indexed by knowledge.lookup is the cheap version; volatile facts (current sizes, reclaimable) are live-probed by the hygiene canary.

### 5. Root-cause fix - the `C:`-junk host-coupling bug

Find the hooks writing `C:/Users/tjdTa/...` on Mac (session_logger.py / observer_signal.py suspected) and fix them to the canonical Mac state dir, so the machine stops manufacturing its own mess.

### 6. Scalability

3.5 TB free scales space for years. The SYSTEM scales because: lifecycle bounds growth (rotation/archival), placement homes every new thing, the map keeps it queryable, and adding a client repo / app just follows the placement rule.

## Open decision

Overlay (placement + hygiene + map, leave repos where they sit) vs physical reorg of `~/.code`. Lean: overlay-first, reorganise opportunistically. The swarm should stress-test this.

## To be hardened by the swarm

- Adversarial: where does this break (path-coupling blast radius, placement-hook false positives, lifecycle deletion risk, manifest staleness, cloud/cross-host parity)?
- Research: best practice for autonomous-agent workstation organisation, log rotation, XDG/macOS conventions, scalable layout, what NOT to auto-delete.
- Future-proofing: multi-host (Mac canonical + VPS + any future node), the dead Corazon `D:/` keys, regenerable-vs-precious classification so hygiene never deletes something precious.
