---
triggers: cowork-scope-denied, status_board_upsert-denied, scope_denied-infrastructure, scope_denied-legal, cowork-entity_type-ceiling, cowork-update-vs-insert, cowork-cannot-update-infrastructure, cowork-cannot-update-legal, cowork-bearer-scope, status_board-row-locked, cowork-row-ownership, cowork-mcp-permission-ceiling, scope-asymmetry-insert-vs-update, cowork-row-author-conductor-only-update
---

# Cowork bearer cannot update status_board rows with entity_type=infrastructure or legal (2026-05-19)

## The friction

Calling `status_board_upsert` on the cowork-bearer MCP endpoint (`/api/mcp/cowork`) with `entity_type=infrastructure` and an existing `id` returns:

```json
{
  "error": "scope_denied",
  "message": "cowork cannot update entity_type=infrastructure",
  "details": {
    "entity_type": "infrastructure",
    "denied": ["legal", "infrastructure"]
  }
}
```

Asymmetry: cowork CAN insert a new row with `entity_type=infrastructure` (the row gets `source: "cowork"`) but it CANNOT update that row afterward, even though it authored it. Same applies to `entity_type=legal`.

## Why this exists

The cowork bearer has 20 scopes covering routine operational substrate. Rows with `entity_type` in {`legal`, `infrastructure`} are treated as Tate-attention-class and locked from cowork-side mutation to prevent the conductor from silently mutating its own scaffolding row. Updates flow through the wider ecodia-full bearer (68 scopes) or are surfaced to Tate.

## Workarounds

1. **Pick the right entity_type at insert time.** If the row is cowork-owned process (an audit arc, a worker tracking row, a checkpoint), use `entity_type=task` or `entity_type=thread`. These are mutable end-to-end on the cowork bearer.

2. **Re-route the update via ecodia-full.** If the row truly is infrastructure-class but needs cowork-side updates, call `status_board_upsert` against the ecodia-full bearer endpoint. The bearer at `kv_store.creds.ecodia_full_mcp_bearer` covers it.

3. **Append-only via Neo4j Episode.** If the goal is recording mid-arc state on an infrastructure row, write an Episode that references the row by name in its description. Doesn't update the row but creates queryable history.

4. **Surface to Tate when the update is real.** Infrastructure rows that need Tate-class attention are the right thing to NOT update silently. Pattern: write the Episode, sms or surface the row name + delta.

## The bigger picture

This is one of several cowork-scope ceilings worth knowing before reaching for a tool:

- Cannot read `kv_store.creds.*` (creds are read-deny)
- Cannot insert rows with `entity_type=legal` (some legal rows are flagged in `denied`)
- Cannot update infrastructure or legal rows after insert
- Cannot bypass focus-collision on cowork.dispatch_worker if Tate has the target window foregrounded
- See `cowork-v2-api-shape-conventions.md` for the canonical list

## How this surfaced

Capability stress-test 2026-05-19. The umbrella row was planted with `entity_type=infrastructure` and inserted fine. A mid-arc update attempt to push status forward returned scope_denied. The Episode-write workaround landed the same information. Codified within the same arc.

See also: [[cowork-v2-api-shape-conventions]], [[scope-asymmetry-insert-vs-update]], [[cred-rotation-must-propagate-to-all-consumers]].
