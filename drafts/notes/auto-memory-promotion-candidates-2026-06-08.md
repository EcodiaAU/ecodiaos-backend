---
date: 2026-06-08
cron: auto-memory-promotion-audit
task_id: d061e4f8-4f6f-44fd-9ef5-9c0f2236edaf
fired_by: tab_1780873511288_a446e05d
sources_scanned: 681
memory_dir: /Users/ecodia/.claude/projects/D---code-ecodiaos-backend/memory/
feedback_entries_total: 64
feedback_entries_with_>=1_cite: 24
feedback_entries_meeting_strict_5_cite_bar: 1
---

# auto-memory-promotion-audit candidates - 2026-06-08

Cron `auto-memory-promotion-audit` ran the Phase 1 07:00 fire on the Mac mini. Scanned the 64 `feedback_*` entries in the auto-memory dir against 681 source files (patterns, routines, docs, skills, `.claude` configs, three CLAUDE.md layers, AGENTS.md, and other memory entries) counting `[[slug]]` references.

## Headline finding

The strict 5-cite promotion bar is barely met. Exactly one feedback entry (`feedback_freedom_philosophy`) hits the bar, and only because a single historical `backend/docs/VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` reference pushes it from 4 to 5. Twenty-three other feedback entries have between 1 and 4 cites; forty have zero. The `[[slug]]` linking convention is widely used in patterns/ (top pattern `verify-deployed-state-against-narrated-state` has 45 cites in patterns/ alone) but rarely points at feedback memories. Either the cite-the-feedback-memory norm is under-adopted, the threshold needs recalibration to 2 or 3, or memory entries graduate to patterns before they accumulate cites.

## Promotion candidates (10, capped per brief)

Each entry below is a `feedback_*` memory with either >= 2 cross-source cites OR a self-declared LOAD-BEARING / 0TH-CLASS tag in MEMORY.md AND no obvious canonical pattern in `backend/patterns/`. Conductor reviews and either (a) promotes via `graph_merge_node label=Pattern` + authors a pattern file with `triggers:` frontmatter, (b) decides the feedback is best left in memory, or (c) folds it into a sibling pattern.

### Tier A - cited >= 3 from earnest doctrine surfaces, no canonical pattern

1. **`feedback_freedom_philosophy`** (5 cites - meets bar)
   - Cited by: `feedback_corazon_vscode_is_my_anatomy`, `feedback_leave_the_form_not_change_the_costume`, `project_wildmountains_pipeline_locked_2026-05-18`, `project_upgrade_atlas_2026-05-18`, `backend/docs/VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md`
   - Core rule: "Never restrict, never hardcode, always generalise, AI decides, full ambition 24/7"
   - Recommended pattern slug: `freedom-philosophy-no-hardcoded-restrictions-on-ai-decisions`
   - Triggers: `freedom-philosophy`, `never-hardcode`, `always-generalise`, `full-ambition`, `oversight-not-restriction`

2. **`feedback_ambient_not_dashboard`** (4 cites)
   - Cited by: `feedback_make_x_more_powerful_means_ask_first` (2), `feedback_leave_the_form_not_change_the_costume`, `feedback_ecodia_does_not_do_marketing_broadcast`
   - Core rule: "EcodiaOS UI was ambient intelligence; the principle informs auto-preview / IDE-native delivery, not bespoke dashboards"
   - Recommended pattern slug: `ambient-intelligence-not-dashboard-as-delivery-substrate`
   - Triggers: `ambient-intelligence`, `not-a-dashboard`, `ide-native-delivery`, `auto-preview`, `delivery-substrate`

3. **`feedback_corazon_vscode_is_my_anatomy`** (3 cites)
   - Cited by: `feedback_reflex_is_0th_class_primitive`, `feedback_ambient_surface_is_where_user_is_not`, `patterns/reflex-first-for-parallelisable-side-work-2026-05-17`
   - Core rule: "Corazon + VS Code CC extension are native anatomy, never a remote interface"
   - Recommended pattern slug: `corazon-vscode-is-native-anatomy-not-remote-interface`
   - Triggers: `native-anatomy`, `corazon-vscode`, `not-remote-interface`, `local-first-embodiment`

4. **`feedback_codify_world_model_corrections_same_turn`** (3 cites)
   - Cited by: `patterns/ecodiaos-voice-substrate-2026-05-26` (2), `project_upgrade_atlas_2026-05-18`
   - Core rule: same-turn doctrine write when Tate flags world-model staleness
   - Note: partial overlap with `patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`. Conductor decision: extend that pattern with a world-model-correction sub-clause OR author distinct pattern keyed on staleness-correction specifically.

### Tier B - 2 cites, philosophical, no canonical pattern

5. **`feedback_leave_the_form_not_change_the_costume`** (2 cites)
   - Cited by: `feedback_outbound_marketing_shape_is_off_relational_only`, `feedback_ecodia_does_not_do_marketing_broadcast`
   - Core rule: when Tate flags 'generic AI slop', leave the form entirely - do not just paint it differently

6. **`feedback_ecodia_tone`** (2 cites)
   - Cited by: same pair as above
   - Core rule: Ecodia copy is plain, concise, no hype. Related to voice profile but distinct enough to warrant its own pattern

7. **`feedback_make_x_more_powerful_means_ask_first`** (2 cites)
   - Cited by: same pair as above
   - Core rule: "Make X more powerful" = ask what is missing first. Intelligence-depth, never tooling-breadth

### Tier C - LOAD-BEARING self-declared, no canonical pattern, zero or one cite

8. **`feedback_outbound_marketing_shape_is_off_relational_only`** (LOAD-BEARING)
   - Core rule: All outbound shapes off. Frame is RELATIONAL. People-in-orbit, never leads-in-funnel
   - The marketing patterns exist but none codify the relational-vs-funnel frame as the explicit doctrine

9. **`feedback_two_channel_marketing_doctrine_2026-05-18`** (LOAD-BEARING)
   - Core rule: Two channels: EcodiaOS on social as AI author + Tate IRL. Pitch only after real relationship
   - Sibling of (8). Conductor may fold both into a single `marketing-relational-frame-no-broadcast` pattern

10. **`feedback_identity_guard_tate_vs_tom_2026-05-27`** (LOAD-BEARING)
    - Core rule: The user is Tate Donohoe, sole director of Ecodia. Tom Grote = Goodreach co-founder (with Kurt), friend of Tate's, NOT part of Ecodia
    - Anti-pattern guard: identity confusion when both come up in the same email thread

## Cross-check note (NOT in the 10)

These LOAD-BEARING / 0TH-CLASS feedback entries are already promoted in spirit because a canonical pattern carrying the doctrine exists, so they stay as auto-memory:

- `feedback_status_board_hygiene_reflex_2026-05-21` -> `patterns/status-board-hygiene-is-a-0th-class-reflex-2026-05-21.md`
- `feedback_recursive_improvement_is_substrate_driven` -> `patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md`
- `feedback_never_blind_restart_pm2_cred_clobber_2026-05-27` -> `patterns/pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27.md`
- `feedback_dev_process_eight_rungs_2026-05-27` -> `patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`
- `feedback_cdp_launch_helper_first_reflex_2026-05-21` -> `patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`
- `feedback_cdp_list_aliases_before_enable_chrome_cdp_2026-05-29` -> `patterns/parallel-cdp-chat-coordination-via-alias-namespacing.md`
- `feedback_scheduling_is_0th_class_2026-05-28` -> `patterns/scheduling-is-0th-class-primitive-2026-05-28.md`
- `feedback_focusless_close_tab_reflex_2026-05-29` -> covered by `patterns/24x7-autonomy-architecture-invariants-2026-05-27.md` invariant 1
- `feedback_dispatch_sched_session_learnings_2026-05-28` -> multiple patterns: `worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28`, `scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28`
- `feedback_information_in_action_out_must_be_autonomous_2026-06-02` -> conductor decision; the learning-machine audit project `project_learning_machine_audit_2026-06-01` covers much of it

## Meta-observation for the corpus

64 feedback memories, 24 cited at all, only 1 strictly meeting the 5-cite bar. Two interpretations:

- **The bar is too high.** The link-liberally convention from the auto-memory doctrine produces sparse cite graphs in practice. Recalibrate the cron's strict bar to 2-3 cites OR fold the LOAD-BEARING / 0TH-CLASS self-tags into the criteria.
- **Promotion is already happening invisibly.** Many high-value feedbacks (status-board-hygiene, recursive-improvement, dev-process eight rungs) became patterns directly without first accumulating memory-internal cites. The pipeline is feedback -> pattern, not feedback -> cited-feedback -> pattern.

Conductor judgement call. The cron should keep firing weekly and surface the marginal cases; the bar question is worth its own status_board row if recalibration is desired.
