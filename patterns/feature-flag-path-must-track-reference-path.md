---
triggers: feature-flag-path, canary-path, v2-divergence, alternative-path-parity, silent-drop, path-divergence, reference-path-parity, feature-flag-divergence, canary-silent-drop, flag-path-parity, parallel-implementation, promptAssembler-v2, PROMPT_ASSEMBLY_V2, flag-path-divergence, silent-field-drop, parallel-path-field-missing, alternative-implementation-drift, canary-field-missing, feature-branch-parity, v2-path-incomplete
status: active
authored: 2026-05-17
---

# Feature-flagged alternative code paths must track every field addition to the reference path, or fields silently drop

When a codebase has two parallel implementations gated by a feature flag (v1/reference + v2/canary), every field addition to v1 MUST be simultaneously applied to v2. Silence is the failure mode: there is no error, no log line, no alert. The field is simply absent in the v2 output, producing corrupted downstream state with zero observable signal at the divergence point.

## Why this is dangerous

The v2 path was built alongside v1 with equivalent field coverage at its creation date. Over time, v1 accumulates incremental additions: new context blocks, new user-content wrappers, new turn-context fields. Each addition is scoped to v1 (the "safe" path). v2 is "in canary", so v1 additions are not applied there. Slowly, v2 drifts. When v2 is eventually enabled or promoted, the fields added to v1 after v2's creation date are absent. The outputs are structurally wrong and consumers receive corrupt data - with no error, no log, no alert.

The silence is the trap. A missing field does not throw. It does not produce a null pointer. The assembler runs to completion and returns a structurally valid string that simply lacks the data. The consumer processes the incomplete output as if it were correct.

## The concrete failure (origin case)

2026-05-11 to 2026-05-13: `PROMPT_ASSEMBLY_V2=canary` / `live` was active in `osSessionService`. The v2 assembler built `userMessage` as BP3 + BP4. Tate's typed `user_content` was passed to the assembler but never written to the output. The SDK call used `_v2FinalPrompt` containing NO Tate text - only system context. The conductor replied "Standing by" / "Acknowledged" / "No response requested" for two days because from its perspective, no question had been asked.

Simultaneously: `working_set`, `scratchpad_recent`, and `observer_signals` blocks - added to v1's BP4 in recent fixes - were never wired into the v2 `turn_context` shape. Under canary/live, all three were silently absent.

Cost: two days of the conductor mishandling Tate's messages, producing no-op turns on genuine requests.

Fix commit: `b29afbe` (2026-05-13, `fix(promptAssembler): v2 was DROPPING Tate's typed message entirely`).

## Protocol: how to add a field to a flagged system correctly

When adding a new field F to the reference (v1) path:

1. Add F to v1 as normal.
2. Immediately open the v2/canary path and add F there too. Same turn, same commit.
3. Verify both paths emit F by inspecting the assembled output. Log the full output object at debug level if needed. One hour of setup is cheaper than two days of silent data loss.
4. If v2 is structurally unable to include F (different assembly model), document the gap explicitly in a TODO comment at the divergence point AND create a status_board row to track it. Do not silently leave it out.

If step 2 cannot happen in the same turn as step 1, the field addition is INCOMPLETE. Mark it incomplete in the commit and schedule the v2 backport immediately.

## Audit before promoting a canary to live

Run this check before flipping a canary flag to enabled/live:

1. List all output fields in v1 that existed in v2's creation-date commit (call this set S0).
2. List all output fields in v1 now (call this S-now).
3. Every field in (S-now minus S0) that is NOT in v2's current output is a silent drop candidate.
4. For each candidate: add it to v2, or document why it is intentionally absent.

For `promptAssembler` specifically: run both assembler paths against the same `turn_context` fixture and compare field presence in the output `userMessage`. Any field present in v1 output but absent in v2 output is a bug.

## Do

- Add every new field to ALL flag branches simultaneously. Not v1-first-v2-later. Simultaneously.
- Log the assembled output shape (keys + lengths) at debug level under feature flags, so drift is observable at runtime.
- Write a parity test: given identical `turn_context`, v1 and v2 outputs must contain the same top-level context blocks (even if the exact markup differs).
- Treat the canary path as production at all times. Canary paths get enabled accidentally (wrong env var, A/B rollout, factory session inheriting wrong env). Assume it is live.

## Do not

- Do not "backport later" without scheduling it immediately. Under a cron + fork system, "later" does not happen unless there is a scheduled row.
- Do not rely on downstream consumers to surface the missing field. Consumers process incomplete output silently; they have no way to know a field was supposed to be there.
- Do not disable the canary flag to "fix it later" without auditing what drifted during the canary window. The drift may have already shipped effects (wrong turns, incomplete state, missing memory writes).

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (verify both paths produce equivalent outputs, do not trust that "it was built alongside v1 so it must be equivalent")
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` (probe the assembled output empirically; a log saying "assembler ran" does not tell you what fields it emitted)
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (same principle at the listener layer: verify all five layers fire, not just that the pipe exists)
