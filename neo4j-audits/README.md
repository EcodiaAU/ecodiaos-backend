# Neo4j world-model audit catalogue

The sweep cron `neo4j-world-model-sweep` runs nightly at 03:15 AEST. It executes every `.cypher` file in `queries/`, treats non-empty results as findings, and writes one status_board P3 row per finding type. Findings are operational gaps in the world model: missing affiliations, missing provenance, duplicate entity candidates, weak generic edges that need migrating.

The catalogue is the operational manifestation of `patterns/neo4j-world-model-relationships-first-2026-06-11.md`. Without the sweep the graph drifts silently; with the sweep gaps surface within 24 hours of being introduced.

## Catalogue (run order)

1. **persons-without-primary-affiliation.cypher**. Persons with no FOUNDER_OF, CEO_OF, DIRECTOR_OF, CHAIR_OF, COMMUNITY_MANAGER_OF, EMPLOYEE_OF, CONTRACTOR_FOR, or MEMBER_OF edge to any Organization. A Person we know but cannot place is operational debt.
2. **organizations-without-contact-person.cypher**. Organizations with no inbound edge from any Person. We track the org but have no human linked.
3. **apps-without-builder-or-owner.cypher**. Apps with no BUILDS_APP_FOR / OWNS edge. Orphans that no one is responsible for.
4. **edges-missing-provenance.cypher**. Edges lacking `source`, `confidence`, or `as_of`. Schema-contract violations.
5. **duplicate-entity-candidates.cypher**. Same-name-prefix Person or Organization nodes that should be merged.
6. **weak-edges-to-migrate.cypher**. Edges of type RELATES_TO / AFFILIATED_WITH / HAS_RELATIONSHIP / EMPLOYED_BY / WORKS_FOR / WORKS_WITH that should be migrated to canonical vocabulary.
7. **events-without-organiser.cypher**. Future Events with no ORGANISES inbound edge.
8. **claims-without-supersession.cypher**. WITHDRAWN claims with no SUPERSEDES inbound edge from a confirmed correction.

## Runner

`run-sweep.mjs` reads every `.cypher` file, executes against Neo4j via the direct driver (`neo4j-driver` npm package), aggregates findings, emits one status_board upsert per non-empty finding as JSONL on stdout. The cron worker parses the JSONL and posts the upserts through `mcp__ecodia-core__status_board_upsert`.

**Prerequisite:** `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` must be in env. The cron prompt sources `/Users/ecodia/PRIVATE/ecodia-creds/neo4j.env` before the runner. That env file is NOT in `kv-mirror` yet; first cron fire after schema land needs Tate to drop the Aura URI + password into that file. Once present, every subsequent fire works without intervention.

## Usage

```bash
# Cron-fired
node /Users/ecodia/.code/ecodiaos/backend/neo4j-audits/run-sweep.mjs

# Manual / ad hoc
node /Users/ecodia/.code/ecodiaos/backend/neo4j-audits/run-sweep.mjs --dry-run

# Single query
node /Users/ecodia/.code/ecodiaos/backend/neo4j-audits/run-sweep.mjs --only persons-without-primary-affiliation
```

## Extending

Add a `<slug>.cypher` to `queries/`. The query MUST return a row set; an empty result means "no finding". Include a comment block at the top with `description`, `severity`, `remediation` so the runner can carry them into status_board.

```cypher
// description: <one-line>
// severity: P2 | P3
// remediation: <one-line that an operator can act on>
MATCH ...
RETURN ...
```
