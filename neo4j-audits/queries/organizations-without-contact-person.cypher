// description: Organizations with no inbound edge from any Person. We track the org but have no human linked.
// severity: P3
// remediation: For each Organization, name at least one Person edge (CEO_OF, CONTRACTOR_FOR, EMPLOYEE_OF, etc.).

MATCH (o:Organization)
WHERE NOT EXISTS {
  MATCH (:Person)-[r]->(o)
  WHERE type(r) IN [
    'FOUNDER_OF','CEO_OF','DIRECTOR_OF','CHAIR_OF',
    'COMMUNITY_MANAGER_OF','EMPLOYEE_OF','CONTRACTOR_FOR',
    'ADVISOR_TO','MEMBER_OF'
  ]
}
RETURN o.name AS organization, elementId(o) AS id
ORDER BY o.name
LIMIT 200;
