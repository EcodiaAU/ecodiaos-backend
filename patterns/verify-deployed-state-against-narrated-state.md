---
triggers: verify-deployed-state, narrate-vs-disk, narration-unreliable, ground-truth-probe, shipped-claim-verify, deployed-claim-verify, live-claim-verify, merged-claim-verify, fixed-claim-verify, in-production-claim-verify, prod-url-curl, vercel-deploy-probe, supabase-row-probe, kv-store-read-after-write, factory-approve-probe, status-board-claim-probe, drift-from-disk, narration-drift-meta-rule, six-substrate-probe-checklist, probe-must-discriminate, discriminating-probe, wrong-path-verification, plausible-but-wrong-pass, verify-against-the-right-path, auth-state-before-screenshot, authed-only-dom-element, logged-out-tab-passes-pixel-check, screenshot-of-unauthenticated-surface, confirm-app-fix, prove-app-fixed, rls-authenticated-role-probe, set-local-role-authenticated, superuser-bypasses-rls, zero-failures-means-nothing, sql-test-passed-but
priority: critical
canonical: true
---

# Verify deployed state against narrated state - narration is unreliable evidence

## 1. The rule

The conductor's narration that something is "shipped", "deployed", "live", "merged", "running", "fixed", or "in production" is an UNRELIABLE proxy for actual ground truth. Across every production surface (Vercel, Supabase, Stripe, GitHub, Bitbucket, kv_store, Neo4j, status_board, PM2, Edge Functions, live frontend pages), narration drifts from reality at a rate that demands systematic ground-truth probes. Before propagating any "X is shipped" claim into status_board state changes, Neo4j Decisions, Tate-facing summaries, or downstream fork briefs, identify the specific ground-truth surface and probe it. The probe takes 30 seconds; the cost of NOT probing is a status_board row that says "shipped" with a deployed surface that is broken.

This is the META-RULE. It subsumes:

- `~/ecodiaos/patterns/forks-self-assessment-is-input-not-substitute.md` (a fork's "I shipped X" report is INPUT, not ground truth)
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` (the visual smoke test gates merge, Tate reviewing later does not)
- `~/ecodiaos/patterns/_archived/factory-approve-no-push-no-commit-sha.md` (approve without commit_sha is phantom approval)
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` (log tail is not empirical evidence)

When in doubt: read the parent rule (this file) for WHY, then the child rule for WHICH probe.

## 2. Specific ground-truth surfaces and their probes

| Narration | Ground-truth surface | Probe |
|---|---|---|
| "Shipped to Vercel" | Vercel deployment status | `vercel_get_deployment` or curl the prod URL |
| "Edge Function deployed" | Supabase function endpoint | `curl https://<project>.supabase.co/functions/v1/<name>` |
| "Migration applied" | Postgres `schema_migrations` row | `db_query` for the migration row |
| "Row archived" | status_board / target table | `db_query` `WHERE archived_at IS NOT NULL` |
| "kv_store key written" | kv_store row | `db_query` `SELECT value FROM kv_store WHERE key=...` |
| "Neo4j node created" | Neo4j | `MATCH (n) WHERE n.name=... RETURN n` |
| "PM2 process restarted" | PM2 list | `pm2_list` and check uptime |
| "Commit pushed" | git remote ref | `git ls-remote origin <branch>` |
| "PR merged" | GitHub/Bitbucket API | API call for the PR's merged_at |
| "File on disk" | filesystem | `ls -la <path>` (mtime + size) |
| "Hook script wired" | settings.json + filesystem | jq the settings + ls the script |
| "Cron firing" | scheduler table | `db_query` `SELECT next_run_at, last_fired_at FROM os_scheduled_tasks WHERE name=...` |

The probe is short, cheap, and authoritative. Skipping it is the failure mode this rule exists to prevent.

## 2b. The probe must DISCRIMINATE the right path (the hardest lesson)

Running a probe is necessary but not sufficient. A probe can pass against the wrong path and manufacture false confidence, which is worse than running no probe at all. The forgetting-to-verify failure has an obvious fix. The verifying-against-a-plausible-but-wrong-path failure is the one that ships broken work with a green check beside it. Every "live behaviour" probe must be bound to the SAME path the user or the claim actually travels.

Three load-bearing cases, each a real failure:

- **App "fixed/shipped" via screenshot.** A pixel check on a tab that silently logged out passes regardless of the fix, because an unauthenticated screen renders fine. The probe must assert AUTH STATE first: read an authed-only DOM element (a logged-in-only selector), or hit `/rest/v1/<table>?select=...` and confirm it returns the test user's own row, BEFORE the screenshot is allowed to count. A logged-out tab fails this assertion no matter how clean the pixels look.
- **Database test "0 failures".** A test run as the superuser (or service-role) bypasses RLS and proves nothing about what the authenticated user can actually do. The probe must run inside `set local role authenticated` with the test user's JWT claims set, so the result reflects the policy-enforced path. "1,256 cases, 0 failures" under superuser is a green check against a path no real user travels.
- **Rendered output "shipped".** A page committed with unrendered markdown (raw `#`, `**`, table pipes) passes a "file exists" probe and a "deploy READY" probe while looking broken to a human. The probe must be a CDP screenshot of the deployed URL this session, looked at, not asserted.

The test: name the path the claim implicitly travels (the authenticated user, the policy-enforced query, the deployed render), then confirm the probe rides exactly that path and could not pass on a wrong one. If a plausible wrong-path execution would also return green, the probe does not discriminate and the claim is unbound. The [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]] M1 PreToolUse gate enforces this at substrate-write time; this section is the teaching a session retrieves while DECIDING how to verify, before the write.

## 3. Six-substrate "is X actually shipped?" checklist

Before any "X is live" claim propagates into status_board / Neo4j / Tate-facing summary:

1. **Filesystem** - file exists at expected path with expected mtime
2. **Git** - commit on the expected branch, pushed to origin
3. **Deploy surface** - Vercel/Supabase/PM2 reflects the new code
4. **Database state** - migration applied, row written, archived flag set
5. **Cache/dependent substrates** - kv_store reads, Neo4j writes, status_board rows
6. **Live behaviour** - smoke probe of the actual user-facing surface (curl, screenshot, sample query)

If any layer fails, the claim is not "shipped." It is "almost shipped" or "shipped on N of 6 substrates." Be honest about which.

Companion file: `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md` - the operational sibling that makes this mechanical.

## 4. Do

- Probe before propagating any "shipped/deployed/live/fixed" claim downstream.
- When a fork reports completion, treat the report as INPUT and run the relevant probe.
- Spend 30 seconds on the probe; the alternative is cleaning up phantom-shipped state for hours.
- If the probe contradicts the narration, fix the narration (status_board, Neo4j) and write an Episode about the drift.
- For multi-substrate ships, verify each of the six substrates explicitly.

## 5. Do NOT

- Trust a fork's self-assessment without probe.
- Update status_board from "in progress" to "done" based on chat narration alone.
- Write a Neo4j Decision saying "X is live" before the live surface is probed.
- Tell Tate "X is done" without having seen the deployed-state probe pass.
- Approve a Factory deploy without verifying push + commit_sha.

## 6. Cross-references

- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - the architectural framing of why narration drifts (substrate seams).
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` - the cached-metric instance of the same rule.
- `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md` - the six-substrate probe checklist (operational sibling).
- `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md` - when 3+ surface failures show the same shape, treat as ONE failure with a shared upstream cause.
- `~/ecodiaos/patterns/_archived/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` - the git-ref-vs-working-tree instance.
- `~/ecodiaos/patterns/_archived/factory-approve-no-push-no-commit-sha.md` - phantom approval instance.
- `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` - the multi-phase-migration specialisation: a Decision claiming "shipped" for a multi-phase ship where only Phase 1 landed. Second-strike codification 8 May 2026 (Phase-D hooks 30 Apr + conductor-sibling 8 May).

## 7. Origin

29 Apr 2026 10:24 AEST. Tate verbatim: "You didnt visually verify the website bro........... thats NOT acceptable, learn from it" (EcodiaSite v2 ship-without-verify). Same day: kv_store query for `newsletter.qoo.edition_003` returned `[]` after fork report claimed the write succeeded. Same day: status_board sweep claimed 5 rows archived but two retained stale "blocked"/"rejected" context. Three independent drift catches in one day made this the meta-rule that subsumes `forks-self-assessment-is-input-not-substitute.md`, `visual-verify-is-the-merge-gate-not-tate-review.md`, `_archived/factory-approve-no-push-no-commit-sha.md`, and `verify-empirically-not-by-log-tail.md`.

Authored on disk by fork_mol5vy5w_250614 on 30 Apr 2026 evening as part of ambient-OS cleanup-night Wave-1 ship pass. The pattern had been narrated and cross-referenced from CLAUDE.md but the file did not exist on disk - which was itself an instance of the rule it documents.
