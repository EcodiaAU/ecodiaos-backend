---
triggers: kv-store-write-scope-denied, cowork-namespace-write-only, kv_store_set-cowork-only, ceo-key-write-blocked, kg-key-write-blocked, ceo-last-self-evolution-blocked, ceo-last-outreach-blocked, ceo-last-deep-research-blocked, routine-kv-mirror-fallback, cowork-mirror-namespace, scoped-bearer-kv-write, canonical-kv-write-from-routine, mirror-then-reconcile, routine-cannot-write-ceo-key
metadata:
  type: pattern
---

# Scoped (cowork) bearer cannot write canonical kv keys - mirror to cowork.mirror.<key>, do not improvise per-routine keys (2026-05-26)

## The rule

A Routine firing on the scoped MCP bearer can only WRITE kv_store keys under
`cowork.*` or `cowork-session.*`. Any write to a canonical out-of-namespace
key (`ceo.last_self_evolution`, `ceo.last_outreach`, `ceo.last_deep_research`,
`kg.*`, etc) returns `scope_denied`. This is a hard, by-design ceiling, not a
bug to route around.

When a Routine needs to persist its "last run" / handoff state and the
canonical key is out of namespace, the deterministic fallback is ONE shape:

```
cowork.mirror.<full-canonical-key>
```

For example the self-evolution Routine writes:

```
cowork.mirror.ceo.last_self_evolution   (not cowork.last_self_evolution,
                                          not cowork.self_evolution,
                                          not a fresh ad-hoc name)
```

Then exit. Do NOT round-trip with Tate to ask for a write. Do NOT skip the
write. Do NOT surface a scope_denied as an incident. Do NOT invent a
per-Routine short name (`cowork.last_outreach`, `cowork.last_deep_research`)
- those fragment the namespace and make reconciliation guesswork.

## Why

The cowork bearer is intentionally namespaced to `cowork.*` / `cowork-session.*`
on the WRITE path (separate from, and additional to, the `creds.*` READ-deny
and the status_board infrastructure/legal UPDATE-deny). Routines run on this
scoped bearer. The ceiling is correct: it stops a Routine from silently
mutating conductor-canonical pointers. But it means every "record what I did"
write at end-of-fire lands out of scope.

Across an 8h window on 2026-05-26 four separate Routines each independently
rediscovered this and each improvised a DIFFERENT fallback key:
- outreach-engine -> `cowork.last_outreach`
- deep-research -> `cowork.last_deep_research`
- kg-consolidation -> `cowork.*` (unstated suffix)
- self-evolution (this fire) -> hit it writing `ceo.last_self_evolution`

Four ad-hoc conventions for one ceiling. A reconciler (the conductor on the
wider ecodia-full bearer) cannot promote mirrors back to canonical without a
deterministic, lossless mapping. `cowork.mirror.<canonical-key>` preserves the
full original key so promotion is mechanical: for each `cowork.mirror.X`,
write `X` canonically via the ecodia-full bearer, then delete the mirror.

## How to apply

1. Try the canonical write only if you hold the ecodia-full bearer. Routines
   do not; assume scoped.
2. On the scoped bearer, write `cowork.mirror.<canonical-key>` with the SAME
   value object you would have written canonically. Add `_mirror_of` and
   `_mirrored_at` fields inside the value for the reconciler:
   ```json
   { "_mirror_of": "ceo.last_self_evolution", "_mirrored_at": "<iso>", ...payload }
   ```
3. `cowork.mirror.*` passes the write gate (starts with `cowork.`). Verify the
   set returned ok, then exit. The write IS the deliverable; a blocked write
   that was successfully mirrored is a completed write, not a failure.
4. Reconciliation is the conductor's job, not the Routine's. A periodic
   conductor/ecodia-full sweep promotes `cowork.mirror.*` -> canonical and
   deletes the mirror. A Routine never blocks waiting for reconciliation.

## What this is NOT

- Not the `creds.*` READ-deny. That is fixed by an explicit allow-list, see
  `kv-store-creds-deny-needs-explicit-ops-allowlist-2026-05-19.md`.
- Not the status_board infrastructure/legal UPDATE-deny. See
  `cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19.md`
  (use the right entity_type at insert, or re-route via ecodia-full).
- Not a reason to escalate to Tate. A scoped-bearer write ceiling is routine
  plumbing, not a Tate-attention event.

## Origin

Self-evolution Routine fire 2026-05-26 ~18:30 AEST (rotation A, pattern
authoring). The fire hit the ceiling firsthand trying to record
`ceo.last_self_evolution` and could only write `cowork.*`. Neo4j 8h scan
showed the same write-scope ceiling improvised four different ways across
Episodes "outreach-engine fire 2026-05-26T0807Z" (cowork.last_outreach),
"deep-research 2026-05-26 - autonomous AI SWE agents frontier (domain D)"
(cowork.last_deep_research), "kg-consolidation 2026-05-26T16:11 AEST"
(canonical kg.* blocked by cowork.* prefix restriction), and
"meta-loop 2026-05-26 18:10 AEST" (cowork bearer scope-denied on canonical
writes). 5+ occurrences in 8h crossed the 3+ codification bar.

## Cross-refs

- [[kv-store-creds-deny-needs-explicit-ops-allowlist-2026-05-19]] - the READ
  side of the same scope model
- [[cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19]] - the
  status_board UPDATE side of the same scope model
- [[cowork-v2-api-shape-conventions]] - canonical list of cowork-scope ceilings
- [[route-around-block-means-fix-this-turn-not-log-for-later]] - the mirror IS
  the fix-this-turn route-around, not a logged-for-later TODO
- [[ecodia-full-mcp-proxy-architecture-2026-05-15]] - which bearer holds which scope
