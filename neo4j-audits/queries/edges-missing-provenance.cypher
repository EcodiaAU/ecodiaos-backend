// description: Edges in the canonical vocabulary missing source, confidence, or as_of properties. Schema contract violations.
// severity: P3
// remediation: Patch each edge with the four required properties (source, confidence, as_of, authored_by) or supersede with a clean edge and mark the old one withdrawn.

MATCH ()-[r]->()
WHERE type(r) IN [
  'FOUNDER_OF','CEO_OF','DIRECTOR_OF','CHAIR_OF',
  'COMMUNITY_MANAGER_OF','EMPLOYEE_OF','CONTRACTOR_FOR',
  'ADVISOR_TO','MEMBER_OF',
  'OWNS','SUBSIDIARY_OF','BUILDS_APP_FOR','LICENSES_PLATFORM_TO',
  'OPERATES','HOSTS','USES','HAS_AGREEMENT_WITH',
  'ORGANISES','INVITED_TO','ATTENDS','DECLINED',
  'DEPLOYED_TO','RUNS_ON_PROJECT'
]
  AND (r.source IS NULL OR r.confidence IS NULL OR r.as_of IS NULL)
RETURN type(r) AS edge,
       startNode(r).name AS from,
       endNode(r).name AS to,
       r.source IS NULL AS missing_source,
       r.confidence IS NULL AS missing_confidence,
       r.as_of IS NULL AS missing_as_of,
       elementId(r) AS rel_id
LIMIT 200;
