---
triggers: knowledge-architecture, knowledge-lookup, knowledge-route, retrieval, front-door, claim-bind, discriminating-probe, narrated-success, cold-start-orientation, dispatch-fact-gate, claude-md-core, always-loaded-budget, context-rot, substrate-parity, where-does-knowledge-live, how-do-i-find, single-front-door
category: doctrine
facet: memory
status: active
---

# Knowledge is retrieved through one front door, and completion claims bind to a discriminating probe

EcodiaOS stores knowledge across one categorised corpus and retrieves it through a single deterministic front door. Completion claims gate on evidence that the right path was checked. The always-loaded surface stays small and the rest is pulled on demand.

**Why:** On 2026-06-09 a 17-agent forensic swarm found 64 failure episodes in one day (25 high-severity, 17 autonomous). The corpus was never the problem. Retrieval TIMING and SUBSTRATE PARITY were. Knowledge sat on disk and never reached the model at the load-bearing moment; three of the worst failures were narrated successes that verified against the WRONG surface (superuser SQL bypassing RLS returning "0 failures"; a logged-out tab after a dropped token-inject; a UI shipped with no screenshot ever taken); cold starts re-derived fictions; a ~26K-token always-loaded CLAUDE.md taxed every step (context rot hits Claude 4 too).

## How to apply

- **Find anything with `knowledge.lookup` FIRST.** The `ecodia-knowledge` MCP connector, or `node /Users/ecodia/.code/ecodiaos/backend/knowledge-index/lookup.js "<need>"`. Local, offline, sub-50ms over ~1150 docs. L1 exact-trigger, L2 facet browse, L3 FTS5 keyword. Read the top hits and every recipe before acting. A no-hit against a fresh index means the knowledge does not exist yet - do the work, then author it. Never fall back to Tate for "I remember we decided X". Skill: `knowledge-route` (the READ twin of `memory-route`).
- **Bind completion claims to a discriminating probe.** A narrated success is not a real success. The M1 `knowledge-claim-bind` PreToolUse hook BLOCKS a `status_board_upsert` to complete/shipped/resolved or a `neo4j_write_decision/episode` asserting success unless the payload names the RIGHT-path probe: `set local role authenticated` for a DB/RLS claim (superuser SQL does not count), an auth-state assertion captured BEFORE the screenshot for an app fix, a CDP shot vs the deployed url for a shipped UI, a Vercel READY id for a deploy. Bypass token `claim-ok` for the genuine case where the probe lives elsewhere. Routine board hygiene (archived/superseded/stale) is never gated.
- **Orient from live truth at session start.** The M2 `knowledge-sessionstart` hook injects the host-canonical fact, the substrate map, and LIVE scheduler counts from Postgres (NOT the paused-filtered MCP `schedule_list`) at every boot. Do not re-derive these.
- **Carry the facts in a worker brief.** The M3 `dispatch-fact-gate` hook hard-blocks a `cowork.dispatch_worker` brief that says ship/fix with no verify gate (the autonomous catastrophe), and warns on an unnamed bearer/cred path or a vague "see patterns/" instead of an exact recipe. Bypass token `brief-ok`.
- **Keep the always-loaded core small.** `backend/CLAUDE.md` is the ~2.4K-token core (0th-class reflexes + host/substrate/connector maps + hard-stops + the lookup-first protocol). Everything else is pull-on-demand at `backend/docs/operational-manual.md` and the indexed corpus. The `claude-md-core-budget` hook warns over 12K tokens. Do not inline new detail into the core; author a pattern or a doc and reach it via `knowledge.lookup`.
- **Substrate parity by single home, not mirror.** Auto-memory folds into the knowledge index `memory` category so cloud sessions see it. Live facts (bearers, schema enums, scheduler state) are queried live, never cloned as prose that drifts.

## Substrate

- Engine: `backend/knowledge-index/` (schema.sql, indexer.js, lookup.js, mcp-server.js, db.js). `index.sqlite` is gitignored and rebuilt. Cloned from `backend/codebase-manifest/`.
- Freshness: the `knowledge-index-refresh` PostToolUse hook re-indexes incrementally on every corpus `.md` edit. Force a rebuild: `node backend/knowledge-index/indexer.js [--full]`.
- Categories: doctrine, recipes, reference, memory, identity, secrets, workbench. Facets: release, gui, autonomy, memory, infra, comms, finance, clients, voice-brand, scheduler, meta.
- Hooks (all in `~/.claude/hooks/ecodia/`): knowledge-claim-bind.py, knowledge-sessionstart.py, dispatch-fact-gate.py, knowledge-index-refresh.py, claude-md-core-budget.py.

## Anti-patterns

- Grepping `patterns/` or asking Tate before calling `knowledge.lookup`. The front door exists; use it.
- Marking work complete with "tested" / "0 failures" without naming the probe that proves the RIGHT path. That is the narrated-success failure the M1 gate exists to catch.
- Inlining a new operational detail into `backend/CLAUDE.md`. The core is a per-turn tax; put detail in a pull-on-demand doc.
- Trusting the MCP `schedule_list` for scheduler health (it hides paused rows). Query Postgres `os_scheduled_tasks` direct.

Origin: 2026-06-09, the bad-coherence-day overhaul. Plan + forensics: `/Users/ecodia/.claude/plans/most-of-those-are-prancy-cascade.md`. Pinnacle design grounded in a 17-agent forensic + research + adversarial swarm.
