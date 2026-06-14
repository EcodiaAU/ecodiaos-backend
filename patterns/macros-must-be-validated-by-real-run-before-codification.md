---
triggers: macro-status-discipline, untested-spec-default, validated-v1-only, runbook-real-replay, do-not-author-from-imagination, pre-stage-fleet-failure, fill-cap-failure, trusted-set-query, macro-status-values, replay-in-progress, broken-needs-fix, count-star-is-not-trusted, runbook-trust-gate
---
# Macros must be validated by a real run before codification

## 1. The rule

A runbook enters the trusted set only after a real end-to-end replay against the actual UI succeeds. At INSERT the default status is `untested_spec`. It flips to `validated_v1` only on an observed success, never on authoring. Every trusted-set query reads `WHERE status = 'validated_v1'`, never `WHERE status IS NOT NULL` and never a bare `COUNT(*)`. The status vocabulary is `untested_spec`, `replay_in_progress`, `validated_v1` (trusted), `broken_needs_fix`, and `retired`.

## 2. Why

The recurring failure is authoring multiple runbooks from imagination "to fill the cap" or "to pre-stage a fleet", then treating their mere existence as capability. A runbook that has never replayed against the real UI is a guess, and a guess in the trusted set is worse than an empty set because it gets executed against live surfaces. The discipline forces the gate to be an observed run, so the trusted set always reflects reality rather than intention. This rule survived the 29 Apr 2026 macro-substrate pivot precisely because it is substrate-independent: whatever runs the steps, the trust gate is a real replay.

## 3. How to apply

1. INSERT every new runbook with `status='untested_spec'`. Do not skip this default.
2. Before trusting a runbook, replay it end-to-end against the actual UI and observe the outcome.
3. On observed success, flip the row to `validated_v1`. On failure, set `broken_needs_fix`. Retire dead runbooks to `retired`.
4. Query the trusted set with `WHERE status = 'validated_v1'` only.
5. When tempted to author several runbooks at once to fill a quota, stop; authoring is not capability and the quota is satisfied by validated rows, not row count.

## 4. Anti-patterns

- Do not author runbooks from imagination to pre-stage a fleet or fill a cap; unreplayed rows are guesses.
- Do not query the trusted set with `WHERE status IS NOT NULL` or `COUNT(*)`; both count untested guesses as trusted.
- Do not flip a row to `validated_v1` on authoring or on a dry read; only an observed real replay earns the flip.
- Do not treat a runbook's existence as evidence it works.

## 5. Origin

Preserved through the 29 Apr 2026 macro pivot as a substrate-independent trust gate. Cross-refs: [[macros-pre-pivot-doctrine-archived-2026-04-29]], [[verify-deployed-state-against-narrated-state]], [[no-symbolic-logging-act-or-schedule]].
