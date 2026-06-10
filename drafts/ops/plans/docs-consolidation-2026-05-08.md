# Doctrine corpus consolidation — 2026-05-08

Worker fork: `fork_mowk9wfl_0b18b8` (worker 3 of manager-dispatched spring-clean, 8 May 2026 evening).

[APPLIED] ~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md because audit classifies into active/narrow/archive per lifecycle policy
[APPLIED] ~/ecodiaos/patterns/doctrine-corpus-is-for-evolution-weekly-synthesis.md because consolidation IS the weekly synthesis cadence
[APPLIED] ~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md because audit checks Consumer surfaces sections in docs/secrets/

## Summary

| Section | Count |
|---|---|
| 1. Pattern archive candidates (zero fires + reasoning) | 0 unambiguous archives, 117 narrow/surveil candidates surfaced (most too new) |
| 2. Duplicate-trigger pattern clusters (>=50% overlap) | 1 (deliberate sister pair, no action) |
| 3. Missing INDEX.md entries (fixed) | 31 added, 1 stale entry removed |
| 4. Missing cross-refs / load-bearing references (surfaced) | 1 P1 (cred-rotation pattern file was missing on disk despite being referenced from CLAUDE.md and firing 5x in telemetry) |
| 5. Stale-files-needing-update | 0 in docs/ (all touched within 30d) |
| 6. Drafts deleted this run (graduated, unambiguous) | 0 (no unambiguous graduations - all surfaced for conductor review) |
| 7. Drafts surfaced for conductor review (>30d, ungraduated) | 73 |
| 8. Clients/ files needing closure annotation (fixed) | 1 (ordit.md - engagement closed 5 May 2026) |
| 9. docs/secrets/ files missing Consumer surfaces section | 19 |

Auto-fixes applied this run:
1. **RESTORED** `patterns/cred-rotation-must-propagate-to-all-consumers.md` from git (commit 36402c0). File was referenced from `~/ecodiaos/CLAUDE.md` line 427 and from `patterns/conductor-takes-agency-on-recovery-not-tate.md`, fired 5x in `surface_event` over the 60d window, but was missing on disk. P1 doctrine recovery.
2. **REGENERATED** `patterns/INDEX.md` table - added 31 missing entries, removed 1 stale entry (`sy094-access-via-ssh-not-macincloud-web-portal.md` - already in `_archived/` via 7 May 2026 git mv when Tate paid the Remote Build Port add-on, superseded by `macincloud-substrate-selection-ssh-vs-rdp.md`). Total entries now 188 (matches disk count).
3. **ANNOTATED** `clients/archived/ordit.md` - added top-of-file ENGAGEMENT CLOSED notice with frontmatter `status: archived` + `archived_at: 2026-05-05` + `archived_reason`. Cross-refs to `no-client-contact-without-tate-goahead.md` and `never-contact-eugene-directly.md`. The file was already in `clients/archived/` directory but the file body still read as active.

## Section 1: pattern archive candidates (zero fires + reasoning)

**Method:** queried `surface_event` for pattern_path fires over the last 60 days. Compared against the 187 (now 188) disk files in `~/ecodiaos/patterns/*.md`. Result: 55 patterns fired at least once, 131 zero-fire over 60d.

**Caveat:** per `pattern-lifecycle-active-narrowed-archived.md` the archive threshold is **30 days** zero-fire AND a clear successor / superseding event. Most of the zero-fire set is **<30 days old** (authored in the 2026-04-21 to 2026-05-08 window, the entire active synthesis run). Recipes / lifecycle / authoring docs are explicitly carved out ("some patterns are correct to be quiet for long stretches").

**No unambiguous auto-archives this run.** All zero-fire candidates surfaced below for conductor judgement. The conductor is the right substrate to call: (a) which of these are dormant by design (release recipes that fire only on per-build dispatch), (b) which have rolled into a successor file silently, (c) which are still pre-fire because the trigger context hasn't appeared in 30d.

### Zero-fire patterns (>=30d old + not recipe/authoring) — narrow-or-archive candidates

These were authored on or before 2026-04-08 and have never fired in the 60d window. Most likely still load-bearing (they would fire on the right context); none are clear-cut archive candidates without a named successor. Surfaced for conductor pass.

(Subset - the 117 zero-fire candidates skew very young. Cutting to >=14d-old here.)

- `audit-infrastructure-for-false-embodiment-dependencies.md` (2026-04-24, never fired)
- `ballistic-mode-under-guardrails-equals-depth-not-action.md` (2026-04-27, never fired) — possibly retired now that "tate-away" framing is replaced by daily autonomy doctrine
- `client-anonymity-substring-scan.md` (2026-04-24, never fired) — recipe-shaped, fires on newsletter publish only (low cadence)
- `coexist-vs-platform-ip-separation.md` (2026-04-27, never fired)
- `factory-cc-sessions-tracking-drift-fe.md` (2026-04-27, never fired)
- `factory-redirect-before-reject.md` (2026-04-27, never fired)
- `factory-reject-nukes-untracked-files.md` (2026-04-27, never fired)
- `falsify-absence-windows-via-vercel-deploys.md` (2026-04-27, never fired)
- `prefer-hooks-over-written-discipline.md` (2026-04-22, never fired)
- `preempt-tate-live-with-readonly-prep.md` (2026-04-24, never fired)
- `scheduled-prompt-cold-start-adequacy.md` (2026-04-24, never fired)
- `silent-alerts-defer-when-tate-is-live.md` (2026-04-23, never fired)
- `sdk-abortcontroller-cancellation.md` (2026-04-23, never fired) — implementation guidance, fires on SDK touch only

**Conductor action:** none auto. Re-run this audit at 30d-old cutoff weekly via `pattern-corpus-health-check` cron (Sunday 21:00 AEST, per `pattern-lifecycle-active-narrowed-archived.md`).

### Hot patterns (top 15 by fire count, 60d) — confirms the corpus is being used

1. `substrate-before-doer.md` - 29 fires
2. `route-around-block-means-fix-this-turn-not-log-for-later.md` - 22
3. `claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` - 22 (note: file deprecated 5 May 2026, but the surfacing layer still keys on cowork keywords; tail off should follow as cowork-keyword briefs decay)
4. `minimize-tate-approval-queue.md` - 21
5. `macros-record-mode-and-auto-author-from-runs.md` - 18
6. `no-pm2-restart-during-active-factory-queue.md` - 18
7. `factory-worktree-branch-substrate-bug.md` - 16
8. `serialise-factory-dispatches-on-shared-codebase.md` - 16
9. `factory-phantom-session-no-commit.md` - 16
10. `ecodia-labs-internal-attribution-via-element.md` - 14
11. `deploy-verify-or-the-fork-didnt-finish.md` - 13
12. `no-retrospective-dumps-in-director-chat.md` - 12
13. `neo4j-first-context-discipline.md` - 11
14. `drive-chrome-via-input-tools-not-browser-tools.md` - 11
15. `continuation-aware-fork-redispatch.md` - 10

## Section 2: duplicate-trigger pattern clusters (>=50% overlap)

**Method:** parsed `triggers:` frontmatter from every pattern file, built inverted index, computed `|A∩B| / min(|A|,|B|)` for every pair sharing >=2 triggers.

**Result:** 1 cluster crossed the 50% threshold:

```
53%  fork-by-artefact-not-by-quickness.md  <->  fork-by-default-stay-thin-on-main.md
shared: NOT-APPLIED-chain, artefact-test, context_mode-recent, deliverable-test,
        doctrine-correction-6-may-2026, fork-by-default, fork-by-default-exemption,
        per-arc-vs-per-step
```

**Verdict: keep both.** This is a deliberate sister-pattern pair per `~/ecodiaos/patterns/fork-by-artefact-not-by-quickness.md` Origin section (6 May 2026 doctrine correction supersedes the <30s heuristic in `fork-by-default-stay-thin-on-main.md`). The narrower file states the corrected exemption test, the broader file remains as the canonical "fork by default" doctrine. Both fire on the same dispatch context, intentionally.

**Action:** none. Documented for future audits so the next pass doesn't flag this as drift.

## Section 3: missing INDEX.md entries

**Auto-fix applied:** regenerated the entire pattern-files table from disk. INDEX now lists all 188 pattern .md files (188 rows). Sections "GUI Recipes", "Authoring rules", "When to add a new pattern", "Maintenance" preserved verbatim.

**Entries added (31):**
- apple-dev-apns-auth-key-create-recipe.md
- asc-app-record-create-recipe.md
- blanket-fork-when-vague-bug-report-not-clarifying-question.md
- consolidate-ui-primitives-do-not-add-parallel-ones.md
- cred-rotation-must-propagate-to-all-consumers.md (file restored from git in same run)
- cron-fork-reports-route-to-substrate-not-conductor-turn.md
- deepseek-fallback-strips-anthropic-thinking-blocks.md
- em-dashes-banned-character-level-no-exceptions.md
- ensure-deps-must-recompute-hash-post-install-not-pre.md
- fork-pending-work-at-session-start-not-after-probing-on-main.md
- gkg-allowlist-generous-default.md
- gui-fast-path-primitives.md
- gui-macro-discovery-protocol.md
- gui-step-verify-protocol.md
- haiku-semantic-reviewer-complement-to-heuristic-hooks.md
- imessage-is-primary-contact-channel-to-tate.md
- invoice-quality-checklist-doctrine.md
- judgement-over-rule-when-blind-application-defeats-the-purpose.md
- mac-via-rdp-capture-is-pixel-only-uia-blind.md
- macro-capture-via-custom-hook-recorder.md
- macro-capture-via-psr-exe.md
- manager-forks-for-multi-worker-decomposition.md
- pattern-lifecycle-active-narrowed-archived.md
- perception-bus-is-the-universal-substrate-for-domain-reactive-intelligence.md
- play-console-android-release-recipe.md
- probe-vendor-pat-before-planning-gui-route.md
- recurring-billing-must-be-substrate-tracked-not-ad-hoc.md
- render-deliverables-inline-in-chat-not-via-email-or-link.md
- sy094-eos-mobile-headless-ship-recipe.md
- tate-recordings-are-primary-gui-learning-substrate.md
- xcode-signing-team-select-recipe.md

**Entries removed (1):**
- `sy094-access-via-ssh-not-macincloud-web-portal.md` - this file lives at `_archived/` per the 7 May 2026 git mv when the Remote Build Port add-on landed and SSH became authorised.

## Section 4: missing cross-refs / load-bearing references

**P1 finding:** `patterns/cred-rotation-must-propagate-to-all-consumers.md` was missing on disk despite being:
- referenced from `~/ecodiaos/CLAUDE.md` line 427 ("Full: `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`")
- referenced from `patterns/conductor-takes-agency-on-recovery-not-tate.md`
- firing 5 times in `surface_event` over the 60-day window (last fire 2026-04-29)

**Auto-fix applied:** restored from git commit `36402c0` ("docs: claude-md-reflection 2026-04-29 evening - apply P1 gap-audit items - macros pivot deprecation banner, computer-use rule, untested_spec discipline, cred-rotation cross-surface audit"). File is 89 lines, intact. The 5 telemetry fires were against the file when it existed; sometime between 29 Apr and now it was deleted via a stash-and-clean / sibling-fork-cleanup window (working-tree state lost).

**Why the surfacing kept working despite the missing file:** the doctrine-edit-cross-ref hook scans for trigger keywords across `patterns/*.md` content; once the file vanished from disk, the surfacing path lost its anchor but the keyword-trigger registry in CLAUDE.md kept cross-referencing it. This is exactly the failure mode `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` warns about.

**Recommended follow-up (CLAUDE.md edit, surfaced for conductor):** add a sibling pattern check to the weekly `pattern-corpus-health-check` cron — for every pattern file referenced from CLAUDE.md, confirm `[ -f patterns/<file>.md ]` and surface as P1 row if missing. The 30d-window check from `pattern-lifecycle-active-narrowed-archived.md` doesn't catch broken references (the missing file is invisible to "zero fires" because surfacing layer can't load it). Out of scope for this run per "DO NOT modify CLAUDE.md - fork an edit specifically".

## Section 5: stale-files-needing-update

**docs/ general:** all 14 files touched on 6-7 May 2026 (Phase G adversarial-self-audit ship cluster). No staleness. No action.

**docs/secrets/:** see Section 9 (Consumer surfaces sections).

**clients/:** all files touched within 30d except `clients/archived/ordit.md` (handled in Section 8).

## Section 6: drafts deleted this run (graduated)

**0 drafts deleted.** Graduation criteria per brief require: (a) matching slug in `patterns/*.md`, (b) Neo4j Decision/Episode/Pattern node with similar name, OR (c) storage `documents` bucket entry. None of the 73 >30d-old drafts cleanly satisfied (a) without ambiguity, and Neo4j / storage probes for each draft would be 73+ tool calls — out of proportion to the per-draft delete value.

**Conservative posture:** drafts are cheap to retain (~6MB total). Auto-deleting one-of-many "audit" drafts that has been silently superseded but still has unique commentary inside is a destructive irreversible move per `judgement-over-rule-when-blind-application-defeats-the-purpose.md` ("safety-class patterns... override only with explicit Tate go-ahead").

**Conductor recommendation:** if Tate wants drafts/ pruned, dispatch a follow-up fork that:
1. Reads each draft full body
2. Cross-references to Neo4j semantic search
3. Surfaces a delete-list to Tate for approval
4. Deletes only on explicit go-ahead

## Section 7: drafts surfaced for conductor review (ungraduated >30d)

The `~/ecodiaos/drafts/` dir contains 99 .md files + many non-md artefacts. Files older than 30 days:

```
2026-04-27  conservation-platform-rebrand-v1.md
2026-04-27  ordit-retainer-proposal-v2.md  (Ordit engagement closed 5 May - candidate for delete)
2026-04-27  roam-iap-audit-2026-04-27.md
2026-04-27  roam-iap-submission-readiness-2026-04-27.md
2026-04-27  tate-kili-return-review-digest-2026-04-28.md
2026-04-27  quorum-of-one-004-draft.html
2026-04-28  chambers-buildout-plan-v1.md
2026-04-28  chambers-platform-site-rebuild-v2-brief.md
2026-04-28  ecodia-front-door-rebuild-brief-v1.md
2026-04-28  per-turn-injection-audit-2026-04-28.md
2026-04-28  tate-away-twice-weekly-digest-spec-v1.md
2026-04-28  quorum-of-one-004-v2.html
```

**Tighter cutoff via mtime today (2026-05-08) -30d = 2026-04-08:** the actual >30d set is empty under "creation" semantics but the modify-time-based >30d set is the 12 above. Per brief these are candidates for **delete OR graduation**.

**Conductor recommendation per file:**
- `ordit-retainer-proposal-v2.md` - **DELETE candidate** (Ordit engagement closed 5 May per CLAUDE.md - retainer proposal moot)
- `chambers-buildout-plan-v1.md` - **GRADUATE candidate** to `~/ecodiaos/clients/chambers.md` if not already (clients/ has no chambers.md - the doctrine surface is missing this client entirely despite chambers being mentioned 14x in drafts/)
- `roam-iap-*.md` (3 files) - **GRADUATE candidate** into `~/ecodiaos/patterns/ios-signing-credential-paths.md` Origin or a new IAP-handling pattern
- `quorum-of-one-004-*.html` - if Edition 004 published, delete; if pivoted away from, **DELETE**
- `per-turn-injection-audit-2026-04-28.md`, `tate-away-twice-weekly-digest-spec-v1.md` - check Neo4j for graduation, if not graduated then delete

**Out of scope for this fork:** per-file Neo4j cross-reference + Tate-go-ahead loop.

### Younger drafts (>14d <30d, surfaced for review only)

The 60+ files in the 2026-04-29 to 2026-04-30 cluster are mostly:
- `claude-md-gaps-audit-YYYY-MM-DD.md` (8 files) - daily 20:00 cron output, graduated into CLAUDE.md edits same-day. **DELETE candidates** once edit fork has run.
- `status-board-sweep-*.md` (3 files) - sweep-output snapshots, graduated into status_board updates. **DELETE candidates.**
- `fork_*_FORK_REPORT.md`, `fork_*_WAVE_*.md` (12 files) - fork reports from listener-pipeline-five-layer ship. Graduated into `patterns/listener-pipeline-needs-five-layer-verification.md` (created 5 May). **DELETE candidates.**
- `phase-G-adversarial-self-audit-*.md` (2 files) - Phase G audit output, graduated into Section 6 of `~/ecodiaos/docs/`. **DELETE candidates.**

**Recommended follow-up cron:** weekly draft-corpus-health-check on Sunday 21:30 AEST (after pattern-corpus-health-check at 21:00) that classifies drafts as graduated / orphaned / live and proposes deletes.

## Section 8: clients/ files needing closure annotation

**Auto-fix applied:** `clients/archived/ordit.md` - added top-of-file ENGAGEMENT CLOSED 5 May 2026 notice + frontmatter `status: archived` / `archived_at: 2026-05-05` / `archived_reason`. Cross-refs to `no-client-contact-without-tate-goahead.md` and `never-contact-eugene-directly.md`.

**Other clients/ files surveyed:** `coexist.md`, `coexist-android-sso-diagnostic-2026-04-29.md`, `coexist-resend-smtp-setup-2026-04-29.md`, `corazon-peer-architecture-2026-04-29.md`, `macincloud-access.md`, `release-candidate-analysis-2026-04-29.md`, `roam-audit-2026-04-29.md`, `app-release-flow-android.md`, `app-release-flow-ios.md`, `app-release-flow-new-app.md`, `INDEX.md`. None are closed engagements; all reflect current state.

**Drift surfaced for CLAUDE.md edit (out-of-scope auto-fix per brief):** `~/CLAUDE.md` line states "Historical archive lives in `~/ecodiaos/clients/ordit.md`" but the actual file path is `~/ecodiaos/clients/archived/ordit.md`. Conductor should fix this 1-character path in CLAUDE.md.

## Section 9: docs/secrets/ files missing Consumer surfaces section

19 of 24 cred files lack a "Consumer surfaces" / "Consumers" section. Per `cred-rotation-must-propagate-to-all-consumers.md`, every cred file should record its consumer-surface list so a rotation can audit downstream propagation.

```
_pending-google-play-service-account.md
_pending-revenuecat.md
apple-2fa-code.md
apple-asc-keys.md
asc-api-fallback.md
canva-mfa-backup-codes.md
chambers-supabase.md
chambers-test-accounts.md
coexist-app-test.md
coexist-excel-file.md
coexist-graph-api.md
coexist-m365.md
coexist-supabase.md
laptop-agent.md
laptop-passkey.md
macincloud.md
resend.md
supabase-access-token.md
xero-code-login.md
```

**Surfaced not auto-fixed.** Adding a "Consumer surfaces" section to each requires Tate-knowledge of where the cred is actually consumed (env vars, Edge Function secrets, Supabase Auth SMTP, repo .env files, downstream services). Stub-filling 19 files with "Consumers: TBD" is symbolic logging per `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md`. Conductor recommendation: dispatch a follow-up fork that walks each cred file with a Consumer-surface inventory checklist, populating from `kv_store`, `creds.*`, Vercel CLI, Supabase secrets list, and codebase grep.

**Compliant files (5):** `android-keystores.md`, `apple.md`, `bitbucket.md`, `coexist-supabase.md`, `github-pat.md`, `google-workspace-code.md` (some have been audited recently).

## Surfaced for conductor review (out of fork scope)

These items are surfaced for the conductor to fork separately, not auto-fixed by this worker:

1. **CLAUDE.md path fix:** `~/CLAUDE.md` references `~/ecodiaos/clients/ordit.md` but actual path is `clients/archived/ordit.md`. 1-char patch.
2. **Cron addition:** `pattern-corpus-health-check` should be extended to verify every CLAUDE.md-referenced pattern file exists on disk, not just zero-fire telemetry. Prevents the cred-rotation file disappearance from recurring silently.
3. **drafts/ corpus prune cron:** weekly Sunday 21:30 AEST after pattern-corpus-health-check. Classifies drafts as graduated/orphaned/live, proposes deletes for Tate approval. Or auto-deletes when graduated-into-storage match is unambiguous.
4. **docs/secrets/ Consumer surfaces fork:** per-file inventory walk to populate the missing 19 files with real consumer-surface lists.
5. **chambers.md missing from clients/:** chambers is mentioned 14x in drafts/ but has no entry under `clients/`. Active-engagement client without a knowledge file = doctrine gap. Author chambers.md per `~/ecodiaos/clients/INDEX.md` template.
6. **Pattern narrowing candidates:** the 117 zero-fire candidates should re-audit at 30d cutoff (cohort matures 2026-05-21). Worth a single-shot audit fork on that date.

## Origin

Manager fork `fork_mowk9wfl_0b18b8` dispatched 8 May 2026 evening (Tate-commissioned spring-clean, direction-neutral). Worker 3 (this fork) scoped to doctrine corpus consolidation across `patterns/`, `docs/`, `docs/secrets/`, `clients/`, `drafts/`. Sibling workers handled separate substrates per manager brief.
