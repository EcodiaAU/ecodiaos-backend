# Neo4j world-model schema

**status:** canonical
**authored:** 2026-06-11
**parent doctrine:** `patterns/neo4j-world-model-relationships-first-2026-06-11.md`
**parent project:** Neo4j world-model build (status_board 75775e77, P0)

The world-model contract. Every write into Neo4j conforms to this schema. Reads can rely on the contract. Changes to the schema happen through a Decision node + an amendment to this doc, never ad hoc.

The discipline is aggressive minimalism on labels and edge types, richness in properties. Few labels, few edges, doc-controlled vocabulary, property contracts every write enforces.

---

## Node labels (10)

| Label | Purpose | Required properties |
|---|---|---|
| `Person` | A named human. | `name` (canonical full name), `aliases` (list, optional) |
| `Organization` | A company, charity, festival body, government org. | `name` (canonical full name), `abn` (if Australian, optional), `kind` (`pty_ltd` / `charity` / `government` / `festival_body` / `partnership` / `dao_llc`) |
| `App` | A shippable product. | `name`, `bundle_id` (org.foo.app), `platforms` (list) |
| `Substrate` | A deployment substrate (Vercel project, Supabase project, Play console, ASC app, server). | `name`, `kind` (`vercel_project` / `supabase_project` / `play_app` / `asc_app` / `vps`), `external_id` |
| `Agreement` | A signed or pending agreement. | `name`, `signed_at` (date or null), `status` (`pending` / `signed` / `expired` / `terminated`) |
| `Event` | A meeting, signing, deadline, festival, milestone. | `name`, `date` or `start_aest` / `end_aest`, `location` (optional) |
| `Claim` | A discrete factual assertion the graph remembers (especially for supersession history). | `name`, `assertion` (the text), `status` (`confirmed` / `unverified` / `WITHDRAWN`) |
| `Episode` | A chronological session log. Already in heavy use. | `name`, `description`, `type` (enum: cowork_dispatch, cowork_realisation, cowork_audit, conductor_observed) |
| `Decision` | A durable Decision. Already in heavy use. | `name`, `description`, `rationale`, `status` |
| `Pattern` | A doctrine/pattern file. | `name`, `triggers` (list), `binding` |

That is the entire label space. Add new labels only with a Decision + this-doc amendment.

`Surface` and similar concepts live as properties on Substrate or as a tagged Substrate kind. The temptation to over-label is real and must be resisted.

---

## Edge types (30)

Each edge MUST carry the property contract (next section). Direction matters; the edge is named in the direction it reads naturally.

### People → Organizations
- `FOUNDER_OF` — `(Person)-[:FOUNDER_OF]->(Organization)`
- `CEO_OF` — single canonical CEO per org at any time
- `DIRECTOR_OF` — board director
- `CHAIR_OF` — board chair
- `COMMUNITY_MANAGER_OF` — community management role
- `EMPLOYEE_OF` — general employment edge with `role` property
- `CONTRACTOR_FOR` — independent contractor / consultant
- `ADVISOR_TO` — advisory role
- `MEMBER_OF` — member of a charity, DAO, partnership, etc.

### Organizations → Organizations, Apps, Substrates, Agreements
- `OWNS` — ownership (corp parent, app ownership)
- `SUBSIDIARY_OF` — corporate subsidiary
- `BUILDS_APP_FOR` — `(Builder:Organization)-[:BUILDS_APP_FOR]->(Client:Organization)` with `app_bundle` property
- `LICENSES_PLATFORM_TO` — platform licence
- `OPERATES` — operates an app or substrate
- `HOSTS` — hosts a substrate or service
- `USES` — uses a substrate
- `HAS_AGREEMENT_WITH` — links two orgs through an Agreement node; the Agreement carries dates and clauses

### Persons / Orgs → Events
- `ORGANISES` — organiser of the event
- `INVITED_TO` — invited but RSVP pending or declined
- `ATTENDS` — attending or attended
- `DECLINED` — invited and declined

### Apps → Substrates
- `DEPLOYED_TO` — app deployed to a substrate (e.g., `WoodfordiaApp -DEPLOYED_TO-> ASC app 6773752667`)
- `RUNS_ON_PROJECT` — app's primary Supabase / Vercel project

### Claims, Episodes, Decisions → anything
- `SUPERSEDES` — newer claim/decision replaces older
- `WITHDREW` — episode withdrew a prior claim (e.g., the Woodfordia P0 episode withdrew the lie)
- `EVIDENCES` — episode/decision evidences a claim or fact
- `EVIDENCES_EDGE` — episode/decision evidences a specific named relationship (use `edge` property for the type)
- `MENTIONS` — episode/claim names an entity without making an assertion about it
- `CORRECTS` — newer fact corrects an older fact
- `CONTRADICTS` — claim/fact contradicts another
- `DESCRIBES` — episode describes an event

### Patterns / Doctrine → Surface
- `APPLIES_TO` — pattern applies to a surface (path glob, repo, app, substrate)
- `BLOCKS_WRITE_TO` — pattern enforces a block on writes to a surface (hook-backed)
- `ENFORCED_BY` — pattern enforced by a specific hook file

That is the entire edge vocabulary. New types require Decision + doc amendment.

---

## Property contract on every edge

Every edge write MUST set:

- `source` (string) — where the fact came from. Examples: `"clients/coexist.md L9"`, `"Tate chat 2026-06-11 verbatim"`, `"gmail msg 19ea473c33430b4b"`, `"status_board f9e70100 context"`, `"kv_store cowork.calendar.meeting.woodfordia_site_visit_2026-06-17 attendee_emails"`, `"signed PDF documents/founding-docs/2026-05-26-option-deed-SIGNED.pdf"`.
- `confidence` (string enum) — `"confirmed"` (Tate said it directly, or a signed doc says it, or a counterparty source says it), `"inferred"` (derived from substrate without direct confirmation), `"unverified"` (not yet checked against any source).
- `as_of` (string ISO date) — the date the fact is asserted true. `2026-06-11`. Required.
- `authored_by` (string) — `"EcodiaOS conductor"` or `"worker <id>"` or `"manual import"`. Required.

Optional but encouraged:
- `notes` (string) — any context the reader needs.
- `valid_until` (string ISO date) — the date the fact stops being true (use for time-bound edges like a fixed-term retainer).
- `succeeded_by` (string) — name of the edge that supersedes this one, when SUPERSEDES is in play.

Edges without the four required properties are detected by the nightly sweep cron and surfaced to status_board.

---

## Canonical examples

A confirmed people-to-org relationship:
```cypher
MATCH (p:Person {name:"Kurt Jones"})
MATCH (o:Organization {name:"Co-Exist Australia"})
MERGE (p)-[r:CEO_OF]->(o)
SET r.as_of = "2026-06-11",
    r.source = "clients/coexist.md L9 + Tate chat 2026-06-11",
    r.confidence = "confirmed",
    r.authored_by = "EcodiaOS conductor 2026-06-11"
```

A build relationship between two orgs:
```cypher
MATCH (e:Organization {name:"Ecodia Pty Ltd"})
MATCH (c:Organization {name:"Co-Exist Australia"})
MERGE (e)-[r:BUILDS_APP_FOR]->(c)
SET r.as_of = "2026-06-11",
    r.app_bundle = "org.coexistaus.app",
    r.confidence = "confirmed",
    r.source = "clients/coexist.md L23-L29",
    r.authored_by = "EcodiaOS conductor 2026-06-11"
```

A supersession history:
```cypher
// The lie is preserved as a WITHDRAWN Claim
MERGE (wrong:Claim {name:"jess-as-coexist-ceo-2026-06-10-WITHDRAWN"})
SET wrong.assertion = "Jessica Ditchfield is the CEO of Co-Exist Australia",
    wrong.status = "WITHDRAWN",
    wrong.as_of = "2026-06-10",
    wrong.source = "Woodfordia prep brief commit ed33d65c (deleted from origin)"

// The correction node links to the live edge
MERGE (correct:Claim {name:"jess-community-manager-kurt-ceo-2026-06-11-CONFIRMED"})
SET correct.status = "confirmed",
    correct.as_of = "2026-06-11",
    correct.source = "Tate chat 2026-06-11 verbatim"

MERGE (correct)-[:SUPERSEDES]->(wrong)
```

A multi-hop query (the kind that justifies the graph existing):
```cypher
// Who has Ecodia agreed to build apps for, and who is the CEO of each of those clients?
MATCH (ecodia:Organization {name:"Ecodia Pty Ltd"})-[:BUILDS_APP_FOR]->(client:Organization)
OPTIONAL MATCH (ceo:Person)-[:CEO_OF]->(client)
RETURN client.name AS client, ceo.name AS ceo
```

---

## Read-side patterns

When authoring any Tate-facing or outbound deliverable that names a person, organisation, role, or relationship, run the canonical lookup pattern first:

```cypher
MATCH (n)
WHERE n.name IN [<names from draft>]
OPTIONAL MATCH (n)-[r]-(other)
WHERE r.confidence = "confirmed"
RETURN n.name AS entity, type(r) AS rel, other.name AS other, r.as_of, r.source
```

The result is the verified subgraph. Cite the relationships in the draft as `<!-- source: neo4j (Kurt:Person)-[:CEO_OF]->(CoExist:Org) confirmed Tate 2026-06-11 -->`. The unverified-claim-gate hook accepts this citation form as the strongest available.

---

## Write-side discipline (the four hooks + the sweep)

The hooks live at `~/.claude/hooks/ecodia/` and are wired in `~/.claude/settings.json`. They prompt for graph maintenance whenever a relevant change happens.

1. **`neo4j-userprompt-fact-detect.py`** (UserPromptSubmit). Scans your chat for `<Name> is the <role> of <Org>` patterns, surfaces the suggested MERGE Cypher for the next turn to run.

2. **`neo4j-substrate-write-prompt.py`** (PostToolUse on Write/Edit to `clients/*.md`, `status_board_upsert`, `kv_store_set`). When prose updates a role / relationship, surfaces the parallel graph update.

3. **`neo4j-episode-relationship-bind.py`** (PostToolUse on `neo4j_write_episode` / `neo4j_write_decision`). Scans the description for embedded relationship assertions, prompts to write the matching edges so the Episode evidences the world model.

4. **`unverified-claim-gate.py`** (PreToolUse, amended). Accepts graph-relationship citations as the strongest source form. Prefers them when both file and graph citations are available.

**Sweep cron `neo4j-world-model-sweep`** (nightly). Runs the audit catalogue at `backend/neo4j-audits/`, surfaces gaps to status_board.

---

## Graph ↔ knowledge.lookup cross-link

The same canonical entity has two homes: a prose home in `clients/<slug>.md` (or other markdown), and a relational home in the graph. The `backend/scripts/neo4j-cross-link.mjs` helper exposes:

- `graph-of(<slug>)` — returns the canonical `Organization` or `Person` node for a knowledge-lookup slug.
- `slug-of(<node>)` — returns the prose home for a graph node.

A deliverable author uses both: lookup for the prose context, the graph for the relationships, citations preferring graph paths.

---

## Disagreement resolution

When the graph and a markdown file disagree on a relationship:

1. **The graph wins** for relational facts (CEO, role, builds_app_for, attends).
2. **The markdown wins** for prose context (notes, gotchas, history).
3. **The same turn that detects disagreement updates whichever surface is wrong.** Drift between the two surfaces is itself a status_board P3 finding from the nightly sweep.

This is a default; explicit Tate-verbatim correction overrides both.

---

## What the schema is NOT

- It is not an ontology of EcodiaOS. It is a minimal vocabulary for facts that matter for deliverables.
- It is not a mirror of status_board. status_board holds operational state (work in flight); the graph holds the world model (truth about entities).
- It is not a catalogue of everything that has ever happened. Episodes carry the chronology. The graph carries the model.
- It is not a knowledge graph in the academic sense. It is a working substrate for "who is what of whom, with provenance".

Discipline + minimal vocabulary + property contract is the value proposition. Thin but powerful, per Tate 2026-06-11.
