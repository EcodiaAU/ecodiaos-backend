---
triggers: macro-validation, runbook-validation, validated-v1, untested-spec, macro-codify-after-replay, no-pre-stage-fleet, do-not-author-from-imagination, runbook-status-discipline, trusted-set-query, macro-status-machine, replay-in-progress, broken-needs-fix, macro-runbooks-table, runbook-validation-runs, real-end-to-end-replay, parallel-macro-authoring-anti-pattern, fill-the-cap-anti-pattern, macro-fleet-pre-stage-anti-pattern
priority: critical
canonical: true
---

# Macros must be validated by a real run before codification

## 1. The rule

A macro runbook only enters the trusted set AFTER a real end-to-end replay against the actual UI. Default `status='untested_spec'` at INSERT into `macro_runbooks`. Flip to `status='validated_v1'` only on observed end-to-end success, evidenced by a row in `runbook_validation_runs` (or its successor table). The trusted-set query is always `WHERE status = 'validated_v1'` - never `WHERE status IS NOT NULL`, never `COUNT(*)` over the table.

Authoring multiple macros in parallel from imagination "to fill the cap" or "pre-stage the fleet" is the recurring failure mode this discipline exists to prevent. A macro that has not run end-to-end against the live UI is a SPEC, not a macro. Treating specs as macros pollutes the trusted set and makes the substrate unreliable.

## 2. Status state machine

| Status | Meaning |
|---|---|
| `untested_spec` | Default at INSERT. The runbook is authored but has never run end-to-end. NOT in the trusted set. |
| `replay_in_progress` | A validation run is currently executing. Transient state. NOT in the trusted set. |
| `validated_v1` | End-to-end success observed and logged in `runbook_validation_runs`. Trusted set member. |
| `broken_needs_fix` | Was `validated_v1`, then a re-run failed. Removed from trusted set. Needs investigation. |
| `retired` | Intentionally removed (UI changed, workflow superseded, doctrine pivot). NOT in the trusted set. |

Transitions:

- INSERT → `untested_spec` (DB default; cannot be overridden at INSERT time without bypassing the schema convention).
- `untested_spec` → `replay_in_progress` when a validation run starts.
- `replay_in_progress` → `validated_v1` on observed end-to-end success + `runbook_validation_runs` row.
- `replay_in_progress` → `broken_needs_fix` on failure during validation.
- `validated_v1` → `broken_needs_fix` on re-run failure.
- Any state → `retired` on intentional removal.

## 3. Schema + warning enforcement

The schema half lives in migration `070_runbook_validation_runs_and_trigger.sql`:

- Trigger `trg_enforce_validated_v1_has_validation_run` rejects any UPDATE that sets `status='validated_v1'` without a corresponding `runbook_validation_runs` row.

The warning half lives in `~/ecodiaos/scripts/hooks/macro-runbook-write-surface.sh`:

- `[MACRO-VALIDATION WARN]` class 1: status='validated_v1' write will be rejected by the trigger unless a validation row exists.
- `[MACRO-VALIDATION WARN]` class 2: INSERT without explicit status defaults to `untested_spec` (out of trusted set).
- `[MACRO-VALIDATION WARN]` class 3: bulk INSERT (3+ rows) references the 29 Apr 2026 22-row failure mode where the conductor authored 22 macros from imagination in one sweep.

Schema + warning + this doctrine file together form the three-layer backstop against the parallel-authoring failure mode.

## 4. Do

- Insert new runbooks at `status='untested_spec'`. Let the DB default work.
- Run the macro end-to-end against the actual UI before flipping status.
- Log the validation run in `runbook_validation_runs` with screenshot/log evidence at every step.
- Query the trusted set as `WHERE status='validated_v1'` everywhere - cron, code, audits, conductor logic.
- When a previously-trusted runbook fails on re-run, flip to `broken_needs_fix` immediately and remove it from any "validated macros count" surface.

## 5. Do NOT

- Author multiple macros in parallel from imagination to "pre-stage the fleet."
- INSERT with `status='validated_v1'` because "the spec looks correct" (the schema trigger will reject anyway, and even if it didn't, the rule is real-run-before-codification).
- Use `WHERE status IS NOT NULL` or `COUNT(*)` to size the trusted set - both include untested specs.
- Promote `replay_in_progress` to `validated_v1` based on partial run.
- Delete a `broken_needs_fix` row to "clean up" - that loses the failure evidence.

## 6. Worked example (29 Apr 2026 fleet-pre-stage failure)

The conductor authored 22 macro_runbooks rows in a single bulk INSERT to "pre-stage the macro fleet for the autonomous-pilot window." None of the 22 had been run end-to-end. All 22 entered the table as `untested_spec` per default. Subsequent code paths that queried the table for "available macros" matched on `WHERE status IS NOT NULL` and presented the 22 specs as if they were macros. Real dispatches against those rows failed because the specs did not match the actual UI.

The fix: bulk-INSERT warn (class 3 above), schema trigger preventing status=validated_v1 without validation run, this doctrine file, and a one-time cleanup pass that re-queried the trusted set as `WHERE status='validated_v1'`.

## 7. Cross-references

- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the meta-rule. Many "macros" pre-pivot were parallel infrastructure to capabilities Anthropic already shipped (computer-use). The post-pivot macros must be even more disciplined because the substrate is now Cowork + computer-use, not a bespoke runtime.
- `~/ecodiaos/patterns/macros-pre-pivot-doctrine-archived-2026-04-29.md` - the archived pre-pivot bespoke-macro-runtime doctrine. Do not extend the bespoke runtime.
- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` - Cowork is the substrate that REPLACES most of the bespoke macros.
- `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md` - the conductor runs the validation loop; Cowork executes the bounded steps.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - the doctrine-side analogue (codification means the artefact lands, not the claim).
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - inserting an untested spec as if it were a validated macro is symbolic logging.

## 8. Origin

29 Apr 2026. The 22-row bulk INSERT failure mode where the conductor "pre-staged the macro fleet" by authoring untested specs that downstream code treated as live macros. Schema half (`070_runbook_validation_runs_and_trigger.sql`) and warning half (`macro-runbook-write-surface.sh`) both shipped that day; the doctrine half (this file) was narrated in CLAUDE.md but not on disk, which itself made the trusted-set discipline less enforceable for future sessions reading CLAUDE.md and then grepping `~/ecodiaos/patterns/`.

Authored on disk by fork_mol5vy5w_250614 on 30 Apr 2026 evening as part of ambient-OS cleanup-night Wave-1 ship pass.
