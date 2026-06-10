// description: Events with no ORGANISES inbound edge. We have an Event in the graph but no Person is on the record as having called it.
// severity: P3
// remediation: For each Event, identify the organiser from the calendar source and write the ORGANISES edge with full provenance.

MATCH (e:Event)
WHERE NOT EXISTS {
  MATCH (:Person)-[:ORGANISES]->(e)
}
RETURN e.name AS event,
       e.date AS date,
       e.start_aest AS start_aest,
       elementId(e) AS id
ORDER BY coalesce(e.date, e.start_aest, '0000-00-00')
LIMIT 200;
