# Mac telemetry layer dark - never-surfaced-pattern-scan cron output unreliable until 3-way port lands

**Authored 2026-06-08 ~10:30 AEST by the Sun 23:00 `never-surfaced-pattern-scan` cron worker (early/backfill fire from the Mac-day-1 install).**

## Finding

The `application-events.jsonl` pattern-application telemetry layer (per `patterns/layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26.md`) is dark on the Mac mini install. The only file on disk that matches the doctrine path is `/Users/ecodia/.claude-from-corazon/hooks/ecodia/logs/telemetry/application-events.jsonl` - a 13-row corpus inherited from Corazon, last appended `2026-06-04 13:33 AEST` (the migration cut-over moment). No Mac-local write has landed since.

373 patterns sit in `/Users/ecodia/.code/ecodiaos/backend/patterns/`. The 30-day telemetry window references only 12 distinct patterns. Naive application of the doctrine rule "zero fires >30d -> archive candidate" would mark 361 of 373 patterns as retire candidates, which is nonsense - the signal is broken upstream.

## Three-way break

Root-cause audit of the Mac install vs. the Corazon configuration:

| # | Layer | Corazon (working) | Mac (broken) | Evidence |
|---|---|---|---|---|
| 1 | Stop hook registration | `~/.claude/settings.json -> hooks.Stop[0].hooks[1]` invoked `applied_tag_telemetry.py` | `~/.claude/settings.json` is `{"effortLevel":"max"}` only. Project `backend/.claude/settings.json -> hooks.Stop` registers `chat-heartbeat.js` only, no telemetry hook. | `cat /Users/ecodia/.claude/settings.json`, `python3 -c "import json; print(json.load(open('.../backend/.claude/settings.json'))['hooks']['Stop'])"` |
| 2 | Default `TELEMETRY_DIR` | `ECODIAOS_TELEMETRY_DIR=C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry` env var set in Corazon settings | No `ECODIAOS_TELEMETRY_DIR` env var anywhere on Mac. Default fallback in `applied_tag_telemetry.py` is the literal string `"C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry"` - on POSIX `Path()` treats `C:` as a relative segment, so writes either fail or land in a junk subdir of cwd | `grep -A3 "TELEMETRY_DIR = Path" /Users/ecodia/.claude/hooks/ecodia/applied_tag_telemetry.py` |
| 3 | `PATTERN_PATH_RE` regex | Windows pattern paths (`D:[/\\].code[/\\]EcodiaOS[/\\]backend[/\\]patterns`) plus `~/ecodiaos/patterns/` (VPS-era path) | Both alternates miss the Mac canonical `/Users/ecodia/.code/ecodiaos/backend/patterns/`. Even if the hook ran on Mac it could not extract pattern paths from a transcript referencing the Mac filesystem. | `grep -A2 PATTERN_PATH_RE /Users/ecodia/.claude/hooks/ecodia/applied_tag_telemetry.py` |

Any one of the three is enough to dark the layer; all three are present.

## Affected crons

From `docs/superpowers/specs/2026-06-03-cron-corpus-design.md`:

- #17 `surfacing-rate-probe` (daily 06:00) - LEARN/SURFACE. P1-trips on "hooks fired <5 over 24h". Currently running blind, would false-fire P1 every day on Mac if active.
- #19 `applied-tag-telemetry-consumer` (every 15m) - LEARN/APPLY. Drains telemetry into substrate. Empty drain on Mac.
- #50 `never-surfaced-pattern-scan` (weekly Sun 23:00) - TUNE. This cron. Output is unreliable until the layer is alive.

Possibly also #16 `pattern-corpus-health-check` (weekly Sun 22:00) if it cross-references telemetry.

## Three fixes

Order them by who-owns-what to avoid stepping on the Mac-day-1 conductor.

### Fix A - Pure-code patches (low risk, ship anytime)

In `/Users/ecodia/.claude/hooks/ecodia/applied_tag_telemetry.py`:

1. Make `TELEMETRY_DIR` platform-aware:
   ```python
   import platform
   _default_dir = (
       Path.home() / ".claude" / "hooks" / "ecodia" / "logs" / "telemetry"
       if platform.system() != "Windows"
       else Path("C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry")
   )
   TELEMETRY_DIR = Path(os.environ.get("ECODIAOS_TELEMETRY_DIR", str(_default_dir)))
   ```
2. Extend `PATTERN_PATH_RE` to include the Mac canonical path:
   ```python
   r"(?:D:[/\\]\.code[/\\]EcodiaOS[/\\]backend[/\\]patterns[/\\]"
   r"|~?/ecodiaos/patterns/"
   r"|/Users/ecodia/\.code/ecodiaos/backend/patterns/"
   ```

Apply the same audit to every other Windows-hardcoded hook (`grep -l "C:/Users/tjdTa\|D:[/\\\\]\.code" /Users/ecodia/.claude/hooks/ecodia/`).

### Fix B - Stop hook registration (conductor-owned, higher risk)

Add a `Stop` hook entry to `/Users/ecodia/.code/ecodiaos/backend/.claude/settings.json` (project-level so it scopes to EcodiaOS sessions only, not every Mac CC session):

```json
{
  "type": "command",
  "command": "/usr/bin/python3 /Users/ecodia/.claude/hooks/ecodia/applied_tag_telemetry.py",
  "timeout": 8
}
```

This is the conductor's call - settings.json is high-leverage and the Mac install is mid-port. Leaving it to the systematic hook-port pass rather than dropping it ad-hoc here.

### Fix C - Doctrine pattern (next-arc capture)

Author `patterns/mac-port-of-windows-hardcoded-hook-scripts-requires-three-way-audit-2026-06-08.md` codifying the three-way audit checklist for every other Corazon-era hook (default path, path regexes, env var registration).

## Why this fire writes a P2 row instead of 10 retire candidates

Per `verify-deployed-state-against-narrated-state.md` and `outcome-classification-must-distinguish-unverified-from-success.md`: the doctrine threshold "zero fires >30d -> archive candidate" assumes a working telemetry pipeline. With the pipeline dark, the threshold reports universal absence rather than per-pattern absence. Shipping 10 randomly-selected retire candidates would be confident-sounding noise.

Per `pattern-lifecycle-active-narrowed-archived.md`: the cron's job is to SURFACE candidates to status_board for conductor review during weekly doctrine consolidation. The most useful candidate this fire can surface is "the upstream signal that feeds every TUNE/RE-AUDIT cron is broken on Mac". One real P2 beats ten fake P3s.

Per `cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`: silent success would be wrong here because the diagnosis IS the deliverable.
