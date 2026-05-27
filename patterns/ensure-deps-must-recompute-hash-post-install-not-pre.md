---
triggers: ensure-deps, package-lock-hash, npm-install-loop, restart-loop, claude-sdk-binary-not-found, pm2-restart-loop, _consecutiveFailures, install-marker, lockfile-rewrite, pre-install-hash, post-install-hash, ecodia-api-restart-storm, hot-path-install
---

# Hash markers for npm-install gating must be computed AFTER install, not before

## The rule

When using a hash-marker pattern to skip `npm install` on hot paths (e.g. wrapping a PM2 `script` with an `ensure-deps.sh` that compares `sha256 package-lock.json` against `node_modules/.install-hash`), the LOCK_HASH written to the marker MUST be recomputed AFTER `npm install` returns, not captured before.

Reason: `npm install --omit=dev` (and most npm install variants) can rewrite `package-lock.json` mid-install. Triggers include peer-dep drift, `lockfileVersion` bumps, `optionalDependencies` resolution changing, npm version upgrades changing default lockfile shape. If the marker stores the pre-install hash, it permanently mismatches the now-rewritten lockfile, and every subsequent restart re-fires `npm install`.

When the wrapped script is also a host process that runs the Claude Agent SDK, npm install rewrites the SDK native binary (e.g. `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude`). SDK turns firing during the install window error with "Claude Code native binary not found at ...". Three consecutive failures trip `_consecutiveFailures` in `osSessionService.js` and `exec('pm2 restart ecodia-api')` fires, which boots into another ensure-deps run, which fires another npm install, which rewrites the binary again. Self-sustaining loop.

## Do

- Compute LOCK_HASH BEFORE the gate-check (to decide whether to skip)
- After `npm install` returns successfully, RECOMPUTE LOCK_HASH from the now-settled lockfile
- Write the post-install hash to the marker

```bash
LOCK_HASH=$(sha256sum "$LOCK" | awk '{print $1}')
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$LOCK_HASH" ]; then
  exit 0
fi
echo "[ensure-deps] $LOCK changed (or first run) - running npm install"
npm install --omit=dev --no-audit --no-fund
mkdir -p node_modules
LOCK_HASH=$(sha256sum "$LOCK" | awk '{print $1}')  # ← recompute
echo "$LOCK_HASH" > "$MARKER"
```

## Do not

- Trust that npm install is read-only against package-lock.json. It is not, even when the install otherwise succeeds (`exit 0`)
- Use the pre-install hash for the marker when npm install has any chance of mutating the lockfile
- Switch to `npm ci` as a "safer" alternative without considering its tradeoffs (npm ci wipes node_modules and reinstalls everything from scratch every time it runs, which is much slower than the conditional install pattern; the post-install-hash fix is cheaper)

## Verification

After fixing:
1. Dry-run the script: `bash scripts/ensure-deps.sh && echo "exit=$?"` - should exit 0 immediately if hash already matches
2. Watch PM2 uptime: `pm2 list` - `ecodia-api` uptime should grow past whatever the prior restart-cadence ceiling was
3. Spot-check restart count delta: count should be near-zero adds over the next hour
4. Check `kv_store.auto_restart_last_at` - should not see new "binary not found" entries

## Failure surface (cross-substrate)

When this loops, ALL of the following surface but each one looks like its own independent bug:
- `pm2 list` shows `ecodia-api` restarts climbing fast (~1/min) and uptime never exceeding ~2min
- `os_forks` rows logged with `status='error'`, `duration_s=0` (ended_at slightly before started_at due to clock skew)
- `cc_sessions` orphaned rows with `error_message='Session orphaned - process was killed without graceful shutdown'`
- `kv_store.auto_restart_last_at` reason field shows the SDK binary-not-found error
- `pm2 logs ecodia-api` shows clean repeated boot logs - listener-registry loaded, caches started, no error trace before death (the kill comes from a sibling process, not a crash)
- Forks erroring at 0s look like fork-spawn-time SDK boot failure but are actually the SDK native binary being unlinked by a concurrent npm install

The unified diagnosis path is `kv_store.auto_restart_last_at` - when that field's reason is "Claude Code native binary not found", the SDK binary-rewrite race is the real cause, not Anthropic provider failure.

## Origin

Tate was asleep / autonomous-window equivalent. ecodia-api was in restart loop for 4.7 days (6431 restarts at PM2 restart-counter when diagnosed). 67 fork errors in the 7h window before diagnosis; all instant-fail. Diagnosed 2026-05-05 22:55-23:10 UTC by tracing `kv_store.auto_restart_last_at`, then comparing `node_modules/.install-hash` (`8637f3...`) against current `sha256 package-lock.json` (`0ca8e1...`). `npm install --omit=dev` had been rewriting package-lock.json on every fire. Fix shipped commit 9c4d929 same turn.

The SELF.md 2026-05-01 fix (gating `_recordTurnOutcome(false, ...)` behind `!suppressOutput`) was correct as far as it went - it stopped credit-exhaustion failures on background turns from triggering auto-restart. But it did NOT cover this provider-binary-not-found mode because the binary-not-found error fires on EVERY turn including foreground, so the gate doesn't help.

Sibling cross-refs:
- `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md` - different self-kill cascade mechanism (scheduler-driven), same family of "host process kills itself via its own infrastructure"
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the marker file is a state seam between bash hash-comparison and node SDK binary-loading; the seam wasn't held consistent across npm install
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - a "fix shipped" claim 4 days ago in SELF.md was correct for one failure mode and silently incomplete for another; ground-truth was the live restart counter, not the documented fix
- `~/ecodiaos/patterns/substrate-before-doer.md` - third repeat of phantom-failure-shape (binary-not-found across 67 forks + factory session + chat) signalled substrate, not doer. The instinct to investigate fork-side or factory-side individually would have missed the npm install layer entirely
- `~/ecodiaos/patterns/_archived/no-pm2-restart-during-active-factory-queue.md` - auto-restart was firing while forks/factory sessions were in flight; this rule says don't pm2-restart during active queues, but here the restart was self-issued by the api itself in a loop, beneath conscious control
- `~/ecodiaos/patterns/grace-timer-must-not-kill-chat-session.md` - adjacent mechanism (a different `process.exit(1)` path in the same osSessionService.js); the grace timer was already disabled by env-flag default; this loop instead used the explicit `exec('pm2 restart ecodia-api')` path at line 703
