// description: Same-name-prefix Person or Organization nodes that look like duplicates and should be merged.
// severity: P3
// remediation: Pick the canonical node, re-point edges to it via APOC merge / manual rewrite, mark the duplicate WITHDRAWN with SUPERSEDES.

// Person duplicates: same first word
MATCH (p1:Person), (p2:Person)
WHERE elementId(p1) < elementId(p2)
  AND toLower(split(p1.name, ' ')[0]) = toLower(split(p2.name, ' ')[0])
  AND p1.name <> p2.name
RETURN 'Person' AS label,
       p1.name AS canonical_candidate,
       p2.name AS duplicate_candidate,
       elementId(p1) AS id1,
       elementId(p2) AS id2
LIMIT 100

UNION ALL

// Organization duplicates: same first word OR one contains the other
MATCH (o1:Organization), (o2:Organization)
WHERE elementId(o1) < elementId(o2)
  AND (
    toLower(split(o1.name, ' ')[0]) = toLower(split(o2.name, ' ')[0])
    OR toLower(o1.name) CONTAINS toLower(o2.name)
    OR toLower(o2.name) CONTAINS toLower(o1.name)
  )
  AND o1.name <> o2.name
RETURN 'Organization' AS label,
       o1.name AS canonical_candidate,
       o2.name AS duplicate_candidate,
       elementId(o1) AS id1,
       elementId(o2) AS id2
LIMIT 100;
