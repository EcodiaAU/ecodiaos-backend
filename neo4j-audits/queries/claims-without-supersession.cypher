// description: WITHDRAWN Claim nodes with no SUPERSEDES inbound edge from a confirmed correction Claim. History is preserved but the truth has not been pointed at.
// severity: P3
// remediation: For each WITHDRAWN Claim, identify the corresponding correction Claim or relationship and write the SUPERSEDES edge.

MATCH (c:Claim {status: "WITHDRAWN"})
WHERE NOT EXISTS {
  MATCH (:Claim)-[:SUPERSEDES]->(c)
}
RETURN c.name AS withdrawn_claim,
       c.assertion AS assertion,
       c.as_of AS as_of,
       c.source AS source,
       elementId(c) AS id
ORDER BY c.as_of DESC
LIMIT 100;
