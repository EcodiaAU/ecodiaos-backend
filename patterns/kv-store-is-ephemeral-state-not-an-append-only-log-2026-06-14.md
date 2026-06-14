---
triggers: kv-store-append-log, kv-store-unbounded, kv-store-mirror, kv-store-bloat, mcp-audit-mirror, kv-timestamp-key, kv-uuid-key, unbounded-kv-write, kv-store-is-ephemeral, kv-store-not-a-log, rolling-key-not-append-key, kv-store-hygiene, log-sink-in-kv, ttl-less-kv-write, table-not-kv-for-history
status: active
binding: hook=kv-append-log-warn.py
---
# kv_store is ephemeral state, not an append-only log

## The rule

`kv_store` holds CURRENT state keyed by a STABLE key (credentials, MCP bearers,
last-run markers, rolling snapshots). It is not a log sink. Any write whose key
embeds a per-event discriminator (a timestamp, a uuid, a callId, a monotonic
counter) under an `ON CONFLICT DO UPDATE` is an append-only log wearing a
key-value-store costume: the conflict clause never fires because the key is
unique every time, so the table grows without bound and nothing ever overwrites
or expires.

Append-only history belongs in a TABLE with an `occurred_at` column you can
range-query and prune with one `DELETE ... WHERE occurred_at < now() - interval`.
A KV mirror of that table is only legitimate when it is BOUNDED: one rolling key
per logical subject (`<prefix>.<subject>` overwritten in place), so the key
count is fixed by the cardinality of subjects, not by call volume.

## Why this exists (origin, 2026-06-14)

The weekly `kv-store-hygiene` cron found `cowork.mcp_audit.*` had grown to 5350
keys / ~7 MB / 81% of the entire kv_store value bytes, accumulating ~178 keys a
day since 2026-05-15 with no TTL and ZERO readers anywhere in the codebase. The
canonical, queryable audit history already lived in the `ecodia_full_audit_log`
TABLE (`occurred_at`, range-queryable). The kv mirror in
`src/services/connectorAudit.js` step 2 keyed each row as
`cowork.mcp_audit.<connector>.<ISO-ts>.<callId>` under `ON CONFLICT DO UPDATE`,
so the conflict clause was dead and every MCP call appended a fresh row. It was
a redundant, never-read, unbounded duplicate of a table that already answered
the question better.

Fix shipped same arc: the mirror became a single rolling
`cowork.mcp_audit_last.<connector>` key that overwrites in place (~12 keys total,
one per connector) and still answers "what did connector X last do" at a glance.
The table remains the canonical history. The 5350 accumulated keys were proposed
to the conductor for a one-time prune (safe: never read, fully duplicated in the
table).

## How to apply

- Before writing to kv_store, ask: is this key STABLE across writes for the same
  subject? If the key contains a timestamp / uuid / callId / counter, stop.
- If you need per-event history, write a TABLE row, not a kv key.
- If you need a fast at-a-glance snapshot, use a rolling key
  `<prefix>.<subject>` that genuinely collides and overwrites in place. Verify
  the `ON CONFLICT` clause actually fires by re-reading the key after two writes
  and confirming the count did not grow.
- Any kv prefix expected to grow with activity needs either a bounded key design
  or a pruning cron registered at birth. A growth-with-activity prefix with no
  prune path is the bug.

## Anti-patterns (never do these)

- `INSERT INTO kv_store (key, ...) VALUES (<prefix>.<timestamp>.<id>, ...) ON
  CONFLICT (key) DO UPDATE` - the conflict clause is decorative; this is an
  unbounded append. Either move to a table or collapse the key to a rolling
  subject key.
- Mirroring a table into kv "for fast triage" by copying every row. The table is
  already the fast path with an index; the only legitimate kv mirror is the
  LATEST per subject.
- Treating kv_store as durable history. kv_store is ephemeral state; Neo4j and
  purpose-built tables are durable. See `memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15`.
- Shipping a new kv prefix that grows with traffic without a prune cron or a
  bounded key. Unbounded-by-default is the failure shape this pattern names.

## Related

- `re-probe-stale-health-check-readings-before-acting-on-cached-alerts` - stale
  kv reads leaking yesterday's state.
- `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18` - the
  triad (helper + hook + doctrine) that shipped this fix.
- `status-board-hygiene-is-a-0th-class-reflex-2026-05-21` - the same
  single-source-of-truth discipline for status_board.
