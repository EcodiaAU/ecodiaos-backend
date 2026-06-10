# Neo4j knowledge graph hygiene — 2026-05-08

Worker fork: `fork_mowk9wfl_0b18b8` (manager fork `fork_mowk9wfl_0b18b8` spring-clean worker 4)
Run timestamp: 2026-05-08 ~17:03 AEST

[APPLIED] ~/ecodiaos/patterns/neo4j-canonical-entity-dedup.md because exact-name-match cross-label dedup is the load-bearing rule and this run's three merges were exactly that case (`Tate` -> `Tate Donohoe`, `WattleOS` legacy `Embedded` -> modern `__Embedded__`, `organism-backend` legacy `Embedded` -> modern `__Embedded__`).
[APPLIED] ~/ecodiaos/patterns/neo4j-first-context-discipline.md because this hygiene pass writes durable `merged_from` + `last_merged_at` + `fork_stamp` properties on canonical nodes so future cold-start sessions can audit what was consolidated.
[NOT-APPLIED] ~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md because **this pattern file is missing on disk** (see Section 7) - flagged for hygiene but not surfaced into the merge logic.

## Summary

| Metric | Value |
|---|---|
| Total nodes (post-merge) | 8228 |
| Total relationships | 19676 |
| Duplicate clusters merged this run | 3 |
| Duplicate clusters surfaced for review | 0 |
| Orphaned Episodes (>30d, no Decision/Pattern link) | 0 |
| Stale Decision nodes (no recent inbound rels) | 3 (all with NULL `created_at` - epoch fallback, not actually stale) |
| Stale Pattern nodes (no recent inbound rels) | 2 (with NULL `created_at`); 850/964 Patterns have NULL `date` field but are not actually old |
| Superseded Strategic_Direction archived this run | 0 |
| Superseded Strategic_Direction needing review | 4 (string-property supersession, predecessor names don't exist as nodes) |
| Pattern files referenced but missing on disk | 1 |

## Section 1: duplicate clusters MERGED this run

### 1.1 `Tate` (id 9262) -> `Tate Donohoe` (id 1)

- **Canonical:** id 1, name `Tate Donohoe`, labels `[__Embedded__, Person, Embedded]`, full property set incl. `full_name`, `email=tate@ecodia.au`, `role=Authorized Human Representative, co-founder`, `home_directory=/home/tate`, `associated_calendar=Tate's Calendar`, comprehensive Ecodia DAO context, plus `OWNS_WORKSPACES`/`SENT_EMAIL_TO`/`WORKS_WITH` functional relationships
- **Merged-out:** id 9262, name `Tate`, labels `[__Embedded__, Person, Entity, Embedded]`, sparse properties (`role=Authorized Human Representative` + `project=organism`)
- **Reasoning:** both are clearly the same human entity. Canonical chosen for: full canonical name (`Tate Donohoe`), comprehensive property set, functional relationship profile (OWNS, SENT_EMAIL_TO, WORKS_WITH, OWNS_WORKSPACES). The merged-out node had higher raw indegree (561 vs 140) but indegree was dominated by `MENTIONS` (420) and `INVOLVES` (131) - i.e. "Tate is being talked about" mentions, not functional state. Per the brief's tiebreaker hierarchy: DAO-membership-link > highest-indegree, but neither has a direct `:MEMBER_OF`-style edge to `Ecodia DAO LLC`, so property-quality + canonical-name resolution applies. Tate Donohoe IS the founder per the operating doctrine; the bare-first-name fragment was an LLM-extraction artefact.
- **Redirected:** 561 incoming + 4 outgoing relationships
- **Post-merge canonical state:** indegree 701, outdegree 220
- **Stamp:** `canonical.fork_stamp = 'fork_mowk9wfl_0b18b8'`, `canonical.last_merged_at = datetime()`, `canonical.merged_from` appended `'neo4j_id_9262_Tate_fork_mowk9wfl_0b18b8'`

### 1.2 `WattleOS` legacy (id 1734, label `Embedded`) -> `WattleOS` modern (id 13044)

- **Canonical:** id 13044, labels `[__Embedded__, Project, Resource, System, Codebase]`, has `description="The codebase where the issue occurred"`, `source_module="llm_autonomous_maintenance"`
- **Merged-out:** id 1734, label `[Embedded]` only (single-underscore-free legacy label), no description, no source_module
- **Reasoning:** textbook `__Embedded__` (modern) vs `Embedded` (legacy) duplicate fragment per `~/ecodiaos/patterns/neo4j-canonical-entity-dedup.md` Origin (Apr 21 2026). Same name, same project. Modern node has typed-label set + description + source provenance; legacy has nothing. Safe automatic merge.
- **Redirected:** 2 incoming + 0 outgoing relationships
- **Stamp:** `fork_mowk9wfl_0b18b8`

### 1.3 `organism-backend` legacy (id 1646, label `Embedded`) -> `Organism-backend` modern (id 14464)

- **Canonical:** id 14464, name `Organism-backend`, labels `[__Embedded__, Project, Resource, Artifact, System, Service, Component, Codebase]`, description `"The backend codebase for the organism system"`, `source_module="factory_outcome"`
- **Merged-out:** id 1646, name `organism-backend` (lowercase-O variant), label `[Embedded]` only
- **Reasoning:** same legacy/modern split as 1.2. Capitalisation difference is incidental (`organism-backend` vs `Organism-backend`); `toLower(trim(name))` identical. Modern node has full typed-label coverage + description; legacy was barren.
- **Redirected:** 3 incoming + 0 outgoing relationships
- **Stamp:** `fork_mowk9wfl_0b18b8`

## Section 2: duplicate clusters NOT merged

None at the conservative bar. The graph is in unusually clean exact-name-match shape — the ONLY exact-name cross-label duplicates remaining anywhere in the graph after this run are zero. The dedup logic from `kgConsolidationService.js` (per pattern Origin) appears to be working since the Apr 21 fix.

Notes for future review (not duplicates, called out for context):
- `Ecodia` (Organization, id varies, indegree 58) vs `Ecodia Pty Ltd` (Organization, indegree 16) vs `Ecodia DAO LLC` (Organization, indegree 9) - **legitimately distinct entities** (the umbrella brand vs the AU consultancy entity vs the WY DAO LLC). Do NOT merge.
- `Co-Exist` (Organization+Project, indegree 26) vs `Co-Exist Australia` (Organization, indegree 12) - likely same project under different naming conventions. Surfaced for review only - not merging because property profiles differ (Co-Exist has Project label and codebase context, Co-Exist Australia is the formal entity name). Tate-call.
- `Goodreach` (Organization+Project, indegree 27) - single node, no duplicate.
- `ecodiatate` (Organization, indegree 6) and `ecodiatates` (Organization, indegree 6) - look like LLM extraction noise (likely meant `EcodiaTate` GitHub org). Surfaced for review.

## Section 3: orphaned Episodes (>30d, no Decision/Pattern link)

**Count: 0**

Every Episode older than 30 days has at least one relationship to a Decision or Pattern node. The graph's episode-chain discipline (per `~/ecodiaos/patterns/neo4j-episode-chain-relationships.md`) is being applied.

## Section 4: stale Decision/Pattern nodes (>60d, no recent inbound rels)

### Decisions
- **Total stale by strict definition: 3** — all of them have NULL `created_at` and NULL `date`, so they fall into the epoch (1970) bucket. They are not actually old-and-forgotten; they are *undated*.
- Sample names:
  - "Reject Factory session to preserve manual commit 053510a"
  - "Stale-schedule audit enforced via PostToolUse harness hook not agent memory"
  - "Non-Tate-indexed value stream: start with journal, do not scaffold more cron architecture"
- **Hygiene flag:** these need backfilling with `created_at = datetime()` based on Episode ABSTRACTED_FROM links if available. Surfacing for the conductor's CLAUDE.md reflection cron to handle.

### Patterns
- **Total Patterns: 964**
- **Null `date` field: 850/964 (88%)** — `date` is rarely populated; `created_at` is the reliable timestamp.
- **Total stale by strict definition (NULL `created_at` AND no recent inbound rels): 2**. Negligible.
- Sample names from broader Pattern set with NULL `date`:
  - "Same-process monitors are not monitors"
  - "kv_store TEXT-not-JSONB landmine"
  - "Negotiation default Hold Your Ground"
  - "Client-facing IP attribution hides internal group structure"
  - "AI-Native Consulting Studio Building on Own Products"
  - "Engagement-Decision-Stagnation Cycle"
- **Hygiene flag:** the `date` field is not the right staleness signal for Pattern nodes - `created_at` (an actual datetime) is. Future hygiene workers should use `created_at`, not `date`. The 816 number from the brief's exact query is a false-positive cluster from the schema mismatch.

## Section 5: superseded Strategic_Direction

### Archived this run: 0

The brief's `:SUPERSEDES` relationship-based query returned 0 results. The graph stores supersession via STRING property `s.supersedes`, not via a typed `:SUPERSEDES` edge. Surfaced for review:

| New node id | New name | Predecessor (string) | Predecessor exists? |
|---|---|---|---|
| 53 | Conservation NGO platform (working name pending) - the Multiplier Thesis (Apr 20 origin) | Co-Exist as Conservation NGO Platform (the Multiplier Thesis) (Apr 20 2026) | Not found by exact name match |
| 2139 | Conservation platform (working name pending) for peak bodies - validate Multiplier Thesis against Landcare as tenant-0 | Platform-Co-Exist for peak bodies - validate Multiplier Thesis against Landcare as tenant-0 (Apr 23 2026) | Not found |
| 2339 | Conservation platform (working name pending) for peak bodies - Multiplier Thesis | Platform-Co-Exist for peak bodies - Multiplier Thesis (Apr 25 2026) | Not found |
| 3690 | Chambers federation is the highest-EV revenue line - convert SCYCC verbal to paid SOW + 5-chamber 90-day target | ceo.last_strategic_session 2026-04-27 forks-as-peers insight - that was infrastructural, this is revenue-strategic | Not found |

**Why not archived:** the predecessor names referenced in the `supersedes` string property do NOT match any actual `:Strategic_Direction` node by exact name. They look like prose descriptions of an older Strategic_Direction that was either renamed before the supersession was recorded, or referenced by a different naming convention (e.g. older nodes used "Co-Exist" specifics; newer ones say "Conservation platform (working name pending)"). Without an exact match, archiving the wrong predecessor would be worse than leaving the chain unresolved.

**Recommendation for review (next worker / Tate):** either backfill `:SUPERSEDES` edges with fuzzy-match heuristics + Tate-confirm, OR adopt the convention that `s.supersedes` carries the exact `name` of the predecessor for machine traceability.

## Section 6: graph-level metrics

### Current label counts (post-merge, top 30)
| Label | Count |
|---|---|
| `__Embedded__` | 8038 |
| `Concept` | 1400 |
| `Pattern` | 964 |
| `Embedded` (legacy) | 780 |
| `Problem` | 706 |
| `Decision` | 544 |
| `Episode` | 438 |
| `Event` | 434 |
| `Task` | 391 |
| `Strategic_Direction` | 373 |
| `System` | 293 |
| `Action` | 289 |
| `CCSession` | 258 |
| `Process` | 233 |
| `Reflection` | 209 |
| `Component` | 190 |
| `Entity` | 173 |
| `Resource` | 158 |
| `Organization` | 154 |
| `Tool` | 138 |
| `Error` | 125 |
| `Artifact` | 114 |
| `File` | 97 |
| `Session` | 97 |
| `Project` | 96 |
| `realization` | 96 (lowercase legacy) |
| `Feature` | 95 |
| `Operation` | 94 |
| `Investigation` | 86 |
| `Status` | 82 |

### 30-day growth (top 20)
| Label | New nodes |
|---|---|
| `__Embedded__` | 2071 |
| `Episode` | 437 |
| `Pattern` | 428 |
| `CCSession` | 258 |
| `Decision` | 251 |
| `Embedded` (legacy) | 243 |
| `Reflection` | 206 |
| `Concept` | 106 |
| `realization` | 96 |
| `Problem` | 81 |
| `Research` | 68 |
| `Strategic_Direction` | 66 |
| `Prediction` | 44 |
| `observation` | 43 |
| `Recurring_Pattern` | 42 |
| `thought` | 40 |
| `Artifact` | 39 |
| `Narrative` | 37 |
| `Organization` | 32 |
| `System` | 28 |

### Top relationship types
| Type | Count |
|---|---|
| `RELATES_TO` | 1867 |
| `MENTIONS` | 1137 |
| `ABSTRACTED_FROM` | 649 |
| `CONTAINS` | 495 |
| `INVOLVES` | 358 |
| `PRODUCED` | 345 |
| `MONITORS` | 344 |
| `PART_OF_EPISODE` | 335 |
| `HAS_STATUS` | 250 |
| `TARGETS` | 250 |
| `CAUSED_BY` | 235 |
| `REPORTS_ON` | 216 |
| `TRIGGERED` | 194 |
| `INVESTIGATES` | 146 |
| `REQUIRES` | 143 |

### Hygiene observations on the metrics
- **Legacy `Embedded` label still has 780 nodes after this run.** The pattern-of-origin (`neo4j-canonical-entity-dedup.md`) flags but does not mandate phasing this out, because some consumer code may still reference the bare-name `Embedded` label. Future capability work: grep the codebase for `Embedded` references, then phase out via re-label cycle.
- **Lowercase legacy labels still present:** `realization` (96), `observation` (43), `thought` (40). The Origin pattern flags these — "Do NOT merge across the lowercase/Proper-case label pairs ... by name alone without also checking content - those legacy lowercase labels may point to different schemas." Surface for a future review pass.
- **Decision and Pattern timestamping inconsistency:** `date` is null on 850/964 Patterns. `created_at` is the reliable field. Update any future hygiene worker / pattern-corpus-health-check cron to query on `created_at`.

## Section 7: pattern files referenced but missing on disk

**Flagged for worker 3 / conductor:**

1. `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — referenced by the brief, by `~/ecodiaos/CLAUDE.md` ("Distributed-state seam discipline" subsection of status_board doctrine), and by multiple status_board patterns. **Not present on disk.** Pattern doctrine appears to live inline in `~/ecodiaos/CLAUDE.md` only, not split out into the `~/ecodiaos/patterns/` directory. This violates the file-per-thing layer of the context-surfacing architecture (`~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md`). Recommendation: extract the inline doctrine to a standalone file with `triggers:` frontmatter so the grep-before-action protocol can surface it.

No other referenced patterns missing.
