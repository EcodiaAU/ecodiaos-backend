# Hook-stack invariant audit - 2026-05-08

Fork: `fork_mow8ykg8_cdc495`
Commit context: main HEAD (no mutations made by this fork - read-only audit).
Auditor: EcodiaOS fork.

## Verdict

**DRIFT_DETECTED, severity P2.**

- 10/10 documented mechanical-surfacing hooks PRESENT, REGISTERED, EXECUTABLE.
- `lib/emit-perf.sh` PRESENT, EXECUTABLE.
- `lib/strip-tag-lines.sh` **MISSING** on disk despite CLAUDE.md naming it as the canonical shared helper that "every keyword-scanning hook MUST" use.
- No hook script performs inline tag-line stripping either - the protection mechanism documented in `~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md` is silently absent.
- 3 additional hooks registered + on disk that are NOT in the 30-Apr-2026 10-hook list: `emdash-detector.sh`, `gui-macro-discovery-surface.sh`, `haiku-semantic-review.sh`. These are post-30-Apr additions (referenced elsewhere in CLAUDE.md), not orphans.

No P1 drift (no documented hook missing on disk). No documented hook non-executable. No registered hook missing on disk.

## settings.json hook count

`~/.claude/settings.json` contains 13 distinct hook-script command paths (matching the 13 .sh files on disk under `~/ecodiaos/scripts/hooks/`), plus 2 inline jq commands and 1 node command (`stale-schedule-audit.js`). No `~/.claude/settings.local.json` present.

## Per-hook table

All probed at 2026-05-08 ~11:38 AEST.

| Hook | Registered | File exists | Executable | Sources strip-tag-lines | SHA256 (16) | Last modified |
|---|---|---|---|---|---|---|
| brief-consistency-check.sh | yes | yes | yes (-rwxrwxr-x) | no | 558c12a7294dbfbd | 2026-05-05 04:58 |
| cred-mention-surface.sh | yes | yes | yes | no | ec9aabeecf9033e1 | 2026-05-05 06:37 |
| doctrine-edit-cross-ref-surface.sh | yes | yes | yes | no | 24bdeb784390cc01 | 2026-04-29 12:06 |
| status-board-write-surface.sh | yes | yes | yes | no | 5f543abe11e2954c | 2026-04-29 12:06 |
| fork-by-default-nudge.sh | yes | yes | yes | no | 7a0bc6d1b2bc1f27 | 2026-04-29 04:37 |
| anthropic-first-check.sh | yes | yes | yes | no | 775752da46c9db2f | 2026-04-29 22:31 |
| cowork-first-check.sh | yes | yes | yes | no | 793b43933c3c9873 | 2026-04-29 22:31 |
| episode-resurface.sh | yes | yes | yes | no | e480fe0a313b168b | 2026-04-29 22:31 |
| macro-runbook-write-surface.sh | yes | yes | yes | no | 82f87312b55b5fde | 2026-04-29 22:31 |
| post-action-applied-tag-check.sh | yes | yes | yes | n/a (consumes tags) | ab8aa7c820e8f2bf | 2026-04-29 22:31 |
| emdash-detector.sh (post-30-Apr) | yes | yes | yes | no | d5286e2e19c794ff | 2026-05-06 10:42 |
| gui-macro-discovery-surface.sh (post-30-Apr) | yes | yes | yes | no | d746e989466e86bd | 2026-05-05 23:58 |
| haiku-semantic-review.sh (post-30-Apr) | yes | yes | yes | no | 27dcf4e39edb1d95 | 2026-05-06 00:16 |

Shared lib:

| File | Exists | Executable | SHA256 (16) | Last modified |
|---|---|---|---|---|
| lib/emit-perf.sh | yes | yes | f7599a4b298926ed | 2026-04-29 22:31 |
| lib/emit-telemetry.sh | yes | no (-rw-rw-r--) | not hashed | 2026-04-29 06:18 |
| lib/strip-tag-lines.sh | **NO** | n/a | n/a | n/a |

## Drift list

### Missing (P2)

- `~/ecodiaos/scripts/hooks/lib/strip-tag-lines.sh` - documented in `~/ecodiaos/CLAUDE.md` "Hooks must not fire inside `[APPLIED]` / `[NOT-APPLIED]` tag lines" section as the shared helper. Cross-ref pattern `~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md`. Origin: 6+ false positives 21:00-21:12 AEST 29 Apr 2026 across `cred-mention-surface.sh`. Operational impact: keyword-scanning hooks (cred-mention, brief-consistency, doctrine-cross-ref, episode-resurface, status-board, macro-runbook, anthropic-first, cowork-first, fork-by-default, gui-macro-discovery, haiku-semantic) may currently fire false positives when the tool input or the surrounding turn contains `[APPLIED] <pattern>`/`[NOT-APPLIED] <pattern>` tag lines that name doctrine triggers. The 29 Apr 2026 bug is not provably remediated; either the helper was never authored, was lost in a later cleanup, or the protection was inlined and later regressed.

### Orphan (none)

Every `.sh` under `~/ecodiaos/scripts/hooks/` is registered in `~/.claude/settings.json`. `lib/emit-telemetry.sh` is non-executable but is a sourced library not a top-level hook script, so it does not need to be executable when sourced via `.`/source. Cosmetic only.

### Non-executable hooks (none)

All 13 hook scripts have exec bit set. Ownership tate:tate uniform.

### Cosmetic (P3)

- `lib/emit-telemetry.sh` is `-rw-rw-r--` (no exec bit). Not registered as a top-level hook (sourced as a library). No operational impact.

## Severity rationale

P1 was reserved for "any documented hook missing on disk" - none. P2 was reserved for "orphan" - none in the strict sense. The missing `lib/strip-tag-lines.sh` is a documented shared helper whose absence weakens the keyword-scanning surface but does not silently disable any single hook; every documented hook still runs and still emits its warn line. Calling it P2 because the documented protection mechanism against false-positive cascading is absent and the cascading false-positives have a concrete prior incident (29 Apr 2026, 6+ false positives in 12 minutes).

## next_step

Conductor: dispatch a small focused fork to either (a) restore `lib/strip-tag-lines.sh` from a known-good commit (search `git log --all --diff-filter=A -- 'scripts/hooks/lib/strip-tag-lines.sh'`) and source it from each keyword-scanning hook, OR (b) author it fresh per the doctrine spec ("strip lines beginning with `[APPLIED]`, `[NOT-APPLIED]`, `[BRIEF-CHECK WARN]`, `[CONTEXT-SURFACE WARN/PRIMARY/ALSO]`, `[CRED-SURFACE WARN]`, `[FORCING WARN]`") and wire it into the 11 keyword-scanning hooks listed above. Retain `post-action-applied-tag-check.sh` as the one consumer of tag lines.

No status_board P1 row written (drift is P2). A P3 row may be appropriate but the brief authorises P1 only - leaving that decision to the conductor.

Audit ends.
