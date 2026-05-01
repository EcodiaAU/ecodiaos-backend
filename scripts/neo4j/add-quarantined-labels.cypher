// =====================================================================
// Neo4j schema bump: §2.5 quarantine-label support
// docs/SECURITY_HARDENING.md §2.5
// =====================================================================
//
// Adds the indexes and property-existence constraints needed by the
// quarantine routing introduced in this PR. Forward-only - does not
// touch existing :Pattern / :Decision nodes.
//
// What this does
// --------------
// 1. Creates name indexes on `:QuarantinedPattern` and
//    `:QuarantinedDecision` so MERGE-on-name lookups are O(log n) instead
//    of full-label scans.
// 2. Adds a property-existence constraint requiring every
//    :QuarantinedPattern / :QuarantinedDecision node to carry a
//    `provenance_source` property. Neo4j 5+ enforces this at write
//    time - missing `provenance_source` -> write rejected.
//
// Why these specific properties
// -----------------------------
// `writeQuarantined()` in src/services/knowledgeGraphService.js stores
// the provenance object as four flat properties (provenance_source,
// provenance_session_id, provenance_trigger, provenance_external_actor).
// `provenance_source` is the discriminating one - it identifies the
// trigger surface (email, cowork_inbox, webhook, etc) and is required
// for the daily review cron in §4 to find external-trigger writes.
// We constrain on `provenance_source` rather than `provenance_trigger`
// because `source` is human-readable (e.g. 'cowork_inbox') while
// `trigger` is machine-emitted code-path identifier - source is the
// review-time discriminator.
//
// How to run
// ----------
//   # Local Neo4j (cypher-shell):
//   cypher-shell -u neo4j -p $NEO4J_PASSWORD -a $NEO4J_URI \
//     -f scripts/neo4j/add-quarantined-labels.cypher
//
//   # Aura (curl + transactional Cypher endpoint):
//   # Run each statement individually via the Aura console or driver
//   # (multi-statement scripts are not always supported on Aura free).
//
// Verification
// ------------
//   SHOW INDEXES;
//   SHOW CONSTRAINTS;
//
// Idempotency
// -----------
// Every statement uses IF NOT EXISTS, so re-running is safe.
// =====================================================================

// 1. Name indexes for the quarantine twins.
CREATE INDEX quarantined_pattern_name IF NOT EXISTS
  FOR (n:QuarantinedPattern) ON (n.name);

CREATE INDEX quarantined_decision_name IF NOT EXISTS
  FOR (n:QuarantinedDecision) ON (n.name);

// 2. Property-existence constraints - reject quarantine writes missing
// provenance metadata. Neo4j 5+ syntax. On Neo4j 4.x or community
// edition where existence constraints are not supported, the write-
// path helper writeQuarantined() in knowledgeGraphService.js still
// enforces this in JS, so the constraint is defense-in-depth, not the
// only line of defense.
CREATE CONSTRAINT quarantined_pattern_has_provenance IF NOT EXISTS
  FOR (n:QuarantinedPattern) REQUIRE n.provenance_source IS NOT NULL;

CREATE CONSTRAINT quarantined_decision_has_provenance IF NOT EXISTS
  FOR (n:QuarantinedDecision) REQUIRE n.provenance_source IS NOT NULL;

// 3. Provenance-trigger and provenance-session-id indexes - support
// fast lookups for the daily/weekly external-trigger review crons in
// §4. These are NOT existence constraints, just lookup accelerators.
CREATE INDEX quarantined_pattern_trigger IF NOT EXISTS
  FOR (n:QuarantinedPattern) ON (n.provenance_trigger);

CREATE INDEX quarantined_decision_trigger IF NOT EXISTS
  FOR (n:QuarantinedDecision) ON (n.provenance_trigger);

CREATE INDEX quarantined_pattern_session IF NOT EXISTS
  FOR (n:QuarantinedPattern) ON (n.provenance_session_id);

CREATE INDEX quarantined_decision_session IF NOT EXISTS
  FOR (n:QuarantinedDecision) ON (n.provenance_session_id);
