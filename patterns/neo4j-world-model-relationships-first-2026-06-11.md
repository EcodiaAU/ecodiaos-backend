---
binding: hook=neo4j-relationship-prompt.py + skill=knowledge-route + project=neo4j-world-model-2026-06-11
triggers: world model, world-model, neo4j relationships, neo4j edges, neo4j graph, relationship write, who is the, who is X, what is X's role, codify the world, graph traversal, graph closed loop
---

# Neo4j is the world model. Relationships first, episodes second.

**status:** active project (codifying the world)
**authored:** 2026-06-11
**origin:** Tate 2026-06-11, after the Woodfordia prep brief asserted Jess as Co-Exist CEO and Tate as a Co-Exist principal. The graph could have answered the right roles in one Cypher hop, but EcodiaOS does not actually maintain it as a graph. Tate verbatim: "Pretty sure this is the whole point of neo4j... a graph that we could've traced for relationships, but its so hard for me to push you to uphold and maintain neo4j in that way... Neo4j is so unbelievably powerful, but like the knowledge lookup it needs to be a closed loop utility."
**parent doctrine:** [[factual-claims-require-substrate-citation-before-deliverable-2026-06-11]]
**parent project:** Neo4j world-model build (status_board project row, see below)

---

## The rule

**Neo4j is the world model.** When a fact surfaces about a person, organisation, role, agreement, app, event, or relationship, the same turn that learns it writes a relationship edge into Neo4j. When a deliverable needs facts about those entities, the deliverable queries the graph first and cites the relationship by name, not a markdown file.

Episodes are second-class. They are the chronological log; they are not the world model. A session that writes an Episode but no relationships has not used the graph.

## Why

The Woodfordia prep brief lied because the graph could not answer "who is the CEO of Co-Exist". The answer existed in a single sentence on line 9 of a markdown file. The graph had Episodes mentioning Kurt and Jess and Co-Exist but no edge like `(Kurt)-[:CEO_OF]->(CoExist)`. A worker reading the graph found Episodes but no claim about CEO; a worker reading the markdown file found the right answer; a worker reading the kv_store found a hedged guess; the brief author picked the wrong source and laundered the guess into a lie. The graph being a glorified episode log instead of a world model is the root of why a multi-layer truth gate did not exist.

Markdown files (`clients/<slug>.md`) are write-only fast paths. They drift. They are not queryable beyond grep. They cannot be traversed. They cannot answer "who else does Kurt have a relationship with across Ecodia clients" or "what apps does Ecodia build for Woodfordia" or "which agreements are in force between Ecodia and Co-Exist as of today". The graph can answer all three in single Cypher queries IF the relationships exist.

Tate has been pushing this for months. The cost of not maintaining Neo4j as a graph is paid every time a deliverable invents a fact the graph could have served correctly. The Woodfordia brief is one instance; the deeper failure is the standing pattern.

## How to apply

### Write side. Every turn that learns a fact about an entity writes a relationship.

When a session discovers any of these, write the corresponding Cypher in the same turn:

- A person's role at an organisation. `MERGE (p:Person {name:"Kurt Jones"}) MERGE (o:Org {name:"Co-Exist Australia"}) MERGE (p)-[r:CEO_OF]->(o) SET r.as_of=date("2026-06-11"), r.source="Tate chat 2026-06-11", r.confidence="confirmed"`.
- A relationship of an organisation to a product, app, agreement, or other organisation. `(Ecodia)-[:BUILDS_APP_FOR]->(CoExist)`, `(Ecodia)-[:LICENSES_PLATFORM_TO]->(CoExist)`, `(Ecodia)-[:HAS_AGREEMENT_WITH {signed_at: ..., status: ...}]->(CoExist)`.
- An attendance, invitation, or appearance at an event. `(Kurt)-[:INVITED_TO]->(WoodfordiaSiteVisit2026_06_17)`, `(Tate)-[:ATTENDS {as: "Ecodia"}]->(WoodfordiaSiteVisit2026_06_17)`.
- A supersession or correction. `(NewClaim)-[:SUPERSEDES]->(OldClaim) SET r.reason="Tate correction 2026-06-11"`.

Every relationship carries provenance properties: `source` (chat / file / mailbox / kv_store key / status_board row id), `confidence` (`confirmed` from Tate or counterparty, `inferred` from substrate, `unverified`), `as_of` (date), and a `notes` field if context is load-bearing.

Episodes still get written when the chronological narrative matters. They MUST link to the relationships they reference using `RELATES` or `EVIDENCES` edges, so the graph can traverse from "what happened" to "what's true now".

### Read side. Deliverables query the graph first.

Before authoring a deliverable that names a person, organisation, role, or relationship, run the relevant Cypher query against Neo4j:

- *"Who is the CEO of Co-Exist?"* `MATCH (p:Person)-[r:CEO_OF]->(o:Org {name:"Co-Exist Australia"}) RETURN p.name, r.as_of, r.source, r.confidence`.
- *"What is Jess's role at Co-Exist?"* `MATCH (p:Person {name:"Jess"})-[r]->(o:Org {name:"Co-Exist Australia"}) RETURN type(r), r.as_of, r.source`.
- *"Which apps does Ecodia build, and for whom?"* `MATCH (Ecodia)-[:BUILDS_APP {status:"live"}]->(a:App)-[:OWNED_BY]->(o:Org) RETURN a.name, o.name`.

If the graph answers, cite the relationship in the deliverable as the primary source. The citation form is `<!-- source: neo4j (Kurt:Person)-[:CEO_OF]->(CoExist:Org) confirmed Tate 2026-06-11 -->`. The unverified-claim-gate hook accepts this as a stronger citation than a file or kv reference.

If the graph does NOT answer, the gap is the signal. Either the relationship has never been written (the substrate is incomplete; write it before drafting the deliverable), or the fact is genuinely unknown (escalate to Tate). Drafting through a graph gap is the failure mode this doctrine forbids.

### Canonical relationship vocabulary

The world model uses a stable vocabulary so workers can write and query without inventing edge types each time. Initial vocab (extend by amendment, not by ad-hoc coinage):

- People to organisations: `FOUNDER_OF`, `CEO_OF`, `CHAIR_OF`, `DIRECTOR_OF`, `COMMUNITY_MANAGER_OF`, `EMPLOYEE_OF`, `CONTRACTOR_FOR`, `MEMBER_OF`, `ADVISOR_TO`, `LEGAL_REPRESENTATIVE_OF`.
- Organisations to products, agreements, apps, substrates: `OWNS`, `OPERATES`, `BUILDS_APP_FOR`, `LICENSES_PLATFORM_TO`, `HAS_AGREEMENT_WITH`, `HOSTS`, `USES`.
- People to events: `INVITED_TO`, `ATTENDS`, `ORGANISES`, `DECLINED`.
- Claims and corrections: `SUPERSEDES`, `CORRECTS`, `EVIDENCES`, `CONTRADICTS`, `WITHDRAWN`.
- Apps to substrates: `RUNS_ON_PROJECT`, `STORES_DATA_IN`, `DEPLOYED_TO`.

Each edge type has a documented semantic in `backend/docs/neo4j-world-model-schema.md` (the schema is part of the project deliverable). New edge types are added through that doc with a description, valid endpoint labels, and required provenance properties.

## Hook architecture (project deliverable)

Three hooks land progressively as the project ships:

1. **`neo4j-relationship-prompt.py`** (PreToolUse on Write/Edit to deliverable surfaces). When the draft names entities the graph carries, surface a Cypher snippet showing the relationships available. When the draft names entities the graph does NOT carry, surface a write-side prompt with the suggested MERGE.
2. **`neo4j-episode-relationship-bind.py`** (PostToolUse on `neo4j_write_decision` / `neo4j_write_episode`). Scans the description for "X is the Y of Z" and "X works at Y" patterns. Surfaces a relationship-write prompt if the corresponding edges are not also being written in the same turn.
3. **`unverified-claim-gate.py` amendment** (PreToolUse, already live). Accept `<!-- source: neo4j ... -->` citations as the highest-priority citation form. Downgrade file and kv citations to acceptable-but-weaker.

The hooks are intentionally noisy. The cost of false positives is "write the relationship". The cost of false negatives is the Woodfordia incident.

## Anti-patterns

1. **"I will write the Episode and call it done."** An Episode without relationships is a paragraph in a long log. The graph cannot traverse from it. Future workers cannot query it.
2. **"The relationship is implicit in the prose."** It is not. Future workers query, they do not read.
3. **"I will write the relationships next session."** Next session has no signal to write them. Same turn or never.
4. **"This relationship is too obvious to write."** The Woodfordia brief invented "Jessica Ditchfield is the CEO" because Kurt-CEO_OF-CoExist was too obvious to write. The graph's value is the obvious facts being queryable.
5. **"Markdown files are the source of truth."** They are the WRITE format for prose. The graph is the QUERY format for relationships. Both exist; the graph is canonical when they disagree on a relationship, and the markdown gets fixed in the same turn.

## Recipe for any session that mentions a person or organisation

1. **Query the graph first.** `MATCH (p:Person {name:"<who>"})-[r]-(other) RETURN type(r), other.name, r.as_of, r.confidence`. If the graph has the answer, cite it.
2. **If a fact is new or corrected**, write the MERGE + edge in the same turn. Always with `source` / `confidence` / `as_of` properties.
3. **Link Episodes to relationships.** When writing an Episode, add `(:Episode {name:"..."})-[:EVIDENCES]->(:Relationship {...})` edges so the chronology connects to the world model.
4. **On supersession, do not delete.** `(NewClaim)-[:SUPERSEDES]->(OldClaim)`. The graph keeps history. The world model is point-in-time queryable.
5. **Before drafting a deliverable**, traverse the relevant subgraph for every named entity. Embed the graph citation in the draft.

## Project tracking

The Neo4j world-model build is a tracked project on `status_board`. Schema doc, hook implementations, batch import of existing client docs into the graph, audit query catalogue, and the migration of clients/<slug>.md files from prose-only to prose-with-graph-citations are the canonical project deliverables. See the project row for current state.

## Cross-references

- [[factual-claims-require-substrate-citation-before-deliverable-2026-06-11]]. The parent doctrine; this pattern extends its citation vocabulary to prefer graph paths.
- [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]]. The knowledge-side closed-loop precedent; the graph is the relational analogue.
- [[neo4j-canonical-entity-dedup]]. Stops duplicate Person/Org nodes from breaking traversal.
- [[neo4j-first-context-discipline]]. Reads the graph first; this pattern extends to writes.
- [[neo4j-episode-chain-relationships]]. Episode-to-Episode chaining; this pattern extends to Person/Org/Event entities.
- [[verify-before-asserting-in-durable-memory]]. The same discipline applied to the act of writing into the graph itself.
- [[hooks-are-the-epitome-of-learning-prose-without-hook-is-forgotten-2026-06-09]]. Why the hook stack is the only durable enforcement.
