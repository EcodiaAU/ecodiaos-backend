// description: Apps with no BUILDS_APP_FOR / OWNS edge. Orphans that no Organization is responsible for.
// severity: P3
// remediation: Add the BUILDS_APP_FOR / OWNS edge from the responsible Organization with full provenance.

MATCH (a:App)
WHERE NOT EXISTS {
  MATCH (:Organization)-[r]->(a)
  WHERE type(r) IN ['BUILDS_APP_FOR','OWNS','OPERATES']
}
RETURN a.name AS app, a.bundle_id AS bundle_id, elementId(a) AS id
ORDER BY a.name
LIMIT 200;
