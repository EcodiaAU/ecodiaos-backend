// description: Edges of weak generic type that should be migrated to canonical vocabulary (RELATES_TO, AFFILIATED_WITH, HAS_RELATIONSHIP, EMPLOYED_BY, WORKS_FOR, WORKS_WITH, BELONGS_TO, BELONGS_TO_ORGANIZATION, CO_FOUNDED).
// severity: P3
// remediation: For each weak edge, infer the canonical type from prose context (clients/<slug>.md or Tate verbatim) and re-write as a typed edge with full provenance. Mark the original WITHDRAWN with SUPERSEDES.

MATCH (a)-[r]->(b)
WHERE type(r) IN [
  'RELATES_TO','AFFILIATED_WITH','HAS_RELATIONSHIP',
  'BELONGS_TO','BELONGS_TO_ORGANIZATION','WORKS_FOR','WORKS_WITH',
  'EMPLOYED_BY','CO_FOUNDED','REPRESENTS'
]
RETURN type(r) AS weak_type,
       labels(a) AS from_labels,
       a.name AS from_name,
       labels(b) AS to_labels,
       b.name AS to_name,
       elementId(r) AS rel_id
ORDER BY weak_type, a.name, b.name
LIMIT 300;
