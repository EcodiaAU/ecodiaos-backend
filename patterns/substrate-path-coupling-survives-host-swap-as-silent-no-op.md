---
triggers: codebase-manifest, indexer, host-swap, mac-port, windows-mac, path-coupling, fs-existssync-skip, silent-no-op, platform-bound-substrate, manifest-cross-platform, corazon-to-mac, conductor-host-swap, indexer-skip-missing, paths-baked-into-config, substrate-scripts-platform-bound, watcher-paths, scanner-skips-missing
status: active
authored: 2026-06-08
authored_by: codebase-manifest-refresh cron (first Mac-day fire)
---

# Substrate scripts bake authoring-host paths and silently no-op on host swap

## The class of failure

A substrate script (indexer, watcher, scanner, MCP server, daemon, sync job) is written on host A with absolute paths in its config or code. The path resolution layer uses `fs.existsSync(path)` (or equivalent) as a "skip if missing" guard. The substrate then survives a host swap to host B - but every target path now points at host A's filesystem, which does not exist on host B. The substrate runs to completion, reports zero errors, and indexes/walks/syncs nothing.

The crash you would have seen on host A becomes a silent no-op on host B. The output looks normal (`done. scanned=0 changed=0 elapsed=0.2s`) and the downstream consumer (orient brief, search index, watcher, etc) shows yesterday's truth from before the swap.

## Origin

2026-06-08, first Mac-day fire of `codebase-manifest-refresh` cron. The codebase-manifest substrate was authored on Corazon (Windows) with paths `D:/.code/EcodiaOS/backend`, `D:/.code/coexist`, etc baked into `manifest.json`. Mac mini became the canonical conductor host per `drafts/scheduler-resume-after-mac-2026-06-03.md` but the manifest was never re-ported. On Mac:

- Every `cb.path` in manifest.json points to a Windows path that does not exist
- `indexer.js::runFull` reads each codebase and guards: `if (!fs.existsSync(cb.path)) { log("skip missing", cb.id, cb.path); continue; }`
- All six codebases skip
- Indexer exits clean: `done. scanned=0 changed=0`
- `index.sqlite` mtime untouched but the data inside is frozen at May 24 (last Corazon run)
- `codebase-orient` skill consumers read the May 24 data and never know

The skill description correctly named the Mac path `/Users/ecodia/.code/ecodiaos/backend/codebase-manifest/index.sqlite`, so the DB file location was right. The DATA inside the DB was stale-by-host-swap.

### Second instance, same day: learning-telemetry-report.py

`backend/scripts/learning-telemetry-report.py` is the canonical SURFACE+APPLY liveness probe per [[recursive-improvement-loop-anatomy]]. On Mac it reported `surface-event fires: 0 / capture live in last 24h: False` while 534 dispatch rows and 13 application rows actually existed on disk. The script hard-coded `TELEM_DIR = Path("C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry")`, the Windows path where the hooks write on Corazon. The rsync-claude job copies those files to `/Users/ecodia/.claude-from-corazon/hooks/ecodia/logs/telemetry/` on Mac, but the script did not know to look there. Diagnosis surfaced from the `substrate-health-meta-audit` weekly cron fire 2026-06-08. Fix: an `ECODIAOS_TELEMETRY_DIR` env var override plus a candidate-list resolver that picks the first directory containing `dispatch-events.jsonl`. Same class of failure as the codebase-manifest case: report layer ran clean and reported zero work, while the producer layer (hooks on Corazon) was healthy and writing real telemetry.

## The general rule

When you author a substrate that walks the filesystem, ANY of these surfaces will bind that substrate to the authoring host unless explicitly de-coupled:

1. **Absolute paths in JSON/YAML/TOML config** (`manifest.json`, `targets.yaml`, `routes.toml`)
2. **Drive letters or root prefixes in code** (`D:/`, `C:\`, `/mnt/c/`, `/Users/foo/`)
3. **Path-prefix-stripping helpers** that match the authoring root (e.g. `shortPath` regex `^D:\/\.code\//` that silently fails on Mac paths)
4. **Tool description strings in MCP servers** (less load-bearing but they lie to consumers)
5. **Test fixtures** with hard-coded path expectations

The `fs.existsSync(path) → skip` pattern is the silent-no-op trap. It's defensive code that's right for "user dropped a stale entry" but wrong for "every entry is stale". Without a "fail if zero targets resolved" guard, the substrate can't tell the difference.

## Mitigations (do all three for new substrates, the third one retroactively for existing ones)

### 1. Keep absolute paths out of config

Use relative paths anchored to the substrate's own location (`__dirname`, `path.resolve(__dirname, "../...")`), env vars (`ECODIA_CODE_ROOT`), or a small resolver helper that infers the root from `os.platform()`. If you must have absolute paths, group them under a `paths_by_platform: {darwin, win32, linux}` map and resolve via `cb.paths_by_platform?.[process.platform] ?? cb.path`.

### 2. Document the host-binding explicitly

If a substrate IS host-bound for good reason, name that in the config or top comment. Future readers should not have to discover it via a Mac-day silent failure.

### 3. Fail-if-zero-targets guard

Every substrate that walks a target list should count successful resolutions and exit non-zero (or write a P3 status_board row) if the count is zero. The right shape:

```js
let resolved = 0;
for (const target of manifest.targets) {
  if (!fs.existsSync(target.path)) {
    log("skip missing", target.id, target.path);
    continue;
  }
  resolved++;
  // ... do the work ...
}
if (resolved === 0) {
  console.error("[fatal] zero targets resolved from", manifest.targets.length, "configured. Wrong host or stale paths?");
  process.exit(1);
}
```

This single check turns a host-swap silent no-op into a loud signal. Worth retrofitting onto any substrate that has the skip-missing pattern.

## How to apply

- **At authoring time:** every new substrate that reads filesystem targets gets either (a) relative paths anchored to `__dirname` / env var, or (b) a `paths_by_platform` map AND a fail-if-zero guard. Don't pick one; pick both for any substrate that ships across hosts.
- **At host-swap time:** sweep `~/ecodiaos/backend/` for `D:/`, `/Users/`, `C:\` prefixes and `fs.existsSync(...skip)` patterns. Each hit is a candidate for re-porting. Run substrates once and check their output (`files_scanned > 0`? `targets_resolved > 0`?) before trusting downstream consumers.
- **At cron-fire time:** if you're a worker fire of a substrate cron and the substrate runs clean with zero work done, that's the signal to investigate the substrate itself, not to silent-exit. The conditional-deliverable exception in [[cron-deliverables-can-be-conditional-not-all-fires-must-ship]] applies to genuinely-no-work cases (no diff to regen, no telemetry threshold breached), NOT to silent-no-op host-swap failures.

## Anti-patterns

- **"Re-running clears the warning."** Re-running a host-bound substrate on the wrong host just produces the same clean no-op output. The substrate looks healthy and the data inside the DB keeps growing stale. The fix is host-port, not retry.
- **"The skip-missing guard is defensive code, leave it alone."** The guard is right; what's missing is the COUNT-CHECK after the loop. Adding `if (resolved === 0) exit(1)` doesn't break the defensive intent; it makes it loud when the defense triggers on every target.
- **"Just rewrite the paths to Mac/Linux/wherever, skip the cross-platform resolver."** The Mac is the current canonical host but the next host swap (Mac mini -> bigger machine, machine -> cloud worker) is the same trap. A `paths_by_platform` map + resolver is 10 lines of code that prevents the silent-no-op class.
- **"The substrate must be broken because nothing's in the output."** First check whether the substrate even SAW its targets. The May 24 freeze on codebase-manifest looked like "indexer is broken" but was actually "indexer is running fine, the manifest is host-bound." Different fix.

## Related patterns

- [[verify-deployed-state-against-narrated-state]] - the indexer reported "done, scanned 2750" but on a Mac without porting it would have been "done, scanned 0" and the downstream skill would never have known. Verify deliverables, not narration.
- [[no-symbolic-logging-act-or-schedule]] - a substrate that runs clean and produces nothing is symbolic logging. The fail-if-zero guard converts that to a real signal.
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the triad here is (a) helper: the `paths_by_platform` resolver pattern, (b) hook: a fail-if-zero check inside every indexer, (c) doctrine: this pattern. All three same-arc.
- [[continuous-codebase-awareness-via-local-sqlite-index-2026-05-15]] - the substrate this incident surfaced inside. The parent doctrine for the codebase-orient skill + indexer + watcher trio.
- [[migration-vps-to-local-corazon-2026-05-15]] - sister migration arc with the same class of failure: substrates authored on host A surface latent path-coupling when host swaps to B.
- [[away-conductor-runs-on-corazon-not-vps-2026-05-20]] + [[corazon-services-must-be-pm2-supervised-with-reboot-persistence-2026-05-21]] - precursor host-swap arcs that ported VPS substrates to Corazon; the Corazon-to-Mac swap is the next leg in the same chain.
- [[world-model-staleness-needs-active-reconciliation-2026-05-17]] - meta-doctrine for the same class of failure at the documentation layer (CLAUDE.md drift after architectural moves).

## Detection (audit cadence)

When a conductor host swaps - and the Corazon-to-Mac swap is the canonical example - run a sweep over `~/ecodiaos/backend/` for substrates with these markers:

```bash
grep -rln "fs.existsSync" /Users/ecodia/.code/ecodiaos/backend/ --include="*.js" | head -20
grep -rln "D:/" /Users/ecodia/.code/ecodiaos/backend/ --include="*.js" --include="*.json" | head -20
grep -rln "/Users/" /Users/ecodia/.code/ecodiaos/backend/ --include="*.js" --include="*.json" | head -20
```

Each hit is a potential substrate path-coupling. Triage by frequency and load-bearingness.
