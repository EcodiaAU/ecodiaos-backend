---
triggers: mac-organisation, filesystem-layout, xdg, canonical-homes, mac-hygiene, hygiene-canary, safe-delete, quarantine, placement-hook, mac-where, c-junk-host-coupling, backup, time-machine, single-ssd, path-resolver, frozen-invariant-paths, session-log-rotation, scalable-repos, ghq
category: doctrine
facet: infra
status: active
---

Whole-Mac organisation system, hardened by an 11-agent adversarial+recon+research swarm (wf_dd650dbb-984, 2026-06-09) against the v1 design at drafts/mac-organisation-system-design-2026-06-09.md. The swarm reversed three v1 decisions (HOME-root sprawl -> XDG; hand-authored map -> generated; opportunistic-reorg -> overlay-permanent) and surfaced the single-SSD backup gap. This is the canonical plan; v1 is superseded.

# WHOLE-MAC ORGANISATION SYSTEM v2 (HARDENED)

Replaces `mac-organisation-system-design-2026-06-09.md`. EcodiaOS canonical workstation. Goal: organised by system, scales to 50+ repos and years of state, never loses anything precious.

The machine is not space-constrained (3.5TB free, 1% used). Every problem here is a *lifecycle and placement* problem, not a *space* problem. v2 therefore optimises for "never lose something precious" and "the map never drifts from reality" over "reclaim bytes." Deletion is the highest-risk verb in the whole system and is treated as such: nothing is ever deleted, only quarantined with an undo window, and only from an allow-list of proven-regenerable patterns.

---

## 0. What changed from v1, and why

v1 was rejected on three load-bearing decisions. v2 reverses all three:

| v1 decision | v2 decision | Reason |
|---|---|---|
| HOME-root homes (`~/artifacts ~/models ~/state ~/archive`) | XDG roots (`~/.cache ~/.local/state ~/.local/share`) + `~/Library/Logs` for logs | HOME-root matches no convention, gets zero OS treatment (no Time Machine exclusion, no Console.app), breaks portability to VPS/Linux. XDG is self-documenting and host-portable. |
| `mac.where` hand-authored doc | `mac.where` **generated** from the coupling files | A hand-doc is a 4th copy of truth that drifts the instant a plist/manifest changes - the exact world-model-staleness disease this project fights. |
| "overlay-first, reorg opportunistically later" | **Overlay PERMANENTLY for repos** (never physically reorg `~/.code`); the only physical moves are unambiguous scratch + dead snapshots into archive | "Opportunistically later" is an open loop that never closes - it is literally how the current accretion happened. The coupling blast radius (manifest ROOTS, indexer slug, plists) makes a `~/.code` reorg recurring expensive for zero benefit. |

Every adversarial critique below is applied, not declined. Where a critique surfaced a hard safety rule it became a *hard guard wired into code*, not a doctrine line.

---

## 1. Canonical directory scheme (first principles, XDG + macOS)

**Principle: place each data class by the precious-vs-regenerable axis, under the root the OS already treats correctly for that class.** Set the XDG env vars explicitly in the shell profile so every XDG-aware tool agrees and the scheme is self-documenting and portable.

```sh
# ~/.zprofile  (and mirrored into ~/.ecodiaos/env, see §8)
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_STATE_HOME="$HOME/.local/state"
export XDG_DATA_HOME="$HOME/.local/share"
```

### The canonical homes

| Home | Class | Backed up? | TM-excluded? | Contents |
|---|---|---|---|---|
| `~/.code` | **code (precious)** | yes | no | All git repos, repo-containers, worktrees, scratch. Stays exactly where it is. |
| `~/PRIVATE/ecodia-creds` | **secrets** | yes (encrypted) | no | Creds. **FROZEN. Does not move.** 0700. Daemon-coupled. |
| `~/.ecodiaos` | **runtime + resolver** | yes (small) | no | `coordination/` (coord bus - **FROZEN, daemon-coupled**), `laptop-agent.token`, and the new `env` resolver (§8). |
| `~/.config/ecodiaos` | **config (precious)** | yes | no | Non-secret tuning, cron definitions, placement allow-lists, hygiene config. |
| `~/.local/state/ecodiaos` | **state (semi-precious, append-only)** | yes | no | Hygiene heartbeat, run cursors, hygiene manifests, quarantine ledger. |
| `~/.local/share/ecodiaos` | **data (precious)** | yes | no | `archive/` (dead repos, dead snapshots, gzipped old logs - kept, never deleted), kept artifacts. |
| `~/.cache/ecodiaos` | **regenerable** | **no** | **yes** | Models (bge etc), build caches, scratch render outputs, ephemeral artifacts. Anything rederivable. |
| `~/Library/Logs/ecodiaos` | **logs** | optional | yes | Agent logs (Console.app visibility; matches where `eos-laptop-agent.*` logs already land). |

### Two macOS-native exceptions, justified individually

- **Logs -> `~/Library/Logs/ecodiaos`**: earns Console.app visibility and matches the existing `~/Library/Logs/eos-laptop-agent.{out,err}.log`. Symlink into `~/.local/state/ecodiaos/logs` so XDG-aware tooling also finds them.
- **Bulk regenerable cache -> `~/.cache`**: earns free Time Machine exclusion for the GB-scale model/build blobs that must never bloat backups.

Everything else stays pure XDG. Nothing goes into `~/Library/Application Support` (buys nothing for a CLI-shaped agent, breaks portability).

### The FROZEN invariant set (load-bearing absolute paths - never relocate in v2)

These have daemon / MCP-server / harness consumers that fail **silently** when the path moves (per `substrate-path-coupling-survives-host-swap-as-silent-no-op`). They are add-only-never-move:

1. `~/PRIVATE/ecodia-creds` (+ `refresh.log`) - cred-refresher daemon, all 3 plists.
2. `~/.ecodiaos/coordination` - coord bus state.
3. `~/.code/eos-laptop-agent` - 3 launchd daemons, relative-path-anchored to its WorkingDirectory.
4. `~/.code/ecodiaos/backend/knowledge-index/index.sqlite{,-wal,-shm}` - self-resolves via `__dirname`; the `.mcp.json` args pointer breaks if the repo moves.
5. `~/.code/ecodiaos/backend/codebase-manifest/manifest.json` + its 5 indexed ROOTS.
6. The Claude-Code auto-memory slug dir `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory` - encodes the backend cwd; embedded literally in `knowledge-index/indexer.js` and `settings.json`.
7. All `~/.claude/hooks/**` (hooks live outside the repo; insulated from repo moves).

**Rule wired into the hygiene canary (§4): before any move, grep the 6 coupling files (3 plists, `.mcp.json`, `manifest.json`, `indexer.js`) for the source path. If it appears, the move is forbidden until those refs are edited in the same commit and the daemon `launchctl`-reloaded.** `~/.local/state` and `~/.local/share/archive` are destinations for *free-floating junk only* (rotated session-log gzips, dead snapshots, stray root files), never a relocation target for any path a plist/`.mcp.json`/`manifest`/`indexer` references.

---

## 2. Overlay vs reorg - DECIDED: overlay, permanently, for code

**Decision: `~/.code` is never physically reorganised. Repos, containers, and worktrees stay exactly where they are forever.** The coupling cost (manifest ROOTS, indexer slug, worktree parents, hundreds of CLAUDE.md pointers) is real and *recurring* - it would be paid again on every future move - for a purely cosmetic benefit.

Instead, `~/.code` is made **self-describing** rather than tidy:

- A generated `~/.code/INDEX.json` + human-readable `~/.code/INDEX.md`, maintained by the canary, tags every top-level entry by *kind* (see §3 taxonomy). "Where does X live" is answered by querying the index, not by the dir being physically grouped.
- A **one-time** physical sweep of only the unambiguous, zero-coupling junk:
  - Scratch: `nah/`, `wk07tmp/`, `wk*tmp/` -> `~/.local/share/ecodiaos/archive/scratch/` (kept 30d then eligible for quarantine).
  - Dead snapshots: `migration-snapshots/` (1.4G, dated 2026-05-15) -> `~/.local/share/ecodiaos/archive/snapshots/`.
  - Loose root files: `kill8000.ps1`, `eslint-out.json`, `sc_home.html`, `sc_leap.html`, `.DS_Store` -> `~/.local/share/ecodiaos/archive/loose-root/` (the `.ps1`/`.html` are Windows-era strays; `eslint-out.json` is a zero-byte stray).

The "opportunistic reorg later" line from v1 is **killed**. The placement rule (§3) governs only genuinely *new* top-level entries.

---

## 3. Placement rule + hook (tuned against the false-positive critique)

### The taxonomy (the real invariant is "a code-bearing dir", not "a git repo")

v1's "git repos only in `~/.code`" is false against the live tree - it would false-positive on ~13 of ~40 entries day one (worktrees, the `ecodiaos` container, `macro-recordings`, scratch). The placement hook is an **allow-list of recognised top-level KINDS**, seeded from the actual `ls ~/.code`:

| Kind | Detection | Examples (live) |
|---|---|---|
| `repo` | has `.git` | `coexist`, `glovebox-ios`, `goodreach` |
| `container` | named in containers list, holds repos | `ecodiaos` (backend+frontend), `glovebox`, `locals-*`, `seedtree-*` group |
| `worktree-parent` | name matches `*-worktrees` or `_worktrees` | `_worktrees`, `context-worktrees` |
| `recording` | named in recordings list | `macro-recordings`, `macro-test-recordings` |
| `scratch` | prefix `wk*`, `nah`, `tmp*` | `wk07tmp`, `nah` |
| `tooling` | dotdir | `.vscode`, `.ruff_cache`, `.claude` |

### The hook (advisory, never blocking, telemetry-gated)

`~/.claude/hooks/ecodia/placement_surface.py` (PreToolUse on `Write|Edit|Bash`):

- Fires **only** when a write/mkdir targets a *genuinely novel* top-level `~/.code` entry that matches **none** of the recognised kinds AND has no `.git` AND is non-trivial size. Worktree creation (the 0th-class parallelism primitive) and container repos never fire.
- **Artifact carve-out (fixture vs ephemeral):** the rule "no `.png/.mp4/.pdf` in a repo" is wrong for the 806 checked-in visual-regression baselines (`laptop-hands/.shots/`, `.diffs/`). Encode the carve-out by path: anything under a repo's `.shots/ .diffs/ __fixtures__/ assets/ brand/ public/` is in-repo-legitimate. Warn only on an artifact written to a repo **root** or a non-fixture dir. Seed the allow-list from the existing 806 so the hook starts silent on known-good.
- **First 14 days: log-only, clock-enforced.** It writes would-fire events to `~/.local/state/ecodiaos/placement-events.jsonl` and surfaces nothing. The arm date is a timestamp (`arm_after_ts`) in `~/.config/ecodiaos/placement.json`; the hook reads the false-positive count out of telemetry and refuses to surface a `[PLACEMENT WARN]` before `now > arm_after_ts` (§4.6 clock discipline - never a memory-driven flip). This is the same advisory-then-arm discipline the critique demanded for the hygiene sweep.

The allow-lists live in `~/.config/ecodiaos/placement.json` (kinds, container names, fixture paths, `arm_after_ts`) so tuning is a config edit, not a code change.

---

## 4. Hygiene system - SAFE-DELETE policy + what runs it

### 4.1 Split the problem into two substrates, each with the right tool

| Substrate | Tool | Why |
|---|---|---|
| Append-only JSONL session logs (the flat `~/.claude/session_logs` dir + the project slugs) | **canary open-handle sweep** (NOT newsyslog - see §4.2) | The flat dir is appended-on-resume exactly like the slugs; mtime is not a liveness signal, so it needs the same lsof guard. |
| Build artifacts, model caches, dead-repo snapshots, scratch | **custom canary sweep** (allow-list, quarantine-first, dry-run) | Needs classification + git-safety checks. |

**Never one script that deletes both classes blind.** Both run inside the one canary so the heartbeat covers them, but each class gets its own resume-safe rule.

### 4.2 Session-log rotation is open-handle-gated, NOT newsyslog (resume-safety fix)

v2's first cut put the flat `~/.claude/session_logs/*.jsonl` dir on newsyslog. That was mis-scoped: the harness appends to those files on `--resume` (verified - `2026-06-07_*.jsonl` last-written 2026-06-08, a day after its name-date), and newsyslog rotates by size/`when` against mtime+name with no concept of an open handle. It would gzip an active or resumable session out from under the harness exactly like the slug dirs the plan already protects. **newsyslog is removed from this plan entirely.**

Session-log rotation is a canary rule with a hard open-handle guard:

- A `.jsonl` is **eligible** for gzip-into-archive only when: age > 14d AND `lsof <file>` shows no open handle AND it is not under an active project-slug dir.
- Eligible files gzip into `~/.local/share/ecodiaos/archive/sessions/`, keep-last-N generations, kept never deleted.
- The active project-slug dirs (`-Users-ecodia--code-ecodiaos-backend/`, including nested `subagents/`, `workflows/wf_*`) and any file with a live `lsof` handle are **never** touched, regardless of age or name-date. mtime is not a liveness signal here; the open handle is.

This kills the newsyslog `root:wheel` sudo-write dependency (§residual-2) as a side effect - rotation now runs entirely as the canary's own user, no `/etc/newsyslog.d/` write.

### 4.3 Dead-host slug classification (corrected)

Classify by **host-encoding semantics, not string-guessing**:

| Slug | Verdict | Action |
|---|---|---|
| `D---code-ecodiaos-backend` (1.3G), `d---code` (69M) | **dead** - Windows drive-letter encoding (Corazon, decommissioned 2026-06-08) | gzip -> `~/.local/share/ecodiaos/archive/sessions/` (kept, not deleted) |
| `-Volumes-Turbo--code-ecodiaos-backend` (2.3M, written 2026-06-07) | **LIVE-recent** - a Mac mount path, this same machine 2 days ago. NOT Corazon-era. | keep hot; archive only after 14d like any local slug |
| `-Users-ecodia--code-ecodiaos-backend` (348M, active cwd) | **active** | never touched - matches current cwd encoding |

Dead-host detection keys on a **host registry** in `~/.config/ecodiaos/hosts.json` (`dead: [Corazon, D-drive]`, `live: [this-mac, vps]`), never on guessing a substring.

### 4.4 The SAFE-DELETE policy (custom sweep)

Six hard rules, wired into the sweep code:

1. **`set -euo pipefail`, no naked `rm -rf $VAR`.** Never an interpolated rm. (GitLab-2017 class failure.)
2. **Allow-list to delete, precious-by-default.** An explicit allow-list of regenerable patterns ONLY: `node_modules`, `dist`, `build`, `.next`, `DerivedData`, `*.gz` beyond window, known `~/Library/Caches/<x>`, `*.tmp`. Anything unmatched is precious and untouched. No denylist (bypassable + catastrophic).
3. **Quarantine before delete, never straight to rm.** Real mode moves candidates to `~/.local/share/ecodiaos/.trash/<run-ts>/` (NOT `~/.cache` - quarantine must be backed up so an undo survives). A separate later run purges quarantine entries older than a **7-day grace TTL**, keyed on quarantine timestamp (idempotent).
4. **Per-run byte cap.** Abort if the candidate set exceeds 20GB - that signals a classification bug, not real garbage.
5. **Precious-guard hard exclusions:**
   - **Never descend into `**/.git/**`.** This protects git's own `index.stash.*.lock` files (4 are live in `backend/.git/` right now) - deleting one mid-stash corrupts the index, and `dispatch_worker` worktrees stash constantly. Stash locks are git's to clean, never the canary's.
   - Never touch `~/PRIVATE`, `.env`, `.credentials`, `*.key`, lockfiles outside known regenerable dirs, or any path git tracks.
   - **Dead-repo snapshots are NEVER auto-deleted** - only flagged for human review. Before flagging, run `git -C <repo> status --porcelain` + `git log --branches --not --remotes` and abort-to-human on any uncommitted/unpushed state (snapshots can hide unpushed commits).
6. **Unknown = precious.** No allow-list match -> leave it, surface it for human review. The unknown bucket is never deleted.

### 4.5 The regenerable-vs-precious table (the §70 deliverable v1 never shipped) - ships BEFORE any rule is armed

| Path / pattern | Class | Sweep action |
|---|---|---|
| `node_modules`, `dist`, `build`, `.next`, `DerivedData` | regenerable | quarantine when age>14d AND project untouched 14d |
| `~/.cache/ecodiaos/models` (bge etc) | regenerable | quarantine when age>30d |
| `knowledge-index/index.sqlite{,-wal,-shm}` | regenerable (rebuildable from corpus) BUT load-bearing path | **never touched** (FROZEN path) |
| `migration-snapshots/` | dead-but-precious | archive once, never delete |
| `backend/drafts/` (305M, recent uncommitted .md/.html) | **precious** | **never touched** - explicitly excluded |
| active-slug `subagents/`, `workflows/wf_*` | **precious (resume state)** | never touched; not mtime-eligible |
| flat `session_logs/*.jsonl` with live `lsof` handle | **precious (resumable)** | never touched; open-handle-gated (§4.2) |
| `laptop-hands/.shots`, `.diffs` (806 fixtures) | **precious (test baselines)** | never touched |
| dead-host session slugs | dead-but-precious | gzip-archive, kept 30d+ |
| `nah/`, `wk*tmp/`, loose root `.ps1/.html` | scratch | archive once (§2) |

Default for anything absent from this table: **precious-unless-proven-regenerable.**

### 4.6 What runs it - launchd, NOT the scheduler cron; clock-enforced arming

The scheduler dispatch path has a documented fragility history (the `signal_bound` / silent-fire saga). A deletion-capable canary must not depend on it. Per `health-canary-must-alert-not-silently-accumulate`:

1. **launchd, not scheduler-cron.** `~/Library/LaunchAgents/au.ecodia.mac-hygiene.plist`. No agentic dependency, no dispatch path.
2. **Heartbeat FIRST, then work (dead-man's-switch decoupling).** The very first action of every run is to write `{last_run, reclaimable_bytes:null, actions_taken:[], mac_where_ok:null}` to `~/.local/state/ecodiaos/hygiene-heartbeat.json` AND a `kv_store` row, BEFORE any sweep classification or `mac.where` generation. Sweep results and the `mac.where` verdict update the same record at the end. **Absence of a fresh heartbeat is itself the alert**, surfaced in morning-briefing. Because the heartbeat is written before any classification or generation can throw, a failure deeper in the run can never suppress the watchdog - it surfaces as a stale-fields alert instead (§residual-5). The `mac.where` generator and any sub-step that can throw is wrapped in try/except that records `{step}_failed` into the heartbeat rather than aborting the run.
3. **Clock-enforced 30-day REPORT-ONLY arming window.** For the first 30 days the canary computes what it *would* quarantine, writes the manifest, deletes nothing. The arm date is a timestamp `arm_after_ts` in `~/.config/ecodiaos/hygiene.json`, written once at install. **The launchd canary itself refuses to transition to `mode:armed` before `now > arm_after_ts`** - the flip is event-driven, not a memory-driven manual edit that could fire early or never. Each run that is still in the window writes `"ready to arm in N days"` into the heartbeat, and morning-briefing surfaces it, so arming is a noticed event. A `~/.local/state/ecodiaos/HYGIENE_PAUSE` kill-switch file aborts any run if present.

Cadence: canary daily in report/quarantine mode (session-log rotation, build-cache sweep, snapshot flagging all inside it). Quarantine-purge daily after 7-day grace. All idempotent (declarative keep-last-N / age-gate, fresh `stat` + `lsof` each run).

---

## 5. C:-junk root-cause fix (named hook files, writer+reader atomic, ARCHIVE not rm)

The bug: `Path('C:/Users/tjdTa/...')` on Mac has no leading slash, so it resolves **relative to the hook's cwd**, manufacturing a fresh `C:/Users/tjdTa/...` tree under whatever repo subdir is active. Six junk trees confirmed under `backend/{,clients,patterns,voice,codebase-manifest,knowledge-index}`.

**Fix all 9 hooks as writer+reader atomic pairs in one batch** - fixing writers without readers (or vice-versa) leaves observer/pulse/phase-g state permanently orphaned on Mac:

**Writers** (rewrite `Path('C:/Users/tjdTa/...')` -> `Path.home()/'.claude'/...`):
- `~/.claude/hooks/session_logger.py:38` -> `Path.home()/'.claude'/'session_logs'` (the primary culprit; canonical 551-file dir already exists there)
- `~/.claude/hooks/observer_signal.py:35` (+ mkdir :175)
- `~/.claude/hooks/scope-context.py:31`
- `~/.claude/hooks/ecodia/memory-substrate-routing.py:40,43` (STATE_DIR + AUTO_MEMORY_DIR - also repoint the dead `d---code` slug to the live `-Users-ecodia--code-ecodiaos-backend` slug)
- `~/.claude/hooks/ecodia/observer_signal_auto_ack.py:32`

**Readers** (must land on the SAME corrected path or state stays orphaned):
- `~/.claude/hooks/observer_signals_pending.py:30`
- `~/.claude/hooks/pulse_blocks.py:27`
- `~/.claude/hooks/ecodia/phase_g_gold_pending.py:32`

**Voice hooks with hardcoded Windows `python.exe` (no Mac fallback, fail silently):**
- `~/.claude/hooks/ecodia/ecodiaos-voice-chat-score.py:34`
- `~/.claude/hooks/ecodia/tate-voice-postwrite-check.py:21`
  -> guard: `PYTHON = '/usr/bin/python3' if os.path.exists('/usr/bin/python3') else sys.executable`

**Verification gate:** after the batch, `grep -rl 'C:/Users\|D:/.code\|/Volumes/Turbo' ~/.claude/hooks` must return empty.

**Disposal is ARCHIVE-with-undo, NOT `rm -rf` (residual-4 fix).** Phase 0 runs first, before the `.trash` tier exists, so the 6 junk trees must not be the one hard-delete in a no-delete plan. They move to `~/.local/share/ecodiaos/archive/c-junk-<ts>/` (not deleted), and a Phase-8-onward quarantine-purge run removes them only after the standard 7-day grace AND only once `grep -rl` confirms zero live consumers across `~/.claude/hooks` and the repo trees. Same undo discipline as everything else - a stray glob that caught a real file, or a `C:/Users/tjdTa` path that actually resolved somewhere live, is recoverable for 7 days.

**Regression guard:** add `grep -rl 'C:/Users\|D:/.code'` as a permanent line in the mac-hygiene canary - if it ever returns non-empty (a hook edited back to a Windows path), alert. The bug cannot silently reappear.

---

## 6. `mac.where` manifest - GENERATED, never authored

A hand-maintained map becomes a 4th copy of truth that drifts. `mac.where` is a **derived view**, generated by `~/.code/ecodiaos/backend/mac-where/generate.js` (sibling to `knowledge-index/lookup.js`, reusing its SQLite + front-door pattern), parsing the canonical sources so it *cannot* disagree with reality:

**Stable locations come FROM the coupling files:**
- `codebase-manifest/manifest.json` ROOTS (indexed repos)
- the 3 launchd plist env vars (`CREDS_DIR`, `COORD_ROOT`, `REFRESH_LOG_PATH`, node path)
- the 2 `.mcp.json` server `args[]` paths
- the canonical-homes list from `~/.ecodiaos/env` (§8)
- the generated `~/.code/INDEX.json` (top-level kinds)

**Volatile sizes are live-probed** at query time (`du`), never stored.

Exposed as an MCP tool `mac.where` (sibling to `knowledge.lookup`) so a session can ask "where does X live" and get the *current* answer. The generator runs inside the mac-hygiene canary **after the heartbeat write and inside a try/except** (§4.6) - a generation failure records `mac_where_failed` into the heartbeat and surfaces as an alert, it never aborts the canary or suppresses the dead-man's-switch. The generator also **alerts if any referenced path does not exist on disk** - which catches a broken move the same run it happens.

---

## 7. Backup / single-SSD-failure exposure (the critique's biggest gap)

3.5TB free solves *space*. It does nothing for **"never lose something precious"** - a single internal SSD is a single point of failure, and quarantine-with-undo only protects against the canary's own mistakes, not disk death. v2 closes this:

1. **Time Machine, configured explicitly** (not relying on path magic):
   - **Backed up:** `~/.code`, `~/PRIVATE` (already encrypted at rest), `~/.config`, `~/.local/state`, `~/.local/share`, `~/.ecodiaos`.
   - **Excluded:** `~/.cache` (all regenerable - models, build caches), `~/Library/Logs/ecodiaos`, every `node_modules`/`DerivedData`/`dist` under `~/.code` (regenerable, would bloat backups).
   - The canary asserts these exclusions each run (`tmutil isexcluded`) and alerts on drift.
2. **Off-machine for ONLY the not-in-git irreplaceable set (scoped down per the over-engineering flag).** Time Machine is local-disk-adjacent (external/network volume) and not catastrophe-proof, so the genuinely irreplaceable set gets a second copy off-machine - but that set is *narrow*, because the daily unpushed-work tripwire (point 3) already forces every repo to its remote. The off-machine job therefore covers only what is NOT recoverable from a git remote:
   - `~/.local/share/ecodiaos/archive` (dead-host session archives, dead snapshots) + authored docs that live in no repo (e.g. loose `backend/drafts/` content not yet committed).
   - It does **not** re-copy the whole precious set - the repos are already off-machine on their remotes, so backing them up a third way is redundant maintenance surface.
   - Transport: this box has `rsync` but **no `rclone`**. The job uses `rsync` to a mounted volume, OR Phase 5 installs `rclone` as an explicit pre-step before wiring the Supabase-Storage path (the `documents` bucket already used for founding docs). Weekly, launchd-driven. The job asserts its transport binary exists at start and alerts (does not silently no-op) if absent - per residual-2, a missing binary must surface, not be assumed-shipped.
3. **The unpushed-work canary is the daily precious-loss tripwire**, independent of deletion: it asserts every active repo has `git log --branches --not --remotes` empty (no unpushed precious work sitting only on this disk), answers "is there anything precious that exists ONLY on this SSD right now," and surfaces any offender in morning-briefing. This is what lets the off-machine job stay narrow.

---

## 8. Multi-host + scalability to 50+ repos

### The path resolver (adopt `manifest.json`'s own recommendation NOW)

The hardcoded `/Users/ecodia/...` literals in plists/`.mcp.json`/`manifest`/`indexer` ARE the cross-host coupling that manufactured the `D---code` and `-Volumes-Turbo` slug junk. A placement/hygiene system written with `/Users/ecodia` literals would *be the next host's junk source*. Fix the class, not the instance:

- **`~/.ecodiaos/env`** - one file per host, the single source of host-specific roots:
  ```sh
  CODE_ROOT=/Users/ecodia/.code
  STATE_ROOT=/Users/ecodia/.local/state/ecodiaos
  CACHE_ROOT=/Users/ecodia/.cache/ecodiaos
  DATA_ROOT=/Users/ecodia/.local/share/ecodiaos
  ARCHIVE_ROOT=/Users/ecodia/.local/share/ecodiaos/archive
  CREDS_DIR=/Users/ecodia/PRIVATE/ecodia-creds
  COORD_ROOT=/Users/ecodia/.ecodiaos/coordination
  HOST_ID=mac-canonical
  ```
- Every plist sources it. `manifest.json` gains a `paths_by_platform` resolver in `indexer.js`/`orient.js`/`mcp-server.js` (the file's own `_note` already recommends this). The placement + hygiene + `mac.where` scripts all resolve through it. A host swap then edits **one file**, not 5+ literal sites, and manufactures zero junk dirs.
- The dead-host slug rule keys on `~/.config/ecodiaos/hosts.json`, not string-guessing.

### Scaling the repo set (already 30+, heading to 50+)

The product-times-platform multiplier is the real growth driver and it is already rotting the flat tree: `glovebox` is split 5 ways (`glovebox`, `-android`, `-ios`, `-web`, `-design`), `locals` 4 ways, `seedtree` 3, `chambers` 2. v2 does **not** physically regroup these (coupling cost) - the **container kind + generated `~/.code/INDEX.json`** make the grouping queryable instead of physical. `mac.where` answers "show me all glovebox surfaces" by querying the index `family:glovebox`. Adding the 51st repo: it lands as a top-level dir, the canary tags its kind into the index next run, `mac.where` picks it up, and (if it should be indexed for codebase-awareness) `manifest.json` ROOTS gets the one-line addition in the same commit - the documented gap that `chambers/glovebox/goodreach` aren't yet in the manifest is closed by making "add to manifest ROOTS" a step in the new-repo checklist.

Lifecycle bounds growth (logs/snapshots rotate), placement homes new things (allow-list + INDEX), the generated map keeps it queryable. The system scales by construction, not by manual tidy.

---

## 9. Phased, reversible build order (lowest-risk first, reuse not rebuild)

Each phase is independently shippable and reversible. Nothing in an early phase depends on a later one. Reuses the existing knowledge-index SQLite/lookup substrate and the existing hygiene-pattern doctrine rather than rebuilding.

**Phase 0 - C:-junk fix (zero coupling, pure win, do first).** Batch-rewrite the 9 hooks (writer+reader atomic) + 2 voice-python guards (§5). Verify grep returns empty. **Move (not `rm`) the 6 junk trees to `~/.local/share/ecodiaos/archive/c-junk-<ts>/`** - undo-safe even though `.trash` proper does not exist yet. Reversible: hooks are git-tracked; trees are archived, recoverable. *Risk: none. Immediate stop to repo pollution, no hard delete.*

**Phase 1 - the resolver + canonical homes (create, don't move).** Write `~/.ecodiaos/env`, set XDG vars in `~/.zprofile`, `mkdir -p` the homes. Move *nothing* yet. Add the canonical-homes invariant + FROZEN set as a one-line block to `backend/CLAUDE.md`. Reversible: just dirs + env. *Risk: none.*

**Phase 2 - one-time physical sweep of zero-coupling junk only.** Move `nah/`, `wk*tmp/`, `migration-snapshots/`, loose root files into `~/.local/share/ecodiaos/archive/` (§2). Grep the 6 coupling files first to confirm none reference these (they don't). Reversible: `mv` back from archive. *Risk: low - archive, not delete.*

**Phase 3 - session-log rotation via the canary's open-handle rule.** No newsyslog, no `/etc/newsyslog.d/` sudo-write. The canary (built in Phase 4) carries the §4.2 open-handle-gated gzip rule; Phase 3 archives the two dead-host slugs (gzip into archive) and seeds the rule's config. Active + lsof-open + active-slug files untouched. Reversible: remove the rule's config / restore from archive. *Risk: low - gzip not delete, open-handle-gated.*

**Phase 4 - mac-hygiene canary in REPORT-ONLY mode.** Build the sweep with all 6 safe-delete rules + the regenerable-vs-precious table + heartbeat-FIRST dead-man's-switch + the open-handle session-log rule + the hook-portability + unpushed-work regression greps. launchd plist. **mode=report, clock-enforced via `arm_after_ts` (30 days)** - deletes nothing, writes manifests, validates the ruleset against real output, refuses to self-arm before the timestamp. Reversible: unload the plist. *Risk: low - cannot delete in report mode.*

**Phase 5 - Time Machine + scoped off-machine backup (§7).** Configure exclusions, assert them in the canary. Wire the weekly off-machine job over `rsync`-to-mounted-volume (or install `rclone` as an explicit pre-step for the Supabase path), scoped to archive + non-repo authored docs only. Assert the transport binary exists at job start and alert if absent. Arm the unpushed-work tripwire. Reversible: config only. *Risk: none - additive safety.*

**Phase 6 - `mac.where` generator + MCP tool (§6).** Build the derived-view generator reusing `knowledge-index/lookup.js`, wire it into the canary AFTER the heartbeat write and inside try/except, expose as `mac.where` MCP tool. Reversible: it reads, never writes. *Risk: none - read-only.*

**Phase 7 - placement hook in log-only mode (§3).** Ship `placement_surface.py` + `placement.json` allow-lists seeded from live `ls`. 14 days log-only, clock-enforced via `arm_after_ts`; read false-positive count from telemetry, hook refuses to surface before the timestamp. Reversible: unregister from settings.json. *Risk: low - advisory only.*

**Phase 8 - arm the canary + the resolver migration.** Only after the clock-enforced 30-day report window passes (`now > arm_after_ts`) and the manifests validate clean: the canary self-transitions to `mode=armed` (quarantine, not delete; 7-day undo). Adopt `paths_by_platform` in `manifest.json`/`indexer.js` so future host swaps edit one file. This phase also runs the first quarantine-purge that finally removes the Phase-0 `c-junk-<ts>` archive (after its own 7-day grace + zero-consumer grep). This is the only phase that touches load-bearing coupling, and it is last, after everything observing it is proven. Reversible: flip back to report; the resolver change is git-tracked and grep-verifiable. *Risk: medium - the only armed-deletion + coupling-edit phase, deliberately last.*

**Build order logic:** the irreversible-ish verb (armed deletion) and the only coupling edit are both last, after a clock-enforced 30 days of report-mode observation and after every safety layer (quarantine, backup, heartbeat-first, regression greps, open-handle guard) is already live. Nothing is hard-deleted anywhere in the plan - Phase 0's junk trees are archived with the same 7-day undo as everything else. Everything precious is protected before anything is ever removed.

---

## Net effect

Lifecycle bounds growth (the canary's open-handle session-log rule + snapshot/cache sweeps rotate state on schedule, no newsyslog/sudo dependency). Placement homes new things (XDG homes + clock-armed allow-list hook + generated INDEX). The generated `mac.where` keeps it queryable and *cannot drift* because it derives from the coupling files, and *cannot silence the watchdog* because the heartbeat is written before it runs. The C:-junk source is killed at the hook, archived-not-deleted, and guarded against recurrence. Single-SSD exposure is closed by TM + a *scoped* off-machine backup (archive + non-repo docs only, repos covered by the unpushed-work tripwire) + a daily unpushed-work tripwire. The path resolver means the next host edits one file instead of manufacturing junk. Every arming decision is clock-enforced, not memory-driven. And nothing precious is ever deleted - only quarantined with a 7-day undo, from an allow-list of proven-regenerable patterns, after a clock-enforced 30-day report-only proving window.

**Files this plan creates/edits (buildable surface):**
- New: `~/.ecodiaos/env`, `~/.config/ecodiaos/{placement,hygiene,hosts}.json` (each carrying `arm_after_ts` where applicable), `~/Library/LaunchAgents/au.ecodia.mac-hygiene.plist`, `~/.claude/hooks/ecodia/placement_surface.py`, `backend/scripts/mac-hygiene.sh`, `backend/mac-where/generate.js` + `mcp-server.js`.
- Edit (Phase 0): the 9 hooks + 2 voice hooks in §5.
- Edit (Phase 8 only): `codebase-manifest/{manifest.json,indexer.js}`, the 3 plists (source `~/.ecodiaos/env`), `backend/CLAUDE.md` (canonical-homes invariant block).
- Never created: `/etc/newsyslog.d/ecodia-sessions.conf` (removed in v2 - session-log rotation is the canary's open-handle rule, no sudo-write, no mtime-blind gzip of resumable sessions).
- Never edited / FROZEN: `~/PRIVATE`, `~/.ecodiaos/coordination`, `knowledge-index/index.sqlite`, the `.mcp.json` server args (unless the repo moves, which v2 forbids).