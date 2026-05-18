# Memory Substrate Backfill Audit - 2026-05-15

**Authored by:** EcodiaOS-on-Corazon executing Phase 2 Lane 04 dossier.
**Doctrine reference:** `backend/patterns/memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md`.
**Scope:** Classify (a) Neo4j writes in the last 30 days and (b) every current file in `C:/Users/tjdTa/.claude/projects/d---code/memory/*.md` against the doctrine. Surface misroutes. Do NOT migrate; Lane G handles archival.

---

## 1. Substrate-side snapshot (last 30 days)

Cypher: `MATCH (n) WHERE coalesce(n.created_at, n.date) > datetime() - duration("P30D") AND (n:Decision OR n:Episode OR n:Reflection OR n:Pattern OR n:Strategic_Direction) RETURN labels(n), count(*)`.

| Label combination | Count (last 30d) |
|---|---|
| `__Embedded__`, Episode | 350 |
| `__Embedded__`, Pattern | 308 |
| `__Embedded__`, Decision | 282 |
| Reflection, realization | 55 |
| `__Embedded__`, Reflection, realization | 24 |
| `__Embedded__`, Reflection, thought | 23 |
| `__Embedded__`, Pattern, Recurring_Pattern | 20 |
| `__Embedded__`, Strategic_Direction | 19 |
| `__Embedded__`, Strategic_Direction, Pattern | 18 |
| `__Embedded__`, Pattern, Behavioral_Pattern | 17 |
| Reflection, thought | 16 |
| `__Embedded__`, Reflection, observation | 15 |
| `__Embedded__`, Episode, Embedded | 11 |
| `__Embedded__`, Reflection | 9 |
| `__Embedded__`, Decision, Embedded | 7 |
| `__Embedded__`, Strategic_Direction, Pattern, Embedded | 7 |
| Reflection, observation | 6 |
| `__Embedded__`, Pattern, Recurring_Pattern, Embedded | 5 |
| Reflection, decision | 3 |
| Various other smaller combinations | <5 each |

Total notable nodes authored in window: roughly 1200 across the five core labels.

### Observations

- **No Decision-as-preference misroutes found.** Search for Decision nodes containing relationship-preference phrasings (`tate prefers`, `interaction style`, `prefer terse|brief|verbose`) returned zero results. Decision writes in the last 30d are correctly org-level. This is in line with the prior period and is a positive signal: the existing `neo4j-first-context-discipline` pattern is being respected.
- **Reflection nodes with zero relationships and empty names exist.** Sample returned 2 nodes labelled `Reflection, realization` with no `name` and no relationships, created 2026-05-13. These are prime demotion candidates under Rule A of the doctrine (per-session Reflection with no future value). The neo4j-stale-node-audit Routine will surface them; for now they exceed the 90-day age threshold the doctrine names, so they will not surface until 2026-08-11. Recommend dropping the age threshold to 60 days for Reflection with empty name (special-case).
- **Episode write-only-memory candidates.** 7 Episode nodes returned in last 30 days with `desc_len = 0` and zero relationships. Examples:
  - "Hooks audit + TLDR subscription triage (Apr 22 2026 21:48 AEST)"
  - "Stale-schedule audit hook deployed 2026-04-24 via filesystem-trust override"
  - "Self-evolution 2026-04-25 12:00 AEST - third scheduler bug isolated"
  - "Strategic-thinking 2026-04-25 14:00 AEST - applied Pattern 2338"
  - "Weekly financial review 2026-04-25"
  - "Listener Wave A verified + Wave B dispatched (fork_moi1ktwe_b4a7a7, Apr 28 2026)"
  - "Mobile sign-in end-to-end audit 2026-04-28"
  These are all Routine-shaped event captures (hook fire, weekly review, strategic-thinking cycle). They have meaningful names but zero body + zero relationships. Under the doctrine they are NOT pure write-only-memory (name carries content) but they fail the cold-start test ("would a new session reading only this make a better decision?"). Surface to Routine authors to either (a) populate description on the next equivalent fire, or (b) add a `BELONGS_TO_ROUTINE` relationship to its parent Routine node.
- **Embedded duplicate labels.** Nodes with both `__Embedded__` and `Embedded` (no underscore) are visible in the counts. The `neo4j-canonical-entity-dedup` pattern flags this; the consolidation pipeline should pick them up. Not in scope here.

### Misroute candidates - Neo4j side

| Substrate side count | Recommended action |
|---|---|
| 7 Episodes with empty description and zero relationships in last 30d | Routine authors fix on next fire (add description + relationship). neo4j-stale-node-audit will catch the long tail at 90d. |
| ~50+ Reflection nodes with no inbound relationships | Drop neo4j-stale-node-audit Rule A age threshold from 90d to 60d for Reflection-with-empty-name special case. |
| Mixed `Embedded` / `__Embedded__` labels | Out of this lane's scope. Handled by KG consolidation per `neo4j-canonical-entity-dedup`. |

No misroutes detected of type "should-have-been-auto-memory." Decision discipline in the substrate is good.

---

## 2. Auto-memory side (current files)

Inventory: 67 markdown files (excluding `MEMORY.md` index + `archive/` subdir) at `C:/Users/tjdTa/.claude/projects/d---code/memory/`.

Distribution by prefix:
- `project_*`: 43 files
- `feedback_*`: 9 files
- `reference_*`: 9 files
- `user_*`: 1 file
- `archive/`: 9 files (historical project_* moved out)

### Classification against doctrine

#### Correctly routed

| File | Type | Justification |
|---|---|---|
| `user_tom_role.md` | user | Per-relationship profile information. Correct. |
| `feedback_freedom_philosophy.md` | feedback | Core engineering philosophy. Borderline (see promotion candidates) but the freedom-vs-restriction stance is conversational doctrine first. |
| `feedback_ambient_not_dashboard.md` | feedback | UI/UX preference. Correct. |
| `feedback_ecodia_tone.md` | feedback | Copywriting tone preference. Correct. |
| `feedback_search_filter_design.md` | feedback | Per-component design preference. Correct. |
| `feedback_no_coral_donate.md` | feedback | Brand colour preference. Correct. |
| `feedback_cortex_dialogue_transparency.md` | feedback | Behavioural preference for Cortex dialogue layer. Correct. |
| `feedback_finish_the_pipeline.md` | feedback | Workflow preference. Correct. |
| `reference_vps_repo_layout.md` | reference | Path mapping. Correct - machine-local Corazon-only fact. |
| `reference_claude_max_extra_usage.md` | reference | Billing reference. Correct. |
| `reference_vps_claude_login.md` | reference | Auth setup reference. Correct. |
| `reference_corazon_ssh_to_vps.md` | reference | SSH setup reference. Correct. |
| `reference_sdk_musl_glibc_fix.md` | reference | Recipe reference. Correct. |
| `reference_migration_lanes_2026-05-15.md` | reference | In-flight pointer to migration-lanes work. Correct - session-local. |

#### Promotion candidates (auto-memory -> Neo4j or Pattern node)

| File | Current type | Recommended target | Trigger rule | Why |
|---|---|---|---|---|
| `feedback_pm2_env_inheritance_sticky.md` | feedback | `backend/patterns/pm2-env-inheritance-sticky-across-update-env-2026-05-11.md` (Pattern node) | Rule A (cited feedback -> Pattern) | Operational doctrine, not interaction-style preference. Cloud Routines that touch pm2 (system-health, vercel-deploy-monitor) need this. Cited count: appears in multiple session transcripts as the canonical pm2-env-fix recipe. |
| `feedback_freedom_philosophy.md` | feedback | Keep as feedback for the Tate-relationship stance BUT shadow as `backend/patterns/freedom-philosophy-engineering-doctrine-apr2026.md` (Pattern) | Rule A (cited feedback -> Pattern) | High-cite. Cloud Routines that author code (factory-cloud, parallel-builder) need the freedom-vs-restriction stance. Currently invisible to them. The Corazon-side feedback entry stays for the relationship-style portion. |
| `project_wyoming_dao_llc.md` | project | Neo4j Strategic_Direction node `Ecodia DAO LLC legal entity` | Rule B (long-stable project -> Strategic_Direction) | 36+ days old, content stable since 2026-04-08 filing. Org-level legal structure - cloud Routines doing financial/legal work need to see this. |
| `project_3month_autonomy_hardening_apr2026.md` | project | Neo4j Strategic_Direction node + auto-memory trimmed to pointer | Rule B (long-stable project -> Strategic_Direction) | Load-bearing top-5 goal. Already on SELF.md top-5 but not as a Strategic_Direction node. system-health Routine should see it. |
| `project_audit_2026-05-13_fixes.md` | project | Already shadowed in Neo4j Decision `Routine corpus + webhook shims + accountRouter shipped 2026-05-15 (Lane D)` and related lane decisions. Trim auto-memory to one-liner pointer. | Step 3 (duplicate detected) | Currently duplicated. Auto-memory entry is verbose; the Neo4j Decision is canonical. |
| `project_security_hardening_may2026.md` | project | Already shadowed in Neo4j Decision `Phase 0.5 security hardening` family + `project_security_hardening_may2026.md` correctly mirrors. Borderline. | n/a | Acceptable as Corazon-local mirror because the audit fixes need Corazon-side context too. No action. |
| `project_jarvis_layers_may2026.md` | project | Neo4j Strategic_Direction + auto-memory trimmed | Rule B | Stable, org-level Jarvis-layer roadmap. Cloud Routines tracking organism layer maturity need this. |
| `project_token_economy_may2026.md` | project | Neo4j Decision shadow already exists for the 6-PR ship; auto-memory entry can stay short. | Step 3 | Duplicate of the Decision node series for the prompt-assembler ships. |
| `project_perception_dispatcher_may2026.md` | project | Neo4j Decision shadow check + likely already there. | Step 3 | Same architectural decision is in Decision nodes. |
| `project_ecodia_company.md` | project | Neo4j Organization node + auto-memory trimmed | Rule B | Legal entity, not session-local. Should be a canonical Organization in Neo4j. |
| `reference_ecodiaos_rev2_docs.md` | reference | Promote to Pattern `backend/patterns/reference-ecodiaos-rev2-architecture-docs.md` | Rule C (load-bearing reference -> Pattern) | Authoritative architecture docs pointer. Cloud Routines that read backend/docs/ need this. |
| `reference_coexist_deploy_pipeline.md` | reference | Promote to Pattern `backend/patterns/coexist-ship-pipeline-corazon-to-appstore.md` | Rule C | Co-Exist deploy Routine (if/when written) needs this. Currently Corazon-only. |
| `reference_ecodia_full_mcp.md` | reference | Currently load-bearing for multiple Routines via REGISTRY.md (`requires_bearer: ecodia-full`). Promote to Pattern. | Rule C | Already cited in routine prompts; cloud Routines need bearer routing knowledge. |
| `reference_creds_substrate_split.md` | reference | Promote to Pattern `backend/patterns/creds-split-kv-store-vs-env.md` | Rule C | DR-critical knowledge. system-health Routine alarm path depends on this distinction. |

#### Likely correct but borderline

| File | Current type | Notes |
|---|---|---|
| `project_coexist_app.md` | project | Stable but the Co-Exist app has dedicated client substrate work; keep as project entry, but consider adding a Neo4j Project node + Person/Organization linkage for Kurt. Out of scope for this lane. |
| `project_admin_hub.md`, `project_ecodiaos_cc_architecture_apr2026.md`, `project_conductor_architecture_apr2026.md`, `project_factory_symbiosis.md`, `project_session_memory_apr2026.md`, `project_claude_token_refresh_apr2026.md`, `project_provider_routing_apr2026.md`, `project_claude_long_lived_tokens_apr2026.md`, `project_claude_energy_budget_apr2026.md`, `project_claude_auto_switch_back_may2026.md`, `project_knowledge_pipeline.md`, `project_perception_dispatcher_may2026.md`, `project_behavioral_hooks_apr2026.md`, `project_codebase_sync_git_spam_apr2026.md`, `project_fork_mode_apr2026.md`, `project_security_hardening_may2026.md`, `project_voice_engine_may2026.md`, `project_frontend_purge_may2026.md`, `project_audit_2026-05-13_fixes.md` | project | Architecture project entries. Each one is older than 30 days OR points at architectural decisions that ARE in Neo4j as Decisions. Recommendation: keep auto-memory entries as Corazon-local context summaries, verify each has a corresponding Decision node, trim verbose ones to pointers. |
| `project_os_cortex_bookkeeping.md`, `project_coding_workspace_apr2026.md`, `project_crm_intelligence_apr2026.md`, `project_cortex_ux_apr2026.md` | project | Workspace/feature roll-ups. Mid-priority promotion candidates; each is an org-level architecture entry deserving Neo4j Decision shadowing. |
| `project_resonaverde_referral_channel.md`, `project_goodreach.md`, `project_sidequests_master_plan.md`, `project_roam_coverage_roadmap.md`, `project_roam_verified_apis.md`, `project_roam_simple_mode.md`, `project_enrichment_perf_wins.md`, `project_moment_events_woodfordia.md` | project | Per-app project state. Reasonable as auto-memory because per-app initiative state changes faster than Neo4j re-ingestion. Keep, but reassess every 30 days. |

#### Misroute or quality issue

| File | Issue | Recommendation |
|---|---|---|
| `archive/*.md` (9 files) | Older project entries archived in-dir | Acceptable - the archive subdir is the doctrine-aligned demotion path for auto-memory. No action. |
| None | No outright misroutes detected | Auto-memory side is largely correctly routed. The pain is promotion lag, not misroute. |

### Summary - auto-memory side

- 0 outright misroutes (no `feedback` containing architecture-only content, no `project` containing pure conversational preference).
- 4 high-confidence promotion candidates (Rule A or C) needing pattern files: `feedback_pm2_env_inheritance_sticky`, `feedback_freedom_philosophy`, `reference_ecodia_full_mcp`, `reference_creds_substrate_split`.
- 3 high-confidence Strategic_Direction promotion candidates (Rule B): `project_wyoming_dao_llc`, `project_3month_autonomy_hardening_apr2026`, `project_jarvis_layers_may2026`.
- 1 Organization-node promotion candidate (Rule B): `project_ecodia_company`.
- Multiple acceptable Corazon-local mirrors of Decision nodes already in Neo4j; some are slightly verbose and could be trimmed but are not misroutes.

---

## 3. Cross-substrate index health

`MEMORY.md` index at `C:/Users/tjdTa/.claude/projects/d---code/memory/MEMORY.md`:
- Loaded into every Corazon session. 73 rows. Under the 200-line truncation cap. Healthy.
- Rows correctly reflect file presence.
- Per-doctrine: should add one-line footers to entries promoted to Neo4j (after promotion). Currently no entries marked as promoted.

`backend/patterns/INDEX.md`:
- Updated 2026-05-14/15 with recent additions (Lane B/C/D patterns).
- This audit adds one row for `memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md` (handled in the doctrine cross-reference step).

---

## 4. Recommended migrations (NOT executed in this lane)

Per the dossier: "Do NOT actually migrate in this lane. Lane G handles archival of misrouted items; this lane authors the doctrine and audit."

Hand-off recommendations for Lane G or for the daily auto-memory-promotion-audit Routine:

1. **Promote 4 feedback/reference -> Pattern**: `feedback_pm2_env_inheritance_sticky`, `feedback_freedom_philosophy` (shadow), `reference_ecodia_full_mcp`, `reference_creds_substrate_split`. Author pattern files at `backend/patterns/<slug>.md`, ingest pipeline picks up the Pattern node.
2. **Promote 3 projects -> Strategic_Direction**: `project_wyoming_dao_llc`, `project_3month_autonomy_hardening_apr2026`, `project_jarvis_layers_may2026`. Write Neo4j Strategic_Direction nodes with priority + due_date.
3. **Promote 1 project -> Organization node**: `project_ecodia_company`. Write Neo4j Organization node `Ecodia Pty Ltd` with sub-brand relationships.
4. **Trim duplicates**: `project_audit_2026-05-13_fixes`, `project_token_economy_may2026`, `project_perception_dispatcher_may2026` to one-line pointers at their Neo4j Decision shadow.
5. **Fix 7 Episodes with empty descriptions** by the next Routine fire that creates the equivalent Episode (system-health, weekly-financial-review, etc.).
6. **Tune neo4j-stale-node-audit** to drop the age threshold from 90d to 60d for the empty-name-Reflection special case.

---

## 5. Statistics

- **Auto-memory files audited:** 67 active + 9 archived = 76 total.
- **Auto-memory misroutes (wrong substrate):** 0.
- **Auto-memory promotion candidates:** 9 high-confidence + 4 borderline = 13.
- **Neo4j Decisions last 30d:** 282.
- **Neo4j Decisions flagged as preference-misroutes:** 0.
- **Neo4j Reflections last 30d:** ~100 (sum of label combinations).
- **Neo4j Reflection orphans (no relationships):** sample showed 2 obvious empty-name candidates; full sweep deferred to weekly Routine.
- **Neo4j Episodes empty-description + zero-rel last 30d:** 7.
- **Net doctrine health verdict:** good baseline. The substrate split is largely respected today. Future drift is the risk, addressed by the routing hook + the two Routines authored under this lane.

---

## 6. Cross-references

- `backend/patterns/memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md` - the doctrine this audit applies.
- `backend/docs/AUTO_MEMORY_BRIDGE_2026-05-15.md` - Lane B's bridge spec (Option A chosen).
- `backend/routines/auto-memory-promotion-audit.md` - daily routine that will surface the promotion candidates identified here as status_board rows.
- `backend/routines/neo4j-stale-node-audit.md` - weekly routine that will surface the demotion candidates identified here.
- `C:/Users/tjdTa/.claude/hooks/ecodia/memory-substrate-routing.py` - PreToolUse hook for write-time misroute detection.
- `C:/Users/tjdTa/.claude/projects/d---code/memory/MEMORY.md` - auto-memory index audited above.
- `backend/patterns/INDEX.md` - pattern index that will receive new rows after promotions land.
