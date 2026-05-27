---
triggers: pattern-lifecycle, pattern-tuning, pattern-archive, pattern-narrow, overzealous-pattern, dead-pattern, doctrine-corpus-evolution, applied-tag-distribution, tag-silent-rate, never-applied-pattern, pattern-superseded, doctrine-pruning, doctrine-rot, retire-or-restate, pattern-corpus-health, narrowed-at, archived-at, superseded-by, pattern-state-active, pattern-state-narrowed, pattern-state-archived
---

# Pattern lifecycle: active / narrowed / archived

## Rule

Patterns in `~/ecodiaos/patterns/` have a lifecycle. They are not sacred. Authoring a pattern is the BEGINNING of its lifecycle, not the end. Every pattern is provisional - kept honest by usage data (Phase C `tag_distribution`, hook-fire telemetry) and superseding events (Tate-stated rule changes, infrastructure shifts, paid add-ons that invalidate prior bans).

Three explicit states tracked in pattern frontmatter:

- `active` (default, may be omitted) - pattern fires and gets applied at acceptable rate. Working as intended.
- `narrowed` - triggers were too broad, false-positive cluster observed. Triggers tightened (more specific compounds, fewer bare common nouns). Frontmatter records the tuning event.
- `archived` - pattern superseded, doctrine has drifted past it, OR pattern is provably dead (zero fires over 30d). File moved to `~/ecodiaos/patterns/_archived/<slug>.md` so trigger-grep skips it and the active corpus stays selective.

## Frontmatter convention

Active (default - status field optional):

```yaml
---
triggers: foo-bar, baz-qux, ...
---
```

Narrowed (after a tuning event):

```yaml
---
triggers: <tightened-trigger-set>
status: narrowed
narrowed_at: 2026-05-12
narrowed_reason: '[NOT-APPLIED] rate 78% over 7d - was firing on every dispatch mentioning <broad-noun>; tightened to <compound>-<compound> only.'
---
```

Archived (file lives under `_archived/`):

```yaml
---
triggers: <kept verbatim so historical greps still find the file>
status: archived
archived_at: 2026-05-07
archived_reason: 'Superseded by <new-canonical>.md when <event>.'
superseded_by: <new-canonical>.md
---
```

## Tuning triggers (when to act)

| Signal | Threshold | Action |
|--------|-----------|--------|
| `[NOT-APPLIED]` rate | > 70% over 7d | Narrow triggers. Pattern is overzealous - firing on briefs where the rule does not apply. |
| Zero fires | > 30d | Archive candidate. Pattern is dead - the briefs it was authored for are no longer being run. |
| `tagged_silent` rate (Phase C) | > 50% over 7d | Retire OR restate. Pattern is being ignored - it is not load-bearing for the model's decision. Either the rule is no longer needed, or the file body fails to motivate the rule. |
| Hook fires on a pattern that was renamed / superseded by a `git mv` | any | Archive immediately. Add `superseded_by:` referencing the new canonical pattern. Scrub stale references in hook config files (`~/ecodiaos/scripts/hooks/lib/*.json`, `~/ecodiaos/scripts/hooks/lib/*.md`, `~/ecodiaos/patterns/INDEX.md`). |
| Tate flags a false-positive in chat | any | Treat as "narrow OR archive" trigger that turn. Do not defer. |

## Do

- Author triggers AFTER the file body (per `~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md`).
- Track tuning events in frontmatter, not in chat narrative. The frontmatter IS the durable record.
- When archiving, `git mv` to `_archived/` - do not delete. The file body remains accessible for archaeology.
- When narrowing, leave the OLD trigger set in a comment block at the top of the file body so a future audit can see what was removed and why.
- Re-run the `triggers-must-be-narrow-not-broad.md` verification protocol after every narrow.
- Update INDEX.md and any hook config that hardcodes the path on archive.

## Do not

- Treat patterns as permanent once authored. They are provisional artefacts that earn their place via firing usefully.
- Archive a pattern just because it has not fired this week. Use the 30d window. Some patterns (release recipes, audit checklists) are correct to be quiet for long stretches.
- Narrow triggers without recording `narrowed_reason:` - the next narrow / un-narrow needs the audit trail.
- Leave `_archived/` files with their original `status: active` frontmatter. The grep / hook layer relies on the status field to skip archived files.
- Author a new pattern that contradicts an existing one without archiving the old one same-arc. Two contradictory patterns in `active` state is doctrine drift.

## Hook integration (referenced enforcement points)

- `~/ecodiaos/scripts/hooks/brief-consistency-check.sh` greps `~/ecodiaos/patterns/*.md` for triggers. Path-restrict to skip `_archived/`.
- `~/ecodiaos/scripts/hooks/lib/gui-target-recipes.json` and `~/ecodiaos/scripts/hooks/lib/haiku-doctrine-summary.md` reference specific pattern filenames. When archiving via `git mv`, update both so the GUI-macro hint hook does not point at a moved file.
- `pattern-corpus-health-check` weekly cron (Sunday 21:00 AEST) reads Phase C telemetry, classifies each pattern, surfaces tuning candidates to a single status_board P3 row. See `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 4 (act on telemetry).

## Origin

7 May 2026 16:20 AEST. Tate verbatim:

> "we need to codify it that you can tune them as we go so incase they're underutilised or overzealous"

Companion observation same session: 4 hook-fires of `never-use-ssh-on-macincloud-rdp-only.md` on legitimate SSH calls. That pattern was already superseded by `macincloud-substrate-selection-ssh-vs-rdp.md` via `git mv` on 7 May 2026 ~11:28 AEST when Tate paid the +AU$9/mo Remote Build Port add-on, but stale references remained in `~/ecodiaos/scripts/hooks/lib/gui-target-recipes.json` and `~/ecodiaos/scripts/hooks/lib/haiku-doctrine-summary.md`. The hook fired on the old filename's keywords. Cleanup landed alongside this pattern's authoring.

## Cross-references

- `~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md` - the trigger-authoring rule that overzealous patterns violate.
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` - Phase C tag distribution feeds the tuning loop. Layer 4 acts on the telemetry.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this pattern itself is an instance of same-arc codification.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - "I will tune later" without authoring is symbolic; the cron is the schedule that turns intent into artefact.
- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` - the meta-rule the lifecycle keeps load-bearing.
