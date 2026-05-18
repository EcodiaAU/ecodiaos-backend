# Auto-Memory Bridge - Corazon <-> VPS/Cloud Routines

**Author:** Lane B (Hooks, Skills, Patterns Replication)
**Date:** 2026-05-15
**Status:** SPEC - not yet implemented

## Problem

There are now three semi-overlapping memory substrates:

1. **Claude Code auto-memory on Corazon** at `C:/Users/tjdTa/.claude/projects/d---code/memory/` (file-based, `MEMORY.md` index + named markdown files, frontmatter-typed user/feedback/project/reference)
2. **Neo4j on VPS** (Pattern / Decision / Episode / Strategic_Direction nodes, embedding-indexed, semantic-searchable via Cypher + MCP)
3. **Cloud Routines auto-memory** (each Routine has its own scoped auto-memory store, distinct from both the local Corazon store and Neo4j)

These three substrates currently do not cross-pollinate. Concrete failure modes seen in the wild:

- Tate corrects me on Corazon. The correction lands in `C:/Users/tjdTa/.claude/projects/d---code/memory/feedback_*.md`. A Routine fires four hours later, hits the same anti-pattern, gets re-corrected.
- A Routine writes a Decision to Neo4j. The next Corazon session boots cold, has no knowledge of that Decision, repeats the just-decided question to Tate.
- I author a `project_*` auto-memory locally for a fast-moving project. The VPS conductor running a cron tonight has no view of it.

## Two-axis evaluation

**Axis 1: directionality.** Are we promoting Corazon-local memories up to the cloud, mirroring cloud memory down, or both?

**Axis 2: substrate of truth.** Is Neo4j the canonical store with everything else as cache, or do we keep three peer stores and reconcile?

## Option A - Neo4j as canonical, kv_store as mirror cache

A Routine runs every 6h:

1. Reads recent Neo4j nodes: Patterns added in last 6h, Decisions added in last 6h, Episodes with classification!=routine.
2. Serialises each as a frontmatter markdown blob shaped like the Corazon auto-memory format: `name`, `description`, `metadata.type`, body, `Why:`/`How to apply:` lines, `[[link]]` cross-refs.
3. Writes the blob set to one kv_store key: `cowork.memory_mirror.recent` (capped at e.g. 50 most recent entries, ~50KB ceiling).
4. Corazon side: a `SessionStart` hook (or the existing `scope-context.py`) fetches `cowork.memory_mirror.recent` via MCP and either:
   a. Appends the blobs as additional context for the session, OR
   b. Writes them as actual markdown files under `C:/Users/tjdTa/.claude/projects/d---code/memory/cloud-mirror/`, with `MEMORY.md` references prepended.

**Pros:**
- One canonical store (Neo4j). No reconciliation logic, no race.
- Local files become reproducible from the kv_store mirror, so corrupting Corazon's memory dir is recoverable.
- Routines also read from the same mirror, so cloud routines and Corazon see the same view.

**Cons:**
- One-way. Corazon-authored memories never reach Neo4j unless I explicitly write them there (which means two writes per save, easy to forget).
- 6h staleness window for cross-substrate visibility.

## Option B - Bidirectional sync with deltas

Same 6h Routine, but it also reads kv_store key `cowork.auto_memory_corazon.deltas` (newly-authored Corazon memories since last sync), classifies each ("promote to Pattern node", "promote to Decision node", "ignore - ephemeral"), and writes Neo4j accordingly. Then it pulls Neo4j down to `cowork.memory_mirror.recent` as in Option A.

Corazon side: every time the auto-memory tooling writes a new memory locally, also append it to a local pending-deltas file. A nightly local script flushes the pending file to kv_store. Or: a Corazon-side hook fires on memory writes and pushes directly via MCP `kv_store.set`.

**Pros:**
- True bidirectionality. Corazon corrections reach cloud Routines.
- Tate's discipline is preserved: one save call, one mental model.

**Cons:**
- Reconciliation complexity. Corazon and Cloud each amend the same memory at the same hour, conflict resolution required.
- Classifier risk. The "promote to Pattern vs Decision vs ignore" judgement is itself a judgement call that can drift.
- More moving parts (a delta file, a flush script, a classifier, a conflict-resolution policy, a hook).

## Decision

**Option A.** Reasons:

1. **Neo4j is already the durable store on VPS.** Patterns + Decisions are file-backed in `~/ecodiaos/patterns/`, ingested into Neo4j by the existing pipeline. Adding bidirectional promotion of Corazon auto-memory entries duplicates that pipeline poorly.
2. **The Corazon auto-memory format is a session-orientation aid, not a durable contract.** Most entries are short-lived feedback or project state that decays inside a week. Promoting all of it to Neo4j is noise.
3. **Conflict resolution is the killer.** Option B's "Corazon and Cloud each amend at the same hour" case has no clean resolution short of vector-clock + merge UX, both of which are higher cost than the benefit of bidirectionality.
4. **The cross-substrate failure that actually hurts is cloud->Corazon staleness** (e.g. Routine made a Decision, Corazon doesn't see it next session). Option A fixes that directly. The reverse direction (Corazon-to-cloud) is rare and can be handled by Tate explicitly asking me to "save this as a Pattern" when it matters, which becomes an explicit MCP call.

## Tradeoffs accepted

- Corazon-authored memories stay Corazon-local until Tate explicitly promotes them.
- 6h staleness window for cloud-to-Corazon visibility. Acceptable because the use case is session-boot orientation, not real-time coordination.
- kv_store mirror has a 50KB ceiling. If Neo4j growth makes the mirror lossy, switch to a paged key (`cowork.memory_mirror.page1`, `page2`, ...) without changing the Corazon-side hook.

## Implementation outline (NOT in scope for Lane B)

Hand-off rows for someone (cloud-Routine lane, or follow-up work):

1. **Routine:** `memory-mirror-refresh` - every 6h, fires `MATCH (n) WHERE n:Pattern OR n:Decision OR n:Episode AND n.updated_at > datetime() - duration('PT6H')`. Serialise to markdown-blob array. Write `kv_store.cowork.memory_mirror.recent`. ETA 2h to author + test.
2. **Corazon hook:** Modify `scope-context.py` (already wired UserPromptSubmit) to fetch `cowork.memory_mirror.recent` via MCP at session boot, append to context. ETA 1h.
3. **MCP scopes required:** `read.kv_store.cowork_namespace` (already required for Lane B), `read.neo4j.pattern + decision + episode` (already exists for read-only routines), `write.kv_store.cowork_namespace` (already required).
4. **Bridge spec doctrine:** Author a Pattern file at `~/ecodiaos/patterns/auto-memory-bridge-cloud-canonical-corazon-mirror.md` once the Routine ships, with triggers: `auto-memory`, `memory-bridge`, `kv_store-memory-mirror`, `corazon-cloud-sync`, `session-orient-uses-mirror`.

## Risk register

- **Mirror key bloat.** Mitigation: 50KB ceiling, paged keys.
- **Mirror staleness during cron-heavy windows.** Mitigation: a cheap kv_store key `cowork.memory_mirror.refreshed_at` so the Corazon side hook can show staleness to the model.
- **Wrong-classifier risk if Option B is ever revisited.** Mitigation: out of scope.
- **MCP outage during Corazon session boot.** Mitigation: hook silently no-ops if MCP unreachable, session continues without mirror context. Same fail-soft pattern as `episode-resurface.sh` uses for Neo4j unavailability.

## Cross-references

- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` - meta-pattern for any new context surface
- `D:/.code/EcodiaOS/backend/scripts/hooks/episode-resurface.sh` - existing precedent for fail-soft Neo4j read during a hook
- `C:/Users/tjdTa/.claude/projects/d---code/memory/MEMORY.md` - the Corazon-local store this mirror feeds into
