// description: Persons with no primary-affiliation edge to any Organization. Operational debt.
// severity: P3
// remediation: For each Person, identify their primary org from the prose context and write the canonical affiliation edge (FOUNDER_OF / CEO_OF / EMPLOYEE_OF / CONTRACTOR_FOR / MEMBER_OF).

MATCH (p:Person)
WHERE NOT EXISTS {
  MATCH (p)-[r]->(:Organization)
  WHERE type(r) IN [
    'FOUNDER_OF','CEO_OF','DIRECTOR_OF','CHAIR_OF',
    'COMMUNITY_MANAGER_OF','EMPLOYEE_OF','CONTRACTOR_FOR',
    'ADVISOR_TO','MEMBER_OF'
  ]
}
RETURN p.name AS person, elementId(p) AS id
ORDER BY p.name
LIMIT 200;
