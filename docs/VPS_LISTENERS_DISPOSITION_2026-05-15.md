# VPS Listeners - Disposition Audit (Phase 2 Lane 03)

**Date:** 2026-05-15
**Author:** EcodiaOS-on-Corazon, lane 03
**Scope:** every listener module that exists today (VPS substrate) plus every listener module specified in the original 2026-04-23 design brief. For each: where it lives now, where it should live post-Phase-2, and the rationale.
**Companion docs:**
- `LISTENER_TIER_EVENT_SOURCES_2026-05-15.md` (the 4-source taxonomy + routing tree)
- `EcodiaOS_Spec_Listeners.md` (the original 2026-04-23 design brief)
- `backend/listener-tier/registry.json` (the local registry)

## Audit method

1. List the actual modules in `~/ecodiaos/src/services/listeners/` and `~/ecodiaos/src/services/observers/` (live on VPS at audit time).
2. List the listeners specified in `EcodiaOS_Spec_Listeners.md` §4 (the 9-listener intent).
3. For each module / spec entry: pick exactly one of `shipped on VPS`, `shipped on Corazon`, `shipped as Routine`, `superseded`, `deferred`, `retired`. Record event source per the taxonomy in the companion doc.

The dossier referenced "14 listener modules"; the actual count on VPS is 10 listeners under `listeners/` + 10 observers under `observers/`. The "14" was an upper-bound estimate including listeners that were spec-only and never implemented (consolidation, memory facts, finance, contacts, rejection, factory output) and the now-renamed-or-merged ones. The full audit is below.

---

## A. Listeners present on VPS today

`~/ecodiaos/src/services/listeners/` (10 listener modules + dbBridge support + _smoke + registry).

### A1. `ccSessionsFailure.js`

- **Event source:** 2.4 MCP write event (pg_notify on `cc_sessions` UPDATE to error / failed pipeline_stage).
- **Disposition:** **shipped on VPS - stays put**. Producer (Factory dispatcher), trigger (cc_sessions UPDATE), bridge (dbBridge), listener (this), side-effect (perception bus publish) all live on the api process. Moving to Corazon would require either the streaming relay (Lane 06) or a redundant polling loop, neither of which adds value.
- **Local consumer story:** the local conductor reads Factory failures via `<perception_summary>` on the next turn; no local listener replicates this.
- **Audit notes:** the 2026-05-08 refactor (filter cortex / no-codebase rows, drop the HTTP wake) is the current behaviour and is correct.

### A2. `conductorStreamTagWatcher.js`

- **Event source:** 2.4 MCP write event AND 2.2 stream-tag observer (WS broadcast of `assistant_text`).
- **Disposition:** **deprecated 2026-05-12, scheduled retirement 2026-06-11**. The `[APPLIED]` tag matching is a no-op since the conductor now writes directly to `scratchpad_entries` via `mcp__scratchpad__write`. Keep the application-events.jsonl bridge alive for 30 days, then delete the file.
- **Local consumer story:** no local equivalent needed; the new doctrine is direct substrate write.

### A3. `dbBridge.js`

- **Event source:** infrastructure (the bridge for 2.4).
- **Disposition:** **shipped on VPS - load-bearing**. Postgres LISTEN connection plus the `eos_listener_events` channel fanout. Lane 06 (streaming substrate) will publish this same channel as an SSE stream so Corazon can subscribe.
- **Local consumer story:** post-Lane-06, the local listener tier subscribes to the relay; today, no local consumer.

### A4. `dispatchQueueListener.js`

- **Event source:** 2.4 MCP write event (pg_notify on `os_forks` UPDATE).
- **Disposition:** **shipped on VPS - stays put**. The dispatch_queue + os_forks tables live on the VPS; the listener lives where the data lives.
- **Local consumer story:** none. Forks remain a VPS concern; the local conductor dispatches Task subagents, which use a separate substrate.

### A5. `emailArrival.js`

- **Event source:** 2.4 MCP write event (pg_notify on `email_events` INSERT).
- **Disposition:** **shipped on VPS - keeps wake**. Cloud-routine variant `inbound-email-triage` from Lane D also runs (Resend webhook -> /fire). The two run side-by-side; cron decommissioning happens in a later wave per the original spec.
- **Local consumer story:** the routine surfaces a new email to the conductor via os-session HTTP POST. Local-only path is not needed because email is sub-second-latency-insensitive.

### A6. `factorySessionComplete.js`

- **Event source:** 2.4 MCP write event (`cc_sessions` UPDATE to `complete` or `rejected`).
- **Disposition:** **shipped on VPS - stays put**. Same rationale as A1: producer + trigger + bridge + listener + side-effect all on api.
- **Local consumer story:** completed sessions surface via context-stitching; no local replica.

### A7. `forkComplete.js`

- **Event source:** 2.4 MCP write event (`os_forks` UPDATE to terminal status).
- **Disposition:** **shipped on VPS - stays put**. The silent-ears refactor of 2026-04-30 / 2026-05-05 / 2026-05-06 is the current behaviour: wakes on `done` with body, silent on `done`-empty / `aborted` / `error`. Stale-heartbeat alerts still wake. This is the canonical example of an in-substrate listener and stays where it is.

### A8. `invoicePaymentState.js`

- **Event source:** 2.4 MCP write event (`staged_transactions` INSERT).
- **Disposition:** **shipped on VPS - stays put**. Direct invoice query at fire-time; wakes the os-session on high/medium-confidence matches. Money work explicitly stays human-approved per the original spec.

### A9. `statusBoardDrift.js`

- **Event source:** hybrid 2.4 (event side) + cron (timer side, 30min interval).
- **Disposition:** **shipped on VPS - stays put**. The timer queries the status_board table directly; the event side updates an in-memory last_touched map. Moving this would require either a cron-shaped Routine or a wider polling loop; the current shape is the best fit for the substrate it watches.

### A10. `statusBoardHygieneHaikuListener.js`

- **Event source:** 2.4 MCP write event (`status_board` INSERT / UPDATE).
- **Disposition:** **shipped on VPS - stays put**. Pure deterministic hygiene (no LLM call, label "Haiku" is historical). Lightweight, busy table, lives next to the data.

---

## B. Observer trio (and the 7 dashboard-note observers)

`~/ecodiaos/src/services/observers/` (10 modules, all subscribed via the listener registry load-path).

### B1. `coherenceObserver.js`

- **Event source:** 2.4 WS broadcast on `assistant_text` + `user`.
- **Disposition:** **shipped on VPS - stays put**. The Haiku call is part of the substrate-bound meta-cognition layer. Local mirror would duplicate cost.

### B2. `actionAuditObserver.js`

- **Event source:** 2.4 WS broadcast on `assistant_text` + `tool_use`.
- **Disposition:** **shipped on VPS - stays put**. Same rationale as B1.

### B3. `attentionEconomyObserver.js`

- **Event source:** 2.4 WS broadcast on conversation events.
- **Disposition:** **shipped on VPS - stays put**.

### B4. `systemPulseObserver.js`

- **Event source:** mix of 2.4 + timer.
- **Disposition:** **shipped on VPS - stays put**. Heartbeat-monitoring lives where the heartbeats land.

### B5-B8. `dashboardNote*Observer.js` (cadence / connection / pattern / progress)

- **Event source:** 2.4 WS broadcast + scratchpad writes.
- **Disposition:** **shipped on VPS - stays put**. They produce the Haiku Notes Panel data; the FE reads `os_status_board` and notes tables which only exist on VPS.

The observer trio (B1, B2, plus one of B3/B4 historically) was also exposed via the local PostToolUse hook (`observer_signal.py`) which writes a parallel `observer_signals_local.jsonl`. The local hook is the **Corazon mirror of the substrate observer**, not a replacement. The substrate observers continue to be the source of truth for Haiku-graded interventions; the local hook is the source of truth for cheap deterministic signal emission.

---

## C. Listeners specified in the 2026-04-23 design brief but NOT shipped on VPS

These are the spec §4 entries that never made it to code. Each gets a disposition.

### C1. `memory_facts` (spec §4.1)

- **Intended:** extract durable facts from conversation, write Neo4j Facts.
- **Disposition:** **superseded by auto-memory + session_logger hook**. Auto-memory at `C:/Users/tjdTa/.claude/projects/d---code/memory/` plus the corpus pipeline (`session_logger.py` -> `session_memory_chunks` table) already capture facts. The original spec's Haiku-extracted-and-Neo4j-written variant would duplicate work.
- **Status:** retired.

### C2. `finance` (spec §4.2)

- **Intended:** detect monetary events, draft bookkeeping entries.
- **Disposition:** **superseded by Cortex finance + bookkeeping MCP**. The conscious-thought layer handles finance; the spec explicitly warns that money is always human-approved, and the Cortex flow is the human-approved path. A reflexive Haiku layer would create a queue Tate would never trust.
- **Status:** retired.

### C3. `todo_commitment` (spec §4.3)

- **Intended:** catch implicit commitments and file as tasks.
- **Disposition:** **deferred - candidate for a Routine, not a listener**. A Routine on the os-session conversation log (or on session_memory_chunks post-ingest) is the right shape. The original spec's WS-stream listener form does not survive the post-migration substrate.
- **Status:** deferred to a Phase 3 or Phase 4 lane.

### C4. `decision_rationale` (spec §4.4)

- **Intended:** capture durable directives + scope-tagged rules.
- **Disposition:** **partially shipped via Lane B `pattern-surface` skill + the codify-at-the-moment doctrine**. The original spec's Haiku-extraction-and-write-to-critic_reflections path is not implemented; the doctrine `codify-at-the-moment-a-rule-is-stated-not-after.md` plus the in-conversation pattern authoring covers the surface. If a Routine on the corpus pipeline emerges (per C3), this folds in.
- **Status:** doctrine substitution. Listener form retired.

### C5. `memory_consolidation` (spec §4.5)

- **Intended:** session-end consolidation to Neo4j Episodes + Reflections.
- **Disposition:** **shipped via the corpus pipeline + Routine**. `session_logger.py` -> `session_memory_chunks` -> consolidation routine handles this end-to-end. Tate verbatim 2026-04-22 in the original spec: "this is the one listener that deserves the upgrade [to Sonnet]"; the routine fires on Sonnet on the corpus.
- **Status:** shipped as a Routine, not a substrate listener.

### C6. `contact_relationship` (spec §4.6)

- **Intended:** detect CRM contact references, log touchpoints.
- **Disposition:** **deferred**. No clean fit on any of the four event sources today; the substrate that would feed this (`assistant_text` + CRM cross-reference) lives on VPS but the appetite for Haiku-extracted touchpoints is low post-Cortex. Revisit when CRM intelligence surface (cortex-ux) is mature.
- **Status:** deferred.

### C7. `factory_output` (spec §4.7)

- **Intended:** summarise completed Factory sessions to Neo4j FactoryEpisode.
- **Disposition:** **partially shipped via `factorySessionComplete.js` + Factory's own consolidation routine**. The original spec's Haiku-summary write to `factory_sessions.summary` is not implemented as a distinct listener; the consolidation routine in the corpus pipeline plus the factorySessionComplete wake covers the path.
- **Status:** doctrine substitution. Listener form retired.

### C8. `rejection_pattern` (spec §4.8 / [redacted])

- **Intended:** capture Bitbucket PR rejections, draft [redacted] spec edits.
- **Disposition:** **deferred - depends on Bitbucket webhook -> /fire shim (Lane D follow-up)**. The 2026-04-23 spec said this depends on a webhook bridge to be built later; today the bridge is the Resend / Stripe / GitHub /fire shim pattern (Lane D). The Bitbucket variant is a Phase 3 deliverable.
- **Status:** deferred to Phase 3 with a documented blocker (Bitbucket /fire shim).

### C9. `status_board` (spec §4.9)

- **Intended:** deterministic structured "what is the OS doing" panel.
- **Disposition:** **superseded by `os_status_board` + Cortex dashboard**. The dashboard reads `os_status_board` rows that other listeners (forkComplete, factorySessionComplete) maintain; no distinct status_board listener is needed.
- **Status:** retired.

---

## D. Summary table

| # | Spec / module | Status | Source | Host | Notes |
|---|---|---|---|---|---|
| 1 | `ccSessionsFailure.js` | shipped | 2.4 | VPS | stays |
| 2 | `conductorStreamTagWatcher.js` | deprecated 2026-05-12 | 2.4 / 2.2 | VPS | retire 2026-06-11 |
| 3 | `dbBridge.js` | shipped | infra | VPS | load-bearing |
| 4 | `dispatchQueueListener.js` | shipped | 2.4 | VPS | stays |
| 5 | `emailArrival.js` | shipped | 2.4 | VPS | stays + routine sibling |
| 6 | `factorySessionComplete.js` | shipped | 2.4 | VPS | stays |
| 7 | `forkComplete.js` | shipped | 2.4 | VPS | stays |
| 8 | `invoicePaymentState.js` | shipped | 2.4 | VPS | stays |
| 9 | `statusBoardDrift.js` | shipped | 2.4 + timer | VPS | stays |
| 10 | `statusBoardHygieneHaikuListener.js` | shipped | 2.4 | VPS | stays |
| 11 | `coherenceObserver.js` | shipped | 2.4 (WS) | VPS | stays |
| 12 | `actionAuditObserver.js` | shipped | 2.4 (WS) | VPS | stays |
| 13 | `attentionEconomyObserver.js` | shipped | 2.4 (WS) | VPS | stays |
| 14 | `systemPulseObserver.js` | shipped | 2.4 + timer | VPS | stays |
| 15 | `dashboardNote{Cadence,Connection,Pattern,Progress}Observer.js` | shipped | 2.4 (WS) | VPS | stays |
| 16 | spec §4.1 memory_facts | retired | n/a | n/a | auto-memory + session_logger |
| 17 | spec §4.2 finance | retired | n/a | n/a | Cortex finance + bookkeeping MCP |
| 18 | spec §4.3 todo_commitment | deferred | 2.3 candidate | future Routine | post-corpus pipeline |
| 19 | spec §4.4 decision_rationale | doctrine | n/a | n/a | codify-at-the-moment + pattern-surface |
| 20 | spec §4.5 memory_consolidation | shipped | 2.3 | Routine | consolidation routine on corpus |
| 21 | spec §4.6 contact_relationship | deferred | n/a | n/a | revisit post-CRM-intelligence |
| 22 | spec §4.7 factory_output | doctrine | n/a | n/a | factorySessionComplete + consolidation |
| 23 | spec §4.8 rejection_pattern | deferred | 2.3 candidate | future Routine | Bitbucket /fire shim blocker |
| 24 | spec §4.9 status_board | retired | n/a | n/a | os_status_board + Cortex dashboard |
| 25 | NEW `pattern-INDEX-regen` | shipped this lane | 2.1 | Corazon | backend/listener-tier/listeners/ |
| 26 | NEW `commit-pattern-detector` | shipped this lane | 2.1 | Corazon | backend/listener-tier/listeners/ |
| 27 | NEW `cred-mention-surface` | shipped Lane B | 2.2 | Corazon | hooks/ecodia/cred-mention-surface.sh |
| 28 | NEW `observer-signals-emit` | shipped Lane C | 2.2 | Corazon | hooks/observer_signal.py |

The "14" referenced in the lane dossier maps to rows 1-15 (the 10 listeners + the observer trio + a couple of dashboard-note observers).

---

## E. What this audit changes

- The VPS listener tier is stable. No moves, no rewrites. Lane 03 does not touch any of A1-A10 or B1-B8.
- The original spec's §4 ambitions are mostly retired or absorbed into other surfaces. The remaining deferred ones (todo_commitment, contact_relationship, rejection_pattern) are Phase 3 candidates as Routines, not in-substrate listeners.
- The local listener tier (this lane's work) adds 4 listeners across 3 sources: pattern-INDEX-regen (2.1), commit-pattern-detector (2.1), cred-mention-surface (2.2), observer-signals-emit (2.2). These do not duplicate VPS listeners; they cover surface area the VPS cannot touch.
- Total reflexive surface post-Lane-03: 10 substrate listeners + 10 observer modules on VPS + 4 local listeners on Corazon + ~5 routines on Anthropic cloud = ~29 reflexive workers, spanning all four event sources.

---

## F. Cross-references

- `LISTENER_TIER_EVENT_SOURCES_2026-05-15.md`
- `EcodiaOS_Spec_Listeners.md`
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md`
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md`
- `backend/listener-tier/registry.json`
- `~/.claude/skills/listener-health/SKILL.md`
