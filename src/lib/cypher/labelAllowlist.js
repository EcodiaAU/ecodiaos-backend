'use strict'

/**
 * labelAllowlist - canonical Neo4j label and relationship-type validation.
 *
 * Implements §2.4 of ~/ecodiaos/docs/SECURITY_HARDENING.md (Cypher injection:
 * parameterize everywhere) and §2.5 (Neo4j is privileged - quarantine label
 * for external-source writes).
 *
 * Why this exists
 * ---------------
 * Cypher does not parameterize labels or relationship types. Every site that
 * interpolates a label or rel-type into a query string is an injection vector
 * unless that value is validated against a hardcoded allowlist BEFORE
 * interpolation. The pre-existing `sanitizeLabel()` in
 * knowledgeGraphService.js was a regex strip (`[^a-zA-Z0-9_]/g`) - it
 * removed special characters but did NOT enforce an allowlist, meaning ANY
 * alphanumeric string was accepted as a label. An LLM ingestion pass on
 * external content could mint arbitrary labels like
 * `Microsoft_Forms`, `forkService`, `Co_Exist_excel_sync_Edge_Function`
 * (all observed in production), or worse, inject a label that surfaces as
 * doctrine via `neo4jRetrieval.fusedSearch`.
 *
 * This module consolidates the allowlist so all consumers reference the same
 * source of truth. Failures raise descriptive errors that include the
 * offending value so reviews catch them.
 *
 * Allowlist scope
 * ---------------
 * ALLOWED_LABELS covers every label with non-trivial production presence in
 * the Neo4j knowledge graph as of 2026-04-30 (probe:
 *   MATCH (n) UNWIND labels(n) AS lbl WITH lbl, count(*) AS cnt
 *   RETURN lbl, cnt ORDER BY cnt DESC
 * ), plus the §2.5 quarantine twins.
 *
 * Rejected (deliberately not in the list):
 *   - One-off noise labels with <5 nodes (typos, transient LLM
 *     hallucinations like `Microsoft_Forms`, `forkService`,
 *     `Co_Exist_excel_sync_Edge_Function`)
 *   - Lowercase variants where a TitleCase canonical exists (`system` ->
 *     `System`, but `realization`/`observation`/`thought`/`decision` are
 *     KEPT because they are the canonical lowercase forms used by
 *     `graph_reflect` reflection-type writes - production has 86, 42, 40,
 *     and 5 nodes respectively under those exact labels)
 *
 * Adding a new label
 * ------------------
 * If a new label is required, add it to ALLOWED_LABELS HERE (not by
 * relaxing the assertion at a call site). The reviewer should ask:
 *   1. Why does this label exist - is it a duplicate of an existing one
 *      with different casing or wording? Reuse the existing one if so.
 *   2. Does it surface via retrieval? If yes, it is durable doctrine and
 *      deserves the §2.5 quarantine treatment (write `Quarantined<X>`
 *      from external-trigger sessions until promoted).
 *
 * Relationship types
 * ------------------
 * Cypher does not parameterize relationship types either. Unlike labels
 * (where a fixed allowlist is feasible), rel types are open-vocabulary -
 * the LLM emits descriptive verbs like `BLOCKED_BY`, `FRUSTRATED_WITH`,
 * `IS_PIVOTING_TOWARDS`. A strict allowlist would force every new rel type
 * through a code change. Instead we enforce a strict SHAPE regex:
 *   ^[A-Z][A-Z0-9_]{0,63}$
 * Uppercase alphanumeric + underscore, length-limited. No Cypher
 * fragment can be smuggled through this constraint.
 */

// ─── Label allowlist ────────────────────────────────────────────────

const ALLOWED_LABELS = Object.freeze([
  // Doctrine surfaces (highest priority - these are what retrieval returns
  // as durable guidance to future sessions, so quarantine twins are minted
  // alongside their canonical forms below).
  'Pattern',
  'Decision',
  'Episode',
  'Reflection',
  'Strategic_Direction',
  'Recurring_Pattern',
  'Behavioral_Pattern',
  'Decision_Pattern',

  // §2.5 quarantine twins. External-trigger sessions (email arrival,
  // cowork inbox, webhooks) write Pattern and Decision through a
  // quarantine routing helper. Excluded by default from
  // neo4jRetrieval.fusedSearch.
  'QuarantinedPattern',
  'QuarantinedDecision',

  // First-class entities (referenced explicitly in many queries).
  'Person',
  'Organization',
  'Project',
  'Client',
  'Concept',
  'Problem',
  'Solution',
  'Resolution',
  'Risk',
  'Constraint',
  'Critique',
  'Question',
  'Prediction',
  'Investigation',
  'Research',
  'Resource',
  'Tool',
  'System',
  'Service',
  'Component',
  'Capability',
  'Feature',
  'Software',
  'Platform',
  'Database',
  'API',
  'Integration',
  'Codebase',
  'File',
  'Directory',
  'Function',
  'Code_Change',
  'Commit',
  'Release',
  'Artifact',
  'Document',
  'Email',
  'Message',
  'Communication',
  'Review',
  'Action',
  'Operation',
  'Process',
  'Task',
  'Status',
  'Event',
  'Incident',
  'Error',
  'Health_Check',
  'Monitoring',
  'Metric',
  'Security',
  'Deployment',
  'Factory',
  'CCSession',
  'Session',
  'Entity',
  'Data',
  'Location',
  'Financial',
  'Invoice',
  'Product',
  'AI_System',
  'Narrative',
  'Insight',
  'Peer',
  'Temporal',
  'Emerging_Trend',
  'UIElement',

  // Lowercase canonicals - these are the exact strings used by
  // `graph_reflect` reflection-type writes, kept for backward compat.
  'realization',
  'observation',
  'thought',
  'decision',
  'operational_lesson',

  // System / housekeeping labels. Set by KG infrastructure, not by user
  // intent. Required by the existing consolidation/dedup/abstract
  // pipelines and the vector index.
  '__Embedded__',
  'Embedded',
  'ConsolidationRun',
  'DedupRun',
  'AbstractRun',
])

// O(1) lookup
const _ALLOWED_LABEL_SET = new Set(ALLOWED_LABELS)

// ─── Relationship-type shape ──────────────────────────────────────────

/**
 * Strict shape for Neo4j relationship-type identifiers.
 * Uppercase + digits + underscore, must start with a letter, length 1-64.
 * Matches the Cypher convention and rejects anything that could carry
 * a fragment.
 */
const REL_TYPE_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/

// ─── Predicates and assertions ────────────────────────────────────────

/**
 * @param {string} label
 * @returns {boolean}
 */
function isAllowedLabel(label) {
  return typeof label === 'string' && _ALLOWED_LABEL_SET.has(label)
}

/**
 * @param {string} label
 * @returns {string} the validated label, unchanged
 * @throws {Error} when the label is not in ALLOWED_LABELS
 */
function assertAllowedLabel(label) {
  if (!isAllowedLabel(label)) {
    const repr = typeof label === 'string'
      ? JSON.stringify(label)
      : String(label)
    throw new Error(
      `assertAllowedLabel: rejected label ${repr}. ` +
      'Labels are not parameterizable in Cypher; only labels listed in ' +
      'src/lib/cypher/labelAllowlist.js may be interpolated. To add a new ' +
      'label, edit ALLOWED_LABELS there - do not relax this assertion at ' +
      'the call site.'
    )
  }
  return label
}

/**
 * @param {string} relType
 * @returns {boolean}
 */
function isAllowedRelType(relType) {
  return typeof relType === 'string' && REL_TYPE_REGEX.test(relType)
}

/**
 * @param {string} relType
 * @returns {string} the validated rel type, unchanged
 * @throws {Error} when the rel type does not match the strict shape regex
 */
function assertAllowedRelType(relType) {
  if (!isAllowedRelType(relType)) {
    const repr = typeof relType === 'string'
      ? JSON.stringify(relType)
      : String(relType)
    throw new Error(
      `assertAllowedRelType: rejected rel type ${repr}. ` +
      'Relationship types must match /^[A-Z][A-Z0-9_]{0,63}$/ (uppercase ' +
      'alphanumeric and underscore, starts with a letter, length 1-64). ' +
      'Rel types are not parameterizable in Cypher.'
    )
  }
  return relType
}

/**
 * Coerce an LLM-emitted rel-type string into the strict shape if
 * possible: uppercase, replace runs of non-alphanumerics with `_`, trim
 * trailing/leading underscores, length-limit. Returns the coerced value
 * if it now passes the shape check, else null.
 *
 * Use this for LLM-driven ingestion paths where the upstream emitted
 * `frustrated with` or `is-pivoting-towards` and we want to preserve
 * semantics. Hard input (e.g. an injection attempt) will not coerce
 * cleanly and returns null - callers fall back to `MENTIONS` or skip
 * the write.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function coerceRelType(raw) {
  if (typeof raw !== 'string' || !raw) return null
  const upper = raw.toUpperCase()
  const cleaned = upper.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!cleaned) return null
  const truncated = cleaned.length > 64 ? cleaned.slice(0, 64).replace(/_+$/g, '') : cleaned
  return isAllowedRelType(truncated) ? truncated : null
}

/**
 * Coerce an LLM-emitted label into a validated form when possible.
 * Strips non-alphanumeric, returns the value if it lands in
 * ALLOWED_LABELS. Else null.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function coerceLabel(raw) {
  if (typeof raw !== 'string' || !raw) return null
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '').replace(/^_+|_+$/g, '')
  if (!cleaned) return null
  return isAllowedLabel(cleaned) ? cleaned : null
}

module.exports = {
  ALLOWED_LABELS,
  REL_TYPE_REGEX,
  isAllowedLabel,
  assertAllowedLabel,
  isAllowedRelType,
  assertAllowedRelType,
  coerceLabel,
  coerceRelType,
}
