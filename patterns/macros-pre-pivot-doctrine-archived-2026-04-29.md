---
triggers: macro-pre-pivot-archived, bespoke-macro-runtime-dead, vision-locate-proxy, runbook-run-iterator, step-array-schema, macro-handlers-archived, do-not-extend-bespoke-runtime, do-not-codify-step-arrays, macro-runbooks-untested-spec, anthropic-first-macro-check, computer-use-replaces-bespoke, macro-substrate-pivot
status: archive-marker
---
# Pre-pivot bespoke macro runtime is archived (29 Apr 2026)

## 1. The rule

The pre-pivot bespoke macro runtime is dead substrate. That runtime is the `vision.locate` proxy, the `runbook.run` iterator, the step-array schema, and the `macroHandlers/*.js` family. It was archived on 29 Apr 2026 after an Anthropic-first check found that the native computer-use and Tailscale laptop-agent primitives (`input.*`, `screenshot.*`, `shell.shell`, plus CDP) cover the same surface without a bespoke step-runner. Do not extend the bespoke runtime, do not author new step-arrays, and treat every `macro_runbooks` row as `status='untested_spec'` until it is re-validated under the current substrate.

## 2. Why

The Anthropic-first principle says: before building parallel infrastructure, check whether an existing Anthropic-native or already-shipped primitive does the job. The bespoke macro runtime predated the Tailscale laptop-agent and computer-use availability. Once those shipped, the step-array runtime became a second way to do the same thing, and a second way is a maintenance liability plus a drift surface. Keeping it alive invites new step-arrays authored from imagination, which is the recurring `macros-must-be-validated-by-real-run` failure. Archiving it closes the second path so all GUI driving routes through the supported primitives.

## 3. How to apply

1. For GUI driving, reach for the Tailscale laptop-agent (`input.*` + `screenshot.*` + `shell.shell`) as primary, and computer-use as the OS-level fallback.
2. Do not add handlers under `macroHandlers/`, do not extend `vision.locate` or `runbook.run`, and do not author new step-array runbooks.
3. Treat any surviving `macro_runbooks` row as `status='untested_spec'` until a real end-to-end replay validates it under the current substrate.
4. If a task seems to need the bespoke runtime, restate it in terms of the supported primitives first; the bespoke path is never the answer for new work.

## 4. Anti-patterns

- Do not codify new step-array runbooks "to pre-stage a fleet" or "to fill the cap"; that is the validate-by-real-run failure wearing a different hat.
- Do not read `macro_runbooks` with `WHERE status IS NOT NULL` or `COUNT(*)`; only `status='validated_v1'` rows are trusted.
- Do not revive `vision.locate` / `runbook.run` because they are familiar; familiarity is not a reason to keep dead substrate alive.
- Do not assume a Corazon-era macro path resolves on the Mac-canonical host.

## 5. Origin

29 Apr 2026 Anthropic-first check archived the bespoke runtime in favour of computer-use plus the Tailscale laptop-agent. Cross-refs: [[macros-must-be-validated-by-real-run-before-codification]], [[use-anthropic-existing-tools-before-building-parallel-infrastructure]], [[consolidate-ui-primitives-do-not-add-parallel-ones]].
