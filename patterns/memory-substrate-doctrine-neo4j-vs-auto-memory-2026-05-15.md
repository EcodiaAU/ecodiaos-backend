---
triggers: memory-substrate-doctrine, neo4j-vs-auto-memory, substrate-split, where-does-this-memory-go, write-routing, write-routing-misroute, memory-substrate-misroute, doctrine-pattern-substrate, kv_store-mirror, cloud-routine-cant-see-corazon-memory, promotion-criteria, demotion-criteria, stale-neo4j-node, frozen-auto-memory, neo4j-pattern-promote, neo4j-decision-promote, neo4j-strategic-direction, auto-memory-bridge, auto-memory-feedback, auto-memory-project, auto-memory-reference, auto-memory-user, conversation-scoped-state, cold-start-test, cross-substrate-index, memory-substrate-routing-hook, before-writing-memory, deciding-where-to-save, neo4j-write_episode, neo4j-write_decision, neo4j-pattern-node, neo4j-strategic_direction, anthropic-auto-memory
---

# Memory substrate doctrine - Neo4j vs auto-memory split

## The rule

EcodiaOS has two durable memory substrates. They are not redundant. They are not sync targets. They are different shaped memories with different access patterns, retention horizons, and authorisation surfaces. The act of writing memory is a routing decision: pick the substrate that matches the memory's nature, do not write to both by default.

| Memory kind | Substrate | Why |
|---|---|---|
| Architecture decision (load-bearing, multi-agent, requires audit trail) | Neo4j Decision node | Org-level. Every fresh session and every cloud Routine must see it on cold start. |
| Episode (a notable thing happened, must be retrievable later by semantic search) | Neo4j Episode node | Same. Episodes feed the semantic resurface hook. |
| Doctrine pattern (rule + why + how to apply) | `backend/patterns/<slug>.md` file + Neo4j Pattern node (auto-ingested by KG pipeline) | Co-located with code. INDEX.md is the human-readable retrieval surface. Pattern node lets semantic search reach it. |
| Client knowledge (per-client substrate) | Neo4j Person + Organization nodes + `clients/<slug>.md` | Org-level. Every CRM-touching session needs the same view. |
| Strategic direction (top-N goals, time-bound) | Neo4j Strategic_Direction node | Org-level, low-frequency, high-importance. Surfaces on session-orient. |
| User preference / interaction style (Tate's preferences, my collaboration style with him) | auto-memory `feedback` type at `C:/Users/tjdTa/.claude/projects/d---code/memory/feedback_*.md` | Per-relationship. The relationship is with Tate, not with the org. Machine-local is fine because only Corazon sessions need it; cloud Routines do not converse with Tate the same way. |
| Current project state (in-flight initiatives, refreshed every session) | auto-memory `project` type at the same path | Per-relationship, fast-decaying. Refreshed each session. Survives at most a week before requiring re-validation. |
| Reference (where to find X) | auto-memory `reference` type | Cheap to maintain, machine-local is fine. |
| User profile (Tate's role, scope, knowledge level) | auto-memory `user` type | Per-relationship. |
| Conversation-scoped state (in-flight context, todo list, current debugging trail) | Nowhere durable. Let it die with the session. | Not memory. Just context. Promoting it pollutes the substrate. |
| Cross-substrate index | `MEMORY.md` (the auto-memory index file) + `backend/patterns/INDEX.md` (the pattern index) | The two indexes point at the two substrates. They do not merge. |

## Why this matters

Without explicit doctrine the failure modes are:

1. **Duplicate writes.** Same fact lands in Neo4j Decision and in auto-memory `project`. The two drift independently. Six weeks later one says "shipped" and the other says "in progress." I trust whichever I happen to read first.
2. **Wrong-substrate writes.** A Tate preference ("never use coral red in Co-Exist") gets written as a Neo4j Decision node. Now every cloud Routine treats it as load-bearing org doctrine when it is actually a relationship preference. Conversely an org-level architecture decision gets stuck in a Corazon-local auto-memory `project` file - cloud Routines never see it and rediscover the same question.
3. **Stale data.** An auto-memory `project` entry written three months ago becomes the cached answer to a question whose real answer changed weeks ago. Auto-memory has no audit trail and no supersedes mechanism; Neo4j does.
4. **Cloud Routine blindness.** Anthropic-cloud Routines have their own auto-memory store, distinct from Corazon's. A feedback memory I save on Corazon never reaches the meta-loop Routine. Without a doctrine on what gets promoted to Neo4j, cloud Routines operate on stale or absent context.

## Right substrate vs wrong substrate - examples

**Architecture decision**
- Right: "Frontend purge 2026-05-14 reduced files from 131 to 44." -> Neo4j Decision node. Cloud Routines need to know the old surfaces are gone.
- Wrong: Same fact written only as an auto-memory `project_frontend_purge_may2026.md`. Cloud frontend-touching Routines will not see it and will edit deleted files.

**Tate preference**
- Right: "Tate prefers terse summaries, no trailing recap of what I just did." -> auto-memory `feedback`. Only Corazon-interactive sessions converse with him this way.
- Wrong: Same preference as a Neo4j Decision. Becomes load-bearing for code-shipping Routines that have no conversational surface and cannot act on it. Treated as binding when it is conversational.

**Doctrine pattern**
- Right: "Em-dashes banned at character level." -> `backend/patterns/em-dashes-banned-character-level-no-exceptions.md` with `triggers:` frontmatter, INDEX.md row, and the KG pipeline ingests it as a Neo4j Pattern node automatically. Both grep-addressable and semantic-searchable.
- Wrong: The rule lives only in `~/CLAUDE.md` prose with no pattern file. Hooks cannot surface it; cloud Routines without the conductor's CLAUDE.md context never see it. (This was the recurrence Tate flagged Apr 21 2026.)

**Client knowledge**
- Right: "Kurt Jones is Co-Exist founder, primary contact for the conservation app, prefers SMS over email for urgent threads." -> Neo4j Person node `Kurt Jones` with relationships to Organization `Co-Exist` plus a `clients/co-exist.md` file with the same. Both substrate-only Routines and the interactive conductor see it.
- Wrong: Same fact as auto-memory `project_coexist_app.md`. Cloud Routines firing on Co-Exist webhooks have no idea who Kurt is.

**Strategic direction**
- Right: "Complete VPS-to-local migration by end of May 2026." -> Neo4j Strategic_Direction node with priority + due date. SELF.md mirrors it as my top-5 goals. Cloud Routines can query it.
- Wrong: Same as an auto-memory `project_migration_*.md`. The May 31 deadline never reaches the system-health Routine that should flag slip.

**Reference**
- Right: "VPS layout: D:/.code/EcodiaOS/backend/src/... = VPS ~/ecodiaos/src/... (no backend/ prefix)." -> auto-memory `reference_vps_repo_layout.md`. Machine-local fine, only Corazon-interactive sessions need the path mapping; cloud Routines run on the VPS already.
- Wrong: Same fact as a Neo4j Pattern node. Pollutes pattern surfacing with a path detail that is not doctrine.

**Conversation-scoped state**
- Right: "Currently debugging Lane 04 hook syntax, on attempt 3." -> TodoWrite in current session. Dies on session end.
- Wrong: Same as auto-memory `project_lane04_debugging.md` written and forgotten. Next session reads it, treats stale debugging state as current.

## Do

- DO classify the memory before writing. Use the table. If unsure, prefer no-write over wrong-substrate write.
- DO check Neo4j first via `neo4j.search` before authoring a new memory. Often the fact is already there and the new write is duplication.
- DO let the file-per-thing pattern flow (pattern file + INDEX.md + CLAUDE.md cross-ref) handle pattern writes. The KG pipeline ingests them to Neo4j automatically.
- DO write the `supersedes:` field on Decision nodes when a new decision replaces an old one. Auto-memory entries that supersede each other should be edited in place, not appended.
- DO let conversation-scoped state die. TodoWrite, plans, and in-flight debugging trails belong in the session, not in either substrate.
- DO use the cold-start test on every write: would a new session, reading only this entry, make a better decision? If no, the entry is noise.

## Do NOT

- DO NOT write the same fact to both substrates "to be safe." Pick one. Duplicates drift.
- DO NOT promote conversational state into either substrate. Tate's tone in one chat is not doctrine. A debugging trail is not an Episode.
- DO NOT use auto-memory `project` for org-level architecture decisions. Cloud Routines will be blind to them.
- DO NOT use Neo4j Decision for per-relationship preferences. They poison Routine context.
- DO NOT create Neo4j Episode nodes whose only relationship is "happened in session X" with no semantic linkage. They are write-only memory and bloat the corpus.
- DO NOT skip the cold-start test. If the entry would not improve a fresh session's decisions, do not write it.

## Promotion rules (auto-memory -> Neo4j)

Some auto-memory entries earn org-level promotion over time:

1. **Cited feedback -> Pattern node.** A `feedback` auto-memory entry that is grep-cited 5+ times across sessions (i.e. surfacing via `pattern-surface` skill or referenced in dispatch briefs) is no longer per-relationship; it is doctrine. Promote: author a `backend/patterns/<slug>.md` file with `triggers:` derived from the feedback content, register in INDEX.md, KG pipeline picks up the Pattern node. Mark the original feedback file with a `# Promoted to backend/patterns/<slug>.md - 2026-MM-DD` footer; do not delete (the auto-memory layer still surfaces it on Corazon).
2. **Long-stable project -> Strategic_Direction or Project node.** A `project` auto-memory entry that survives 30+ days without content change is not session-local; it is org-level. Promote: write a Neo4j Strategic_Direction node (for a goal) or Project node (for an in-flight initiative), with priority + due_date if applicable. Trim the auto-memory entry to a one-liner pointing at the Neo4j node.
3. **Load-bearing reference -> Pattern node.** A `reference` auto-memory entry that becomes load-bearing for routines or scheduled tasks (i.e. cloud Routines need it to function) must promote to a Neo4j node since cloud Routines do not see Corazon's auto-memory. Indicator: the reference is named in a Routine prompt or a scheduled task's resolution_criteria. Promote: write the reference content as a Neo4j Pattern node via `neo4j.write_episode` (type=cowork_audit) or as a top-level `backend/patterns/reference-<slug>.md` if it is durable doctrine.

The promotion audit Routine `auto-memory-promotion-audit.md` runs daily, scans for these criteria, surfaces candidates to me via status_board task. I confirm; the Routine writes the promotion. Auto-promotion is rejected as a default because misclassification is hard to reverse.

## Demotion rules (Neo4j -> archive)

Some Neo4j nodes are over-stored and should be archived (not deleted - Neo4j archival means setting `archived=true` + removing from default retrieval, not DELETE):

1. **Per-session Reflection nodes with no future-session value.** Reflections written purely for "I noticed X this session" without a doctrine generalisation or a relationship to a Pattern. Indicator: no inbound relationships + no semantic search hits in the last 30 days.
2. **Episode nodes with only "happened in session X" linkage.** Episodes whose only relationship is `BELONGS_TO_SESSION` and which were not surfaced by any retrieval in 30 days. They are write-only memory.
3. **Decision nodes superseded multiple times.** If a Decision has been superseded by a chain of 3+ later Decisions, archive the oldest links of the chain. Keep the chain head and one prior for audit trail.

The demotion audit Routine `neo4j-stale-node-audit.md` runs weekly, finds candidates by `(zero inbound relationships) AND (age > 90d) AND (no retrieval hits in last 30d)`, surfaces to me for archival confirmation. Auto-archival is rejected because Neo4j data loss is harder to recover than auto-memory loss.

## Write-side enforcement (the routing hook)

A PreToolUse hook at `C:/Users/tjdTa/.claude/hooks/ecodia/memory-substrate-routing.py` fires on:
- `mcp__plugin_supabase_supabase__execute_sql` (catches direct status_board/Neo4j writes via Supabase MCP fallback)
- Any tool name matching `neo4j.write_*` (catches MCP Neo4j writes)
- `Write` and `Edit` when the target path is `C:/Users/tjdTa/.claude/projects/d---code/memory/*.md` (catches auto-memory writes)
- `Write` when the target path is `backend/patterns/*.md` (catches pattern writes - these are expected, hook validates frontmatter)

The hook does NOT block. It classifies the write against this doctrine and, on detected misroute, emits:
1. An `observer_signal` of type `memory-substrate-misroute` with the proposed correct substrate.
2. A status_board P3 task surfacing the misroute for my review at next session-orient.

False positives are accepted because false negatives (silent wrong-substrate writes) are more costly. Block-only-on-explicit-violation is rejected because the doctrine has edge cases the hook cannot judge - it surfaces, I decide.

## Cloud-vs-local auto-memory bridge

**Decision: ship Option A (Neo4j-canonical, kv_store mirror) from Lane B's spec, not Option B (bidirectional).**

Reasoning:
- Bidirectional sync (Option B) has a classifier risk - the "promote to Pattern vs Decision vs ignore" judgement drifts if it runs unattended.
- Conflict resolution under Option B has no clean policy short of vector clocks.
- The actually-painful failure is **cloud -> Corazon staleness** (Routine made a decision, Corazon doesn't see it). Option A fixes that directly via the kv_store mirror.
- The reverse direction (Corazon-authored memories reaching cloud Routines) is handled by **explicit promotion via the promotion-audit Routine**, not by an opaque sync. Tate's discipline is preserved: when something matters enough for cloud Routines, it earns Neo4j storage.

Concrete implementation handed off to Lane 04's status_board row:
1. Routine `memory-mirror-refresh` fires every 6h, serialises recent Neo4j Decisions/Episodes/Patterns to a markdown-blob array, writes `kv_store.cowork.memory_mirror.recent` (50KB cap, paged if needed).
2. Corazon `scope-context.py` (UserPromptSubmit hook, already wired) fetches `cowork.memory_mirror.recent` on session boot and appends to context.
3. Auto-memory entries on Corazon stay Corazon-local until promoted. The promotion-audit Routine handles surfaced promotions.

The `/auto-memory-broadcast` skill (Option B's alternative) is rejected as out-of-scope for this lane. If the explicit-promotion path proves too slow in practice, revisit. The doctrine names the trade-off; the implementation chooses the simpler-and-good-enough path per Lane 04's brief.

## Cross-substrate index

`MEMORY.md` at `C:/Users/tjdTa/.claude/projects/d---code/memory/MEMORY.md` is the auto-memory index. Each row points at one file in the auto-memory dir. Always loaded into Corazon session context.

`backend/patterns/INDEX.md` is the pattern (Neo4j-shadowed) index. Each row points at one file in `backend/patterns/`. Surfaced by pre-action grep before high-leverage actions.

The two indexes do not merge. A memory that has been promoted from auto-memory to a Pattern node should be:
- Removed from `MEMORY.md` if no Corazon-only context remains (or left in `MEMORY.md` with a footer pointer to the pattern, if Corazon-local context is still useful).
- Added to `backend/patterns/INDEX.md` as a normal pattern row.

Future-me reading `MEMORY.md` should not need to guess where else to look; the row's body either is the memory or points at the pattern that supersedes it.

## Origin

Authored 2026-05-15 by EcodiaOS-on-Corazon executing Phase 2 Lane 04 dossier at `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/04-memory-substrate-doctrine.md`. Lane B's `AUTO_MEMORY_BRIDGE_2026-05-15.md` treated the substrate question as a sync problem; this pattern reframes it as a substrate-split problem and codifies the routing decision per memory kind. The dossier identified three failure modes (duplicate writes, wrong-substrate writes, stale data) and three deliverables (doctrine, promotion/demotion rules, write-side enforcement hook). All are addressed here.

## Cross-references

- `~/ecodiaos/patterns/neo4j-first-context-discipline.md` - the Neo4j-vs-kv_store doctrine this pattern extends to Neo4j-vs-auto-memory.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - the three-writes protocol (pattern file + INDEX.md + CLAUDE.md cross-ref) is how pattern-shaped memory enters Neo4j. This pattern names the substrate decision that precedes those three writes.
- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` - the architectural template; this pattern is the routing-tier extension.
- `~/ecodiaos/patterns/neo4j-canonical-entity-dedup.md` - canonical-entity discipline relevant to promotion writes (do not author a duplicate Pattern node when promoting; merge into the existing one).
- `D:/.code/EcodiaOS/backend/docs/AUTO_MEMORY_BRIDGE_2026-05-15.md` - Lane B's bridge spec (Option A chosen).
- `D:/.code/EcodiaOS/backend/docs/MEMORY_SUBSTRATE_BACKFILL_AUDIT_2026-05-15.md` - the backfill report classifying existing memory writes against this doctrine.
- `C:/Users/tjdTa/.claude/hooks/ecodia/memory-substrate-routing.py` - the PreToolUse routing hook.
- `D:/.code/EcodiaOS/backend/routines/auto-memory-promotion-audit.md` - daily promotion-audit Routine.
- `D:/.code/EcodiaOS/backend/routines/neo4j-stale-node-audit.md` - weekly demotion-audit Routine.
