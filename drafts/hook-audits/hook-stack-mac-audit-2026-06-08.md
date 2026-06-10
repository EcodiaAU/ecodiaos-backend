# Hook Stack Mac Audit - 2026-06-08

## Settings.json sources scanned
- `/Users/ecodia/.claude/settings.json` (60 unique command paths)
- `/Users/ecodia/.claude/settings.local.json` (NOT PRESENT)
- `/Users/ecodia/.code/ecodiaos/.claude/settings.json` (NOT PRESENT)
- `/Users/ecodia/.code/ecodiaos/backend/.claude/settings.json` (1 valid: `chat-heartbeat.js`)

## Totals
- **Unique hook paths referenced: 61** (60 main + 1 backend; the `['package-lock.js` line was a jq parse artifact from a JSON array string, not a real hook reference)
- **Missing on disk: 0** (every referenced hook file exists)
- **Smoke-test fails: 0** (all 35 Python hooks compile; all 13 shell hooks `bash -n` clean)
- **Stub repairs needed: 0** (no missing files → no stubs written → no status_board P2 row needed)
- **Exec bit absent: 60** (BENIGN - settings.json invokes via `bash X.sh` or `python3 X.py`, exec bit not required)
- **Shebang absent: 3** (BENIGN - `memory-substrate-routing.py`, `observer_signal.py`, `session_logger.py` start with docstring `"""`; invoked via `python3` so shebang irrelevant)

## Dead-substrate references
- **None requiring removal.** The single match (`self_scheduling_nudge.py` line 19 mentions `factory.start_cc_session`) is in a docstring listing TRIGGER patterns the hook surfaces self-scheduling for, not active dispatch substrate.

## Corazon-era hard-coded paths (Mac portability violations)

### TIER 1 - HARD BREAKS (state files write to non-existent Windows paths; silent state loss on Mac)

| File | Line | Current | Proposed Mac fix |
|---|---|---|---|
| `observer_signal_auto_ack.py` | 32 | `"C:/Users/tjdTa/.claude/hooks/ecodia/state/observer_signals_local.jsonl"` | `str(Path.home() / ".claude/hooks/ecodia/state/observer_signals_local.jsonl")` |
| `observer_signals_pending.py` | 30 | `SIGNAL_FILE = Path("C:/Users/tjdTa/.claude/hooks/ecodia/state/observer_signals_local.jsonl")` | `SIGNAL_FILE = Path.home() / ".claude/hooks/ecodia/state/observer_signals_local.jsonl"` |
| `phase_g_gold_pending.py` | 32 | `GOLD_FILE = Path("C:/Users/tjdTa/.claude/hooks/ecodia/state/phase_g_gold.jsonl")` | `GOLD_FILE = Path.home() / ".claude/hooks/ecodia/state/phase_g_gold.jsonl"` |
| `pulse_blocks.py` | 27 | `CACHE_FILE = Path("C:/Users/tjdTa/.claude/hooks/ecodia/state/pulse_blocks_cache.txt")` | `CACHE_FILE = Path.home() / ".claude/hooks/ecodia/state/pulse_blocks_cache.txt"` |
| `memory-substrate-routing.py` | 40, 43 | `STATE_DIR`, `AUTO_MEMORY_DIR` hard-coded to `C:/Users/tjdTa/...` | `Path.home() / ".claude/..."` |
| `observer_signal.py` | 35 | `STATE_DIR = Path("C:/Users/tjdTa/.claude/hooks/ecodia/state")` | `Path.home() / ".claude/hooks/ecodia/state"` |
| `scope-context.py` | 31 | `SESSION_STATE_DIR = Path("C:/Users/tjdTa/.claude/hook_state/doc_contract_seen")` | `Path.home() / ".claude/hook_state/doc_contract_seen"` |
| `session_logger.py` | 38 | `log_dir = Path("C:/Users/tjdTa/.claude/session_logs")` | `Path.home() / ".claude/session_logs"` |

### TIER 2 - PYTHON INTERPRETER PATHS (no Mac fallback → script bombs)

| File | Line | Current | Proposed Mac fix |
|---|---|---|---|
| `tate-voice-postwrite-check.py` | 21 | `PYTHON = "C:/Users/tjdTa/AppData/Local/Programs/Python/Python313/python.exe"` | `PYTHON = "/usr/bin/python3" if Path("/usr/bin/python3").exists() else "C:/Users/tjdTa/AppData/Local/Programs/Python/Python313/python.exe"` |
| `ecodiaos-voice-chat-score.py` | 34 | Same Windows hardcode | Same fallback pattern |

### TIER 3 - BENIGN (already has fallback OR comment-only)

- `calibration-postwrite-check.py:32`, `ecodiaos-voice-postwrite-check.py:29` - already use `/usr/bin/python3 if exists else windows` pattern → works on Mac.
- `doctrine-edit-cross-ref-surface.sh:140`, `status-board-write-surface.sh:121` - `PYEXE="C:/..."` followed immediately by `[ -x "$PYEXE" ] || PYEXE="python"` → falls back on Mac.
- `applied_tag_telemetry.py:43` - Windows path is the DEFAULT for `ECODIAOS_TELEMETRY_DIR` env var, but settings.json sets `ECODIAOS_TELEMETRY_DIR=/Users/ecodia/.code/ecodiaos/backend/logs/telemetry` so the default is never used.
- `coord_events_pending.py:51` - Windows path is one of TWO probed candidates, Mac path tried FIRST and exists → fine.
- `dev_process_reflex_surface.py:91-92` - `D:/.code` strings are likely allowlist entries for keyword matching, not paths to access (read-only string compare).
- `chrome-cdp-launch-surface.sh:92,98` - all Windows refs are inside WARNING STRINGS that the hook emits to alert about Chrome profile paths, not paths the hook itself touches.
- `ecodiaos-voice-chat-score-surface.py:6`, `ecodiaos-voice-chat-score.py:8`, `ecodiaos-voice-postwrite-check.py:16` - `%USERPROFILE%` references are in docstrings ONLY; runtime paths use `Path.home()`.
- `memory-substrate-routing.py:11, 141` - Windows paths are inside emitted ADVISORY MESSAGES (docstring + warning text), not paths the hook accesses. Lines 40, 43 are the real breakage (counted in Tier 1).
- `observer_signal_auto_ack.py:52`, `observer_signal.py:96` - Windows path `D:\.code\EcodiaOS\backend\patterns\` is in a SKIP/exclusion pattern list (string match), not a path accessed.

## TOP 5 P1 FIXES (Mac portability)

1. **`observer_signal.py` STATE_DIR** - the postwrite-fires-on-every-tool observer logs nothing on Mac. Loss of observer telemetry substrate.
2. **`observer_signals_pending.py` SIGNAL_FILE** - the UserPromptSubmit hook reads stale-empty file on Mac; observer signals never surface to turn-start context.
3. **`observer_signal_auto_ack.py`** - same file as #2, write side; ack writes go nowhere.
4. **`pulse_blocks.py` CACHE_FILE** - UserPromptSubmit pulse block injection broken; continuity_blocks doctrine surface dead.
5. **`scope-context.py` + `session_logger.py`** - silent state loss on the global hooks dir (not the ecodia/ subdir); reload-skills / doc-contract-seen tracking broken.

`tate-voice-postwrite-check.py` and `ecodiaos-voice-chat-score.py` interpreter-path bug is technically Tier 1 too (subprocess call will EACCES with non-existent path), but Voice substrate is already covered by `ecodiaos-voice-postwrite-check.py` which has the proper fallback, so user-visible impact is reduced.

## Method recap
- jq-extracted command paths from each settings.json, de-duped.
- `[ -f ... ]` existence check on each path.
- `python3 -c "compile(open(p).read(), p, 'exec')"` for every `.py`.
- `bash -n` for every `.sh`.
- `grep -nE` for `C:[/\\]|D:[/\\]|%LOCALAPPDATA%|%APPDATA%|%USERPROFILE%|/mnt/c/|C:\\Users` across all existing hooks; manually classified Tier 1/2/3 by reading each hit's surrounding code.

## Hard rules respected
- No settings.json entries removed.
- No hook content modified.
- No stubs created (none needed - zero missing files).
- No status_board write (no stub repairs).
