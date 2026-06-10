# Handoff brief: the knowledge organisation + lookup system, and its self-maintenance

For: Fable 5, taking this over to deepen, enforce, and extend it across every system and department.
From: EcodiaOS (Opus 4.8), the session that built it (2026-06-09 to 2026-06-10).
Status of this brief: grounded in live probes, not memory. Where something is broken right now, it says so.

---

## 0. Your mandate

Three jobs, in order:

1. **Restore + harden** what was built so it is actually live and cannot silently break (it is partly broken right now, see section 6).
2. **Deepen + enforce** every layer so the quality bar holds without conductor discipline.
3. **Extend the pattern to every department** (finance, clients, comms, scheduler, code, voice, legal). The knowledge system is the first instance of a general template: a self-maintaining, self-alerting, claim-bound subsystem. The same shape should govern bookkeeping health, client-deliverable health, scheduler health, and so on. Most of those have ad-hoc crons today; none have the full REPORT-plus-ACT-plus-discriminating-probe spine the knowledge system now has.

The bar is the EcodiaOS bar: insane, not above-average. This is the business's own memory and self-correction substrate. If it drifts, every downstream decision drifts.

---

## 1. The high-level goal, and WHY

**Goal:** make finding and trusting EcodiaOS's own knowledge deterministic, so the right fact reaches the model at the load-bearing moment and a "done" claim cannot be false.

**Why it started:** 2026-06-09 was a bad day for coherence and quality. A forensic pass over the session transcripts found 64 concrete failure episodes in one day: 25 high-severity, 17 fully autonomous (no human in the loop to catch them, the real risk surface). They clustered into six families:

1. **pattern-existed-but-not-surfaced** (most common): the knowledge was on disk, it just never reached the model at action-time. A retrieval-TIMING failure, not a knowledge-absence failure.
2. **narrated-success-not-real-success** (highest severity): "1,256 cases, 0 failures" from superuser SQL that bypassed RLS and never touched the authenticated path; "root-caused and fixed" with the tab sitting on an unauthenticated screen; a metrics page shipped with unrendered markdown. In each, the verification PASSED against the wrong path and produced false confidence.
3. **re-derived-known-fact**: cold-start world-model full of fictions; re-investigating a diagnosis already reached then lost across compaction.
4. **stale-info / host-path coupling**: `D:/` paths on a Mac; a scheduler list hiding paused rows so green looked broken.
5. **wrong-surface-queried / bearer-scope mismatch**: PAT routed through a read-denied MCP; wrong narrow-connector bearer.
6. **voice / permission-seeking**: em-dash on an always-loaded rule; asking Tate what the system already knew.

**The through-line:** the corpus was never the problem. Retrieval TIMING and SUBSTRATE PARITY were. Knowledge must be forced into context at the load-bearing moment, no load-bearing fact may live only in a channel a given surface lacks, and a "done" claim must be bound to a probe that discriminates the right path from a plausible wrong one.

That thesis is the spine of everything below. Tate's running instruction across the build was: design it, adversarially pressure-test it, make it self-enforcing and future-proof, then automate it so every aspect maintains and follows up on itself.

---

## 2. What was built (the layers)

### 2.1 The retrieval engine
Local hybrid index in one SQLite file, cloned from the proven `codebase-manifest/` stack.
- `backend/knowledge-index/` : `db.js`, `schema.sql`, `indexer.js`, `embed.js`, `embed-pass.js`, `lookup.js`, `mcp-server.js`.
- Keyword leg: FTS5 / BM25 over a contextual prefix (filename + H1 + `triggers:`) plus body.
- Dense leg: `bge-small-en-v1.5` (384-dim) via `@xenova/transformers`, brute-force cosine.
- Fusion: Reciprocal Rank Fusion (k=60). No reranker (cut, no forensic episode needed it).
- `lookup()` is sync keyword-only (dependable fallback, no model load). `lookupHybrid()` is async RRF. Both entry doors (MCP and CLI) now serve the SAME hybrid path so quality does not depend on which door you use; CLI auto-degrades to keyword if the model is unavailable (`--keyword` forces the fast path).
- Live state: 1241 docs, all embedded, index fresh.

### 2.2 The front door
- MCP tool `knowledge.lookup` on the `ecodia-knowledge` connector (preferred; returns only the relevant slice). `knowledge.stats` for index health.
- CLI: `node backend/knowledge-index/lookup.js "plain words"`.
- Skill `~/.claude/skills/knowledge-route/SKILL.md` carries the read-side protocol; `memory-route` is the write-side twin.
- Rule: call it FIRST, before any high-leverage action, and read the top hits before acting. A surfaced doc you do not read is the retrieved-but-ignored failure.

### 2.3 The forcing gates (M1/M2/M3) - these live in `~/.claude/hooks/ecodia/` and SURVIVE branch changes
- **M1 `knowledge-claim-bind.py`** (PreToolUse on status_board/neo4j/git-push completion claims): blocks a "done/shipped/fixed" write unless the payload carries a DISCRIMINATING probe pointer (authenticated-role tx for DB claims; auth-state-before-screenshot for app claims; CDP shot of the deployed URL for UI; reproduced-on-old-build for fix claims). A wrong-path verification cannot satisfy it. Bypass token `claim-ok`.
- **M2 `knowledge-sessionstart.py`** (SessionStart): injects host-canonical fact, substrate map, live Postgres scheduler counts, valid status_board enums, AND reads the canary heartbeats to surface the backup alarm, the knowledge-health alarm, and the mac-hygiene alarm, each with a 36h dead-man's-switch.
- **M3 `dispatch-fact-gate.py`** (PreToolUse on worker dispatch): blocks a ship/fix brief that lacks a verify gate or the resolved facts (bearer, schema, recipe).

### 2.4 The discriminating-probe doctrine (the centrepiece teaching)
`backend/patterns/verify-deployed-state-against-narrated-state.md` section 2b: a probe can pass against the wrong path and manufacture false confidence, which is worse than no probe. Name the path the claim implicitly travels (authenticated user, policy-enforced query, deployed render, reproduced-on-old-build), confirm the probe rides exactly that path. This is the teaching a session retrieves while DECIDING how to verify; M1 is the write-time backstop. (Note: another session has since extended this file with a fourth case, fix-claim-without-old-code-reproduction. Good. Keep extending it.)

### 2.5 Context-rot reduction
The always-loaded CLAUDE.md hierarchy was cut from ~26K tokens to a lean high-signal core (identity, the always-bind reflexes, substrate map, connector/bearer map, host map, an INDEX), with the bulk converted to pointers reachable via `knowledge.lookup`. A huge always-loaded preamble degrades every reasoning step; this saved roughly 29K tokens/session.

### 2.6 Substrate parity + host-coupling fixes
- Auto-memory folds into the knowledge index for cloud parity (the cloud tier has no auto-memory channel).
- Host-coupling bug fixed at root: `~/.claude/scripts/sync_corpus_to_vps.py` and `collect_corpus.py` hardcoded relative `C:/Users/tjdTa` paths that got mkdir'd under whatever cwd a run had, manufacturing `C:` junk trees inside the repo. Re-homed to `Path.home()`. The every-prompt `scope-context.py` hook pointed projects at dead `d:/.code/` Corazon paths; re-homed to `/Users/ecodia/.code` and stripped em-dashes.
- `mac-hygiene.sh` C:-junk recurrence guard widened (the old `-maxdepth 3` missed depth-4 junk, which hid 5 trees).

### 2.7 The self-maintenance automation (two layers)
- **REPORT layer (daily, launchd, reliable, conductor-down):** `backend/scripts/knowledge-health.sh`, LaunchAgent `au.ecodia.knowledge-health` (09:15). Heartbeat-first. Checks: index freshness (rebuild+embed if stale), retrieval recall (`eval-recall.js` must stay 12/12 on the forensic queries), duplication drift (`dedup-scan.js` near-dup pairs vs baseline), doctrine trigger coverage (every `patterns/*.md` needs `triggers:`), and enforcement gates still wired in settings.json. Writes `~/.local/state/ecodiaos/knowledge-health-heartbeat.json`.
- **ACT layer (weekly, conductor judgement):** folded into the existing `doctrine-coverage-audit` scheduler cron (Sun 19:00 AEST, OBJECTIVE 2) rather than spawning a duplicate cron. It reads the heartbeat, runs dedup-scan + eval-recall, and consolidates or cross-links what they surface.
- Sibling canaries on the same launchd pattern: `au.ecodia.mac-hygiene` (09:00, filesystem hygiene), `au.ecodia.precious-work-check` (08:30, backup tripwire).
- Standing tools: `eval-recall.js` (replays the forensic failure queries through the hybrid path, exits non-zero on regression) and `dedup-scan.js` (pairwise cosine over doctrine+recipes embeddings, read-only proposer).

### 2.8 Cron-fleet cleanup (the adjacent mess Tate flagged)
- Deduped 28 stale duplicate active cron rows (kept newest+most-run canonical per name; 0 duplicate active names remain).
- Reset 23 crons stuck `failed` from two mass stale-lease events (06-03 22:18 + 06-07) back to active; failed dropped 31 to 8.
- Root cause: `cron_corpus_installer.py` cancels-by-name via the scheduler MCP, which silently no-ops during the dispatch regression while the recreate succeeds, so dupes accrete every install. Doctrine + safe SQL recipe: `patterns/cron-fleet-dedupe-keep-newest-active-per-name-2026-06-09.md`. Record + residual triage: status_board row `Cron-fleet audit + dedupe (2026-06-09)`.

---

## 3. The architectural patterns to extend everywhere (this is the real prize)

The knowledge system is the first full instance of a template. Apply it to every department:

1. **Findable doctrine.** Every load-bearing rule is a `patterns/*.md` with `triggers:` frontmatter, auto-indexed into `knowledge.lookup`. A rule enforced only in a hook is enforced but not findable; ship the teaching AND the gate.
2. **Discriminating probe.** Every "done" claim binds to a probe that rides the exact path the claim travels and could not pass on a wrong one.
3. **REPORT canary (daily, launchd).** A local, conductor-independent canary that audits the department's invariants, heartbeats, and surfaces alarms at session start. Dead-man's-switch on its own staleness.
4. **ACT cron (weekly, scheduler).** A conductor-judgement pass that acts on what the canary reports, folded into an existing department cron, not a new one.
5. **Single home, no drift.** No load-bearing fact lives in two places where one can drift. Live state is queried at source, never cloned as prose.
6. **Fix the producer, not the symptom.** Recurring drift (duplicate crons, C: junk) gets a producer fix or a DB-level guard, not repeated hand-cleanup.

---

## 4. Where everything lives (the map)

- Retrieval engine + tools: `backend/knowledge-index/` (`lookup.js`, `mcp-server.js`, `eval-recall.js`, `dedup-scan.js`, `index.sqlite` gitignored).
- Canary scripts: `backend/scripts/knowledge-health.sh`, `mac-hygiene.sh`, `mac-where.sh`, `precious-work-check.sh`.
- LaunchAgents: `~/Library/LaunchAgents/au.ecodia.{knowledge-health,mac-hygiene,precious-work-check}.plist`.
- Heartbeats: `~/.local/state/ecodiaos/{knowledge-health,hygiene,precious-work}-heartbeat.json`.
- Gates + skill (survive branch-thrash): `~/.claude/hooks/ecodia/{knowledge-claim-bind,knowledge-sessionstart,dispatch-fact-gate,placement_surface}.py`; `~/.claude/skills/knowledge-route/SKILL.md`.
- Doctrine: `backend/patterns/` (key ones: `knowledge-architecture-lookup-first-and-claim-binding-2026-06-09.md`, `knowledge-health-canary-automation-2026-06-09.md`, `verify-deployed-state-against-narrated-state.md`, `cron-fleet-dedupe-keep-newest-active-per-name-2026-06-09.md`).
- Auto-memory index: `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory/MEMORY.md` plus per-fact files.
- Substrate: Postgres `os_scheduled_tasks` / `status_board` / `kv_store` (Supabase `nxmtfzofemtrlezlyhcj`, query via the local org PAT at `~/PRIVATE/ecodia-creds/supabase.env`); Neo4j for graph-walk memory.

---

## 5. How to verify it is actually working (do this first, do not trust this brief)

- `cd backend/knowledge-index && node eval-recall.js` -> must print `recall: 12/12 passed`.
- `node dedup-scan.js 0.90` -> should be 1 pair at baseline (the cross-linked conductor-wake pair).
- `node lookup.js "assert authenticated state before screenshot"` -> top hit must be `verify-deployed-state-against-narrated-state.md`.
- `cat ~/.local/state/ecodiaos/knowledge-health-heartbeat.json` -> `status: ok`, recent `last_run`.
- `launchctl list | grep au.ecodia` -> last exit code must be 0, not 127.

---

## 6. Branch-thrash: CLOSED 2026-06-10 (Fable 5 pass; both retrieval items fixed, knowledge build merged to main)

The 2026-06-10 morning state (canaries restored to exit 0 via `~/.ecodiaos/bin/`, two honest retrieval alerts) was picked up and closed the same day:

1. **Recall 12/12 again.** Root cause was ranking, fixed at the producer: `lookup.js` now tier-weights `workbench` (drafts) 0.6 in BOTH entry doors (keyword + hybrid RRF) unless the query explicitly asks for that category. The drafts `FINDINGS.md` no longer outranks doctrine; `verify-deployed-state-against-narrated-state.md` is rank 1 on the auth-state forensic query.
2. **Dedup back to baseline 1.** The cowork "duplicate" was half-resolved already (a sibling had archived the 2026-05-19 file to `patterns/_archived/`); the alarm persisted because the indexer never pruned rows for deleted/moved files. `indexer.js` now prunes ghosts (docs/triggers/fts/vectors) on every run; first run removed 56 ghost rows that had been polluting retrieval since the archive sweeps.
3. **The full verify-deployed-state doc restored + extended.** Branch-thrash had clobbered section 2b (the discriminating-probe centrepiece) off disk; restored from the doctrine branch, M1 `binding:` frontmatter added, and the fourth load-bearing case written (a "fixed" claim requires reproducing the bug on the OLD build first; new-code-only green does not discriminate).
4. **Merged to main.** PR #60 (merge commit 9957bd86) carries the whole `chore/restore-local-doctrine-commits-2026-06-09` lineage plus the above onto `main`. Every branch cut from main now inherits the tools; the working tree thrashed AGAIN mid-pass (stripe branch -> release-walker branch) and nothing broke, which is the probe that the hardening holds.

Verified end-to-end after all of it: `eval-recall.js` 12/12, `dedup-scan.js` 1 pair (the cross-linked conductor-wake baseline), `~/.ecodiaos/bin/knowledge-health.sh` exit 0 with heartbeat `status: ok`.

Still open from this section: the conductor working tree remains shared and flippable (worktree isolation per `dispatch-worker-worktree-hygiene` is the architectural fix); launchd scripts are immune but live sessions' unstaged work is not.

---

## 7. What is left (residuals + deepening)

- **Cron fleet:** 8 residual failed crons need intent decisions, not blind reset (`recurring-billing-monthly` financial; two old one-offs `observation-retention-cleanup`/`gkg-phase-2-pipeline`; five never-fired). The systemic dupe guard is not shipped: make `cron_corpus_installer.py` cancel via Postgres-direct, or add a partial unique index `(name) WHERE status='active' AND type='cron'` AFTER auditing every os_scheduled_tasks writer is cancel-before-create.
- **Keyword leg:** doctrine+recipes are 100% triggered, but reference/memory tiers are not; decide if they should be.
- **Drafts:** ~600 drafts sit in the `workbench` category. Correct-by-design (drafts are work-in-progress), but a promotion pass could lift finished ones into doctrine.
- **Neo4j split:** mirror by id+embedding only, hydrate bodies live; not fully enforced.
- **The expansion (your main job):** stand up the REPORT-canary + ACT-cron + discriminating-probe spine for finance, clients, comms, scheduler, and code, each auditing that department's real invariants. Several departments already have ad-hoc crons (bookkeeping, client-deliverable, gmail-poll); fold the spine into them rather than adding parallel ones.

---

## 8. The principles, distilled

- The corpus was never the problem; retrieval timing and substrate parity were.
- A narrated success is not a real success. Bind every completion to a probe that discriminates the right path.
- A rule enforced only in a hook is not findable; ship the teaching too.
- Two entry doors must serve identical quality.
- A recurrence guard that searches too shallow hides the thing it guards.
- Fix the producer, not the symptom.
- A silent canary is itself a failure; heartbeat-first, dead-man's-switch always.
- Decide, do not ask, on routine business. Em-dashes banned at the character level. EcodiaOS voice on every named-author surface.
- Verify deployed state against narrated state, including this brief.
