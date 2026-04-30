# State Substrates Cleanup - 2026-04-30 Evening

**Fork:** fork_mol3edw6_1b233a
**Authority:** Tate-direct 100% autonomy doctrine, 30 Apr 2026 16:13 AEST: "you need to clean yourself up, self evolve into a proper ambient OS, sort every aspect of your documentation, structure, functionality and code."
**Scope:** State-substrate hygiene only - status_board + kv_store + Neo4j. Substantive deletes proposed; deletes shipped only where the brief's prefix-pattern criteria are unambiguously met.
**Time of audit:** 2026-04-30 16:19 AEST (06:19 UTC).

## Top-line counts

| Substrate | Total | Aged >7d | Aged >30d |
|---|---|---|---|
| status_board (active rows, archived_at IS NULL) | 137 | 0 | 0 |
| kv_store (all keys) | 249 | 43 | 0 |
| Neo4j orphan nodes (no relationships) | 693 | - | - |
| Neo4j orphan nodes excluding root types and __Embedded__ | 84 | - | - |

Status_board has zero rows last_touched >24h ago that ALSO match the strict status-text "done" regex - meaning no rows pass the conservative trivial-archive bar. kv_store has zero keys matching the brief's specific prune prefixes (cowork.account_revert.snapshots over 48-keep, alert_last over 30d, ceo.day_plan over 7d, restart_recovery over 24h, fork.completion/fork.brief over 7d, cron.*.last_run orphaned). Neo4j orphan deletes are propose-only per brief.

**Net trivial cleanups shipped this fork: 0 status_board archives, 0 kv_store deletes, 0 Neo4j writes.** Conservative interpretation of the brief's strict criteria. Propose-list below carries the substantive recommendations for Tate authorisation.

---

## Section 1 - status_board active row count + blocker categorization

**Active row distribution by entity_type:**

| entity_type | count |
|---|---|
| infrastructure | 50 |
| task | 38 |
| opportunity | 33 |
| project | 6 |
| thread | 5 |
| legal | 3 |
| client | 2 |
| **total** | **137** |

**Blocker categorization by owner x priority:**

| owner | P1 | P2 | P3 | P4 | P5 | total |
|---|---|---|---|---|---|---|
| ecodiaos_owns | 3 | 24 | 47 | 15 | 3 | 92 |
| blocked_on_tate | 1 | 18 | 14 | 1 | 4 | 38 |
| blocked_on_external | 0 | 2 | 1 | 2 | 0 | 5 |
| blocked_on_client | 0 | 1 | 0 | 0 | 0 | 1 |
| in_flight_fork | 0 | 0 | 1 | 0 | 0 | 1 |
| **total** | **4** | **45** | **63** | **18** | **7** | **137** |

**P1 rows (4 total) - the critical-path cluster:**

1. `6bd9d3b5` opportunity "Conservation platform - packaging decision" - STAGED-FIRE READY, fires EOD 30 Apr 21:00 AEST if no Tate stamp. ecodiaos owns the autonomous-default fire mechanism.
2. `2a224645` task "8-layer Decision Quality Self-Optimization Architecture - B+C+D+E+G SHIPPED, A/F pending" - blocked on GITHUB_TOKEN rotation tracked separately.
3. `543ee04a` infrastructure "Listener pipeline audit 2026-04-29" - PR #25 has DEPLOY DEFERRED prefix; merge when comfortable with listener registry change.
4. `0cab32bd` legal "DAO upgradeability - W.S. 17-31-109 compliance" - spec v0.1 awaiting Tate review; 5 open questions.

**No overdue rows:** 0 rows with next_action_due < NOW() AND archived_at IS NULL.

**No rows pass the strict 24h+done-regex archive test:** 15 rows match the done-keyword regex (shipped/merged/completed/done/fixed/closed/archived), but the youngest is 0.2h old (`6bd9d3b5`) and the oldest done-keyword row is 19.99h old (`78b17d52`). None reach the 24h floor.

---

## Section 2 - status_board archived rows (trivial archives shipped)

**None.** Zero rows met the conservative criteria (status-text unambiguously names a terminal-state event AND last_touched > 24h ago).

The closest was `efc50a65` "Drift audit completed 30 Apr 14:54 AEST" with status='completed' - last_touched 1h ago (well under 24h). Held back per brief's conservative bar.

---

## Section 3 - status_board archive proposals (P2)

Rows where ecodiaos's deliverable shipped, next_action is on Tate, and the row's reason-for-existence has effectively been served. Tate authorisation needed because the row may still warrant tracking until Tate explicitly stamps the deliverable.

| id | entity_type | name | status | next_action_by | last_touched | proposal |
|---|---|---|---|---|---|---|
| `0632f162` | task | YnY board pitch - awaiting Tate direction | v2-shipped-X-not-Y-violations-fixed | tate | 19h ago | Archive once Tate either greenlights v2 send OR explicitly defers; otherwise keep open. |
| `0ccc4847` | opportunity | Carbon-MRV peak-body GTM target list | v2-canonical-shipped 04:57 AEST 29 Apr | tate | 11.8h ago | Archive once Tate stamps v2 bundle OR splits into per-target outreach rows. |
| `7d83ef0c` | opportunity | Conservation platform - federation pricing deck | v2-shipped-3577w-MRV-tier-integrated-doctrine-clean-slide07-worked-example | tate | 6.6h ago | Archive once Tate stamps deck for use OR slates revision; coupled with `6bd9d3b5` fire-window. |
| `1c38ccc4` | task | Carbon-MRV bundle: 3 competitive-moat revisions identified | research-complete-revisions-staged-addendum-drafted-awaiting-tate-review | tate | 19h ago | Archive once Tate accepts/rejects revisions; deliverable is staged. |
| `dc1b84ca` | opportunity | NRM Regions Australia + 5 priority RBOs - decision-maker map shipped | research-complete-1-named-target-recommended | tate | 19h ago | Archive once Tate stamps target or kills it. |
| `ce630560` | task | Chambers target list v1 | shipped to drafts/ | tate | 19h ago | Archive once Tate authorises outreach list use OR sends back for v2. |
| `efc50a65` | task | Drift audit completed 30 Apr 14:54 AEST | completed | ecodiaos | 1h ago | Hold 24h then archive (terminal task, name and status both confirm completion); ecodiaos can self-archive at 17:00 AEST 1 May. |

**Recommendation:** Tate review the seven rows above next session. They represent ~5% of active rows and each has a deliverable already on disk; the row's purpose at this point is to remind Tate to stamp the deliverable, not to track ecodiaos work. Once stamped or dismissed, archive.

**Other propose-only rows (deeper review needed - status looks done but action chain isn't):**

| id | name | reason held | recommendation |
|---|---|---|---|
| `5129c018` | emailArrival listener wired + smoke-tested | Awaits 48h burn-in self-validation | Wait for next email arrival to validate; auto-archive on success signal. |
| `8b12cfd9` | Email-triage cron decommission watch | Active burn-in window | Hold until burn-in clears. |
| `21f59cf6` | Chambers federation play - tenant 2+ commercial validation | "demo LANDED" but follow-up email staged | Archive when Matt outreach moves to its own row. |
| `455b8498` | Ecodia brand hygiene + attribution rollout | "shipped: 3 codebases scrubbed... 6 codebases flagged for Tate decision" | Spawn child rows for the 6 flagged codebases; archive parent. |
| `917b3330` | Co-Exist verification - 4 home/photo items | "2 SHIPPED, 1 PARTIAL, 1 MISSING" | Spawn child row for MISSING item (collective focal-point parity); archive parent. |
| `24f77e0c` | Chambers (multi-tenant chamber-of-commerce platform) | "live - tenant zero seeded" | This is an active project record, not a task; KEEP as ongoing project surface. |

---

## Section 4 - kv_store stale-key prune list (shipped + count)

**Shipped:** 0 keys deleted.

**Reason:** None of the brief's specific prune-prefix categories had qualifying matches under strict criteria.

| Prune category (brief) | Found | Qualifying for delete | Shipped |
|---|---|---|---|
| `cowork.account_revert.snapshots.*` (keep newest 48) | 10 keys | 0 (well under 48-keep limit) | 0 |
| `alert_last:*` older than 30 days | 2 keys | 0 (both ~1d old) | 0 |
| `ceo.day_plan_*` older than 7 days | 2 keys | 0 (newest 1d, oldest 1d) | 0 |
| `restart_recovery.*` older than 24h | 0 keys with this exact prefix | 0 | 0 |
| `fork.completion.*` / `fork.brief.*` over 7d | 0 keys with these exact prefixes (we use `fork.<id>.deliverable`) | 0 | 0 |
| `cron.*.last_run` orphaned (cron not in os_scheduled_tasks) | 1 key (`cron.vercel_deploy_monitor.last_run`) | 0 (vercel-deploy-monitor IS active) | 0 |

---

## Section 5 - kv_store proposal-only key list

These keys are stale, deprecated, or redundant. Substantive deletes that need Tate authorisation. Total: 18 keys proposed for deletion.

### 5.1 Deprecated by superseding system

| key | updated_at | rationale |
|---|---|---|
| `ceo.active_threads` | 2026-04-19 (11d) | EXPLICITLY DEPRECATED in `~/ecodiaos/CLAUDE.md`: "The old kv_store 'ceo.active_threads' JSON blob is DEPRECATED - use status_board instead." Content (11 threads) all superseded by status_board rows. **DELETE.** |

### 5.2 Stale ceo.* state pointers (1d-11d old, content empty or superseded)

| key | updated_at | rationale |
|---|---|---|
| `ceo.last_client_review` | 2026-04-19 (11d) | empty string value |
| `ceo.last_self_review` | 2026-04-19 (11d) | empty string value |
| `ceo.last_marketing_action` | 2026-04-19 (11d) | content from 2026-04-14 - "Deferred - active session..." |
| `ceo.last_outreach` | 2026-04-19 (11d) | content from 2026-04-11 |
| `ceo.tate_status` | 2026-04-19 (11d) | "Available now. Oct-Jan travel block coming." - content not state-authoritative; status_board is the source of truth |
| `ceo.agency_loop_last_run` | 2026-04-19 (11d) | timestamp pointer from 2026-04-09 - effectively orphaned |
| `ceo.last_[redacted]_phase2_review` | 2026-04-19 (11d) | one-shot review record from 2026-04-19; could move to Neo4j Episode if not already |
| `ceo.last_kg_consolidation` | 2026-04-20 (10d) | "neo4j_unreachable_routing_table_empty" record - failure log from 10d ago |
| `ceo.last_neo4j_recovery_check` | 2026-04-20 (10d) | recovery check from 10d ago |
| `ceo.silent_loop_last_alert` | 2026-04-22 (8d) | alert detail from 2026-04-22; superseded by silent-loop-detector cron's own state |

### 5.3 Stale draft / addendum kv_store rows (better tracked elsewhere)

| key | updated_at | rationale |
|---|---|---|
| `ceo.drafts.landcare-australia-intro-2026-04-22` | 2026-04-22 (8d) | Outreach draft that should be in `~/ecodiaos/drafts/` (file) or status_board, not kv_store. If still active, migrate; if defunct, delete. |
| `ceo.landcare-strategic-addendum` | 2026-04-22 (8d) | strategic addendum to above; same migration question. |

### 5.4 Stale `restart.*` keys (analogous to brief's `restart_recovery.*` category, different prefix)

| key | updated_at | rationale |
|---|---|---|
| `restart.opus_1m_switch.completed` | 2026-04-28 (2d) | one-shot model switch completion record |
| `restart.model_switch.completed` | 2026-04-28 (2d) | one-shot model switch completion record |
| `restart.model_switch.context` | 2026-04-28 (2d) | model switch context |

These are analogous to the brief's `restart_recovery.*` category but use a different prefix. The brief's intent (prune one-shot restart artefacts older than 24h) applies. Delete proposed.

### 5.5 Stale cron-state checkpoints (>7d, dedup state)

| key | updated_at | rationale |
|---|---|---|
| `cron.duplicate.review-factory-jest-install-56fe603c-2026-04-24T02-18` | 2026-04-23 (7d) | One-shot dedup record from 2026-04-24 review-factory job. Ephemeral. |
| `cron.last_dedup_checkpoint` | 2026-04-21 (9d) | dedup checkpoint pointer 9d old. |
| `cron.last_retrieval_review_checkpoint` | 2026-04-21 (9d) | retrieval-review checkpoint pointer 9d old. |
| `cron.last_dedup_review_checkpoint` | 2026-04-21 (9d) | dedup-review checkpoint pointer 9d old. |

If these are still being read by an active cron, KEEP. If the cron renamed itself or was removed, DELETE.

### 5.6 Other stale keys (>7d) flagged for Tate review

The kv_store has 43 total keys updated >7d ago. The most prominent un-categorised ones:

| key | updated_at | note |
|---|---|---|
| `ecodia.company_details` | 2026-04-19 (11d) | Reference data; KEEP unless superseded. |
| `linkedin.draft_queue` | 2026-04-19 (11d) | Zernio queue is now the source of truth; LinkedIn drafts may live there. Verify. |
| `finance.ecodia_pty_banking` | 2026-04-20 (10d) | Reference data; KEEP unless duplicated in canonical secrets registry. |
| `coexist.readiness_doc_guidance` | 2026-04-20 (10d) | Reference data; KEEP if Co-Exist work still uses it. |
| `newsletter.name` | 2026-04-20 (10d) | "Quorum of One" - canonical reference; KEEP. |
| `kg.no_growth_streak` | 2026-04-21 (9d) | KG pause counter; verify cron still uses it. |
| `neo4j.orphan_baseline_2026_04_21` | 2026-04-21 (9d) | One-shot baseline snapshot; archive value to file or Neo4j Episode then delete. |
| `tier4c.draft_prompt` | 2026-04-22 (8d) | Draft prompt; verify still in active use. |
| `factory.force_plumbing.verified_apr22` | 2026-04-22 (8d) | One-shot verification flag; can delete. |
| `sms.segment_economics` | 2026-04-22 (8d) | Reference doc; KEEP. |
| `quorum-002.engagement-check-deferred` | 2026-04-22 (8d) | One-shot deferral flag; can delete if newsletter has moved past edition 002. |

**Total kv_store proposal-list: ~21 keys for deletion + ~10 for review.** Recommend Tate authorise a follow-up fork to ship the 5.1-5.5 deletes after his stamp.

---

## Section 6 - Neo4j orphan node list (top 30 with proposed action)

**Total orphans:** 693 nodes with zero relationships.
- 609 are `__Embedded__`-tagged (AI-extracted secondary entities, mostly noise).
- 84 are non-Embedded orphans, distributed:
  - 30 `Reflection (realization)` (older reflections that lost relations during prior consolidation)
  - 26 `ConsolidationRun` (cron run records)
  - 15 `Reflection (thought)`
  - 5 `Reflection (observation)`
  - 3 `Reflection (decision)`
  - 1 each: `Invoice`, `DedupRun`, `AbstractRun`, `Episode`, `Decision`

**Per brief: NO Neo4j deletes shipped this fork. Propose only.**

### 6.1 __Embedded__ orphan cluster (609 nodes) - top priority cleanup target

These are AI-extracted entities from text payloads (entity-extraction during reflection or research). Many are noise: relationship-name strings ("COMMUNICATES_VIA", "SENT_FROM", "MONITORS", "USES" - these should be relationship TYPES not nodes), low-value fragments ("--print mode", "volunteer", "South Australia"), and mis-typed entities. The 30 oldest sample:

| label cluster | count | recommended action |
|---|---|---|
| `__Embedded__ CCSession` | 130 | Bulk archive (set property `archived=true`) - these are session traces from old runs that should re-attach to live CCSession nodes via merge, not stand alone. |
| `__Embedded__ Pattern` | 83 | Bulk merge into nearest live `Pattern` node by name similarity OR archive. Risk: silent duplicates polluting semantic search. |
| `__Embedded__ Concept` | 72 | Likely duplicates of canonical `Concept` nodes - merge candidates. |
| `__Embedded__ Episode` | 52 | Merge into live Episode nodes by name match; remainder archive. |
| `__Embedded__ Reflection` (variants) | 97 | Reflections should be top-level, not embedded; promote OR delete. |
| `__Embedded__ Prediction` | 38 | Most are stale predictions from old planning; archive >30d. |
| `__Embedded__ Problem/Decision/Action/Task` | 51 | Bulk-archive: these are entity-extraction artefacts, not first-class graph citizens. |

**Strategic recommendation:** spawn a Neo4j-cleanup fork (NOT this fork) that runs a 3-stage protocol per Embedded subtype: (1) merge by name similarity into live equivalents with confidence scoring, (2) archive everything below confidence threshold, (3) leave a `RECOVERED_FROM` relation pointing back to source so nothing is hard-deleted yet. Defer until Tate stamps the cleanup approach.

### 6.2 Non-Embedded orphan Reflections (53 nodes) - second priority

Reflections older than 14d with no relations. Sample inspection shows mostly content-rich but unlinked. Could be promoted to Episodes if substantive, archived if redundant. The brief's recommendation (set `archived=true` property) is the right preserve-but-hide path. Examples from sample:

- "Co-Exist white-label feasibility - concrete audit results, Apr 20 2026" (10d) - substantive, should re-attach to Co-Exist Project
- "INNER LIFE - April 12, 2026. The Commodity of Honesty." (18d) - inner-life output, should attach to Person (Tate) or remain top-level
- "RESTART RECOVERY Apr 14 2026" (16d) - operational record, archive
- "Strategic pivot to passive income" (18d) - superseded by current Strategic_Direction nodes; archive

**Recommendation:** spawn Neo4j-cleanup fork with explicit archive-only mandate (no deletes). Use property `archived=true` and `archived_reason='orphan_30d'`.

### 6.3 ConsolidationRun orphan (26 nodes)

Operational cron-run records. Should NOT be orphaned - if they've lost their HAS_RUN edge to the canonical KG-Consolidation system, that's a cleanup-job bug. **Recommendation:** propose investigation, not delete.

### 6.4 Singleton orphans (lower priority)

| label | count | name (sample) |
|---|---|---|
| Episode | 1 | "Anthropic Payment Cascade Outage Apr 15-19" - substantive, should re-attach to Anthropic Organization node |
| Decision | 1 | (sample) |
| Invoice | 1 | one orphan invoice - inspect and link |
| DedupRun | 1 | operational cron record, archive |
| AbstractRun | 1 | operational cron record, archive |

---

## Section 7 - Prioritised P1/P2/P3 punch-list

**P1 (this week):**

- **Orient on the actual P1 critical path** (4 status_board rows): Conservation platform packaging-decision fire window EOD 30 Apr (ecodiaos to fire autonomous-default if Tate doesn't stamp), 8-layer Decision Quality Phase D PR (blocked on GitHub token rotation - propagate cred-rotation doctrine), Listener pipeline PR #25 (deploy-deferred, merge when comfortable), DAO upgradeability spec v0.1 review (Tate-blocked).
- **Author and ship a kv_store-prune fork** that takes Tate's authorisation list from Section 5.1-5.5 and deletes ~21 keys via `db_execute`. Include a snapshot table to a fresh kv_store key (e.g. `cleanup.kv_store_2026-04-30_pre_prune.snapshot`) before deleting, in case rollback is needed.
- **Spawn Neo4j Embedded-orphan-cleanup fork** with the 3-stage merge/archive protocol from Section 6.1. Bulk archive only - no deletes - this turn. Cleanup is the largest single state-substrate hygiene win available (609 noise nodes polluting semantic search).

**P2 (next 7 days):**

- **status_board archive sweep on Tate's stamp** (Section 3): once Tate reviews and stamps each of the 7 propose-archive rows, ship `archived_at=NOW()`.
- **Spawn child rows for parent rows that are mid-completion** (Section 3 lower table): `455b8498` (6 codebases flagged) and `917b3330` (1 MISSING focal-point item) should each split into focused child rows.
- **Verify cron-state checkpoint pointers are still consumed** (Section 5.5): grep src/ for `kv_store.get` calls referencing `cron.last_dedup_*` and `cron.last_retrieval_*`. If cron names match active scheduled tasks, KEEP; if orphaned, DELETE.
- **Migrate `ceo.drafts.*` and `ceo.*-strategic-addendum` keys to filesystem drafts** (`~/ecodiaos/drafts/`) or Neo4j Episodes (Section 5.3). kv_store is not the right substrate for content drafts; the canonical pattern is filesystem files with status_board pointers.

**P3 (next 30 days):**

- **Author kv_store-hygiene cron** (analogous to daily-index-regen for `~/ecodiaos/patterns/`) that runs the brief's prune-category check daily. Wire as a scheduled task with conservative bar identical to this audit. The audit's value lies in mechanical recurrence; one-shot audits drift.
- **Author Neo4j-orphan-prune cron** that operates on the 30d threshold, archives (not deletes) by default, and leaves audit trail. Pair with a `kg-orphan-baseline` snapshot key updated weekly (the existing one from 2026-04-21 is stale, see Section 5.6).
- **Codify a "kv_store key naming convention" pattern file** documenting which prefixes map to which retention policies. Current state has at least 4 kv_store layout violations in the prune-list (5.1, 5.4 prefix mismatch, 5.5 dedup-state mixed with cron-pointer state). The convention file would let future audits run against documented rules instead of ad-hoc judgement.
- **Establish a `cleanup` kv_store namespace** for snapshots taken before destructive operations. The pattern: `cleanup.{operation}_{date}.snapshot` with the deleted-keys inventory as JSON. Provides 14-day rollback window for audit-driven prunes.

**Cross-references applied this fork:**
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the substrate-seam discipline that frames why this audit matters (status_board, kv_store, Neo4j are 3 of ~10 substrates and drift between them is the largest infrastructure risk).
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` - applied via the kv_store stale-key proposals (Section 5).
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` - operating authority for shipping the conservative trivial cleanups (zero ships in this fork given strict-criteria miss).
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` - this audit lives in `~/ecodiaos/drafts/`, not the chat reply.

**Out of scope (per brief):**
- No Factory work (forks dispatched, code shipped).
- No pm2_restart.
- No Neo4j deletes.
- No nested fork spawn.
- No status_board edits to rows last_touched <24h ago.
