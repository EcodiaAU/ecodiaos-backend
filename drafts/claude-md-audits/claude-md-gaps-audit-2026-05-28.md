---
title: CLAUDE.md gaps audit
date: 2026-05-28 AEST
author: claude-md-reflection cron fork (task e12c26d8-d90c-4b97-8985-cc17ae161ea2)
target_files:
  - C:/Users/tjdTa/.claude/CLAUDE.md   (user-global, ALL projects)
  - D:/.code/EcodiaOS/CLAUDE.md        (workspace, EcodiaOS)
  - D:/.code/EcodiaOS/backend/CLAUDE.md (technical operations manual)
guardrail: NO em-dashes anywhere. Use hyphens with spaces or restructure.
note_on_paths: the brief was written against the pre-2026-05-15 VPS paths
  (/home/tate/CLAUDE.md, ~/ecodiaos/...). On Corazon the canonical paths are:
    /home/tate/CLAUDE.md          -> C:/Users/tjdTa/.claude/CLAUDE.md
    /home/tate/ecodiaos/CLAUDE.md -> D:/.code/EcodiaOS/backend/CLAUDE.md
    /home/tate/ecodiaos/patterns/ -> D:/.code/EcodiaOS/backend/patterns/
    /home/tate/ecodiaos/drafts/   -> D:/.code/EcodiaOS/backend/drafts/
  This audit uses the local-Corazon paths throughout.
---

# CLAUDE.md gaps audit - 2026-05-28 AEST

Two days of doctrine accretion since the last audit (2026-05-13). The substrate that landed in the last 24h is dominated by the 0th-class scheduling primitive ([[scheduling-is-0th-class-primitive-2026-05-28]]), its first end-to-end validation arc, and three load-bearing patterns codifying the failure modes that arc surfaced. None of these are cross-referenced from any CLAUDE.md file yet. Adding them is the P1 of this audit. The systemic stale-item that has accumulated unchecked is the 91-occurrence VPS-path drift in backend/CLAUDE.md (`~/ecodiaos/...` references that should be `D:/.code/EcodiaOS/backend/...` per the 2026-05-15 local-first cutover); this is the structural P2.

---

## Section 1 - Gaps to add (rule, proposed exact text, target file)

### G1 (P1). Scheduling 0th-class reflex needs cross-ref hardening in backend/CLAUDE.md

The user-global `C:/Users/tjdTa/.claude/CLAUDE.md` already carries the 0th-class scheduling reflex bullet (lines containing "Self-scheduling = `scheduler.delayed` / `scheduler.cron`"). Good. The backend/CLAUDE.md "24/7 AUTONOMY SUBSTRATE" section names the four primitives (worker self-close, conductor turn-start awareness, conductor claims, outcome verification) but does NOT name scheduling. Scheduling is the time-axis sister of dispatch_worker; both should appear in the same primitives list at the same tier.

Proposed addition to `D:/.code/EcodiaOS/backend/CLAUDE.md`, immediately after the existing "**4. Outcome verification - `outcomeVerificationService`.**" paragraph (around line 660):

```
**5. Self-scheduling - `scheduler.delayed` / `scheduler.cron` (0th-class, Tate verbatim 2026-05-28).** Sister reflex to `cowork.dispatch_worker` on the time axis. Every turn that ships work with a follow-up shape (verification window, deferred commitment, recurring discipline, external blocker with a known reset, multi-step arc resuming hours/days later) schedules BEFORE the turn ends. Prompt body carries FULL context the future-me will need (file paths, status_board ids, what was tried, the actual probe to run). If the scheduled fire spawns a worker, the worker's final action is `coord.close_my_tab` per invariant 1; without the self-close the IDE fills with dead workers and burns memory. Both halves bind: schedule the work, close the tabs after. Substrate mechanics: `D:/.code/EcodiaOS/backend/patterns/self-scheduling-via-scheduler-delayed-mcp-2026-05-27.md` + `D:/.code/EcodiaOS/backend/patterns/scheduling-is-0th-class-primitive-2026-05-28.md`. Conductor-side scheduler poller post-patch ([[scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28]]) routes the fire through `cowork.dispatch_worker` on the laptop-agent, not the deprecated os-session/message surface.
```

Target file: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Insert as the new "5." within the existing numbered list under "24/7 AUTONOMY SUBSTRATE".

### G2 (P1). `worker_acknowledgment_timeout_ms: 180000` discipline needs to surface where dispatch_worker is named

The user-global file has the `cowork.dispatch_worker` reflex bullet but does NOT name the 180s ack timeout. The bullet currently reads as "dispatcher handles spawn + register + brief-paste + identity" without naming the parameter that determines whether a healthy spawn gets classified as orphan. Cold-MCP-load first-heartbeat measured at 84.5s on a healthy spawn (worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28.md); the 90s default is functionally a tripwire under any memory pressure.

Proposed addition to `C:/Users/tjdTa/.claude/CLAUDE.md`, appended to the existing "Parallelism = `cowork.dispatch_worker` (0th-class reflex)" bullet:

```
Every `cowork.dispatch_worker` call must pass `worker_acknowledgment_timeout_ms: 180000` (180s). The 90s default leaves zero headroom over the observed cold-MCP-load first-heartbeat floor (84.5s, e2e 2026-05-28). Under memory pressure, network jitter, an extra MCP server, or a flaky account swap, the floor breaches 90s and a healthy spawn classifies as orphan. See [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]].
```

Target file: `C:/Users/tjdTa/.claude/CLAUDE.md`. Append inside the existing parallelism bullet (the one near the [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] cross-ref).

### G3 (P1). Worker-tab cleanup hazard: kill_worker on `foreground_after_spawn` tab_handle is unsafe

This rule must live in a CLAUDE.md surface because the failure mode is silent and catastrophic (Tate lost a live working chat to a misrouted Ctrl+W on 2026-05-28 ~19:25 AEST). Codified in cowork-kill-worker-tab-handle-from-foreground-after-spawn-is-unsafe-2026-05-28.md but not cross-referenced anywhere upstream.

Proposed addition to `C:/Users/tjdTa/.claude/CLAUDE.md`, inserted as a NEW bullet directly after the dispatch_worker bullet:

```
- **Never call `cowork.kill_worker` on a `tab_handle` captured via `foreground_after_spawn` (0th-class, 2026-05-28).** The handle's hwnd+title were captured from whatever was foreground at the polling moment after the spawn keystroke, which may be a completely unrelated working chat. `kill_worker` focuses by title-contains-match and sends Ctrl+W, which then closes THAT window. The only safe cleanup of an orphan with that capture mode is marker-removal (`unlink D:/.code/EcodiaOS/coordination/state/<tab_id>.spawned`); let `coord._sweepStaleWorkers` age the worker out by heartbeat staleness. If `tab_handle.captured_via !== 'window-diff'` the handle is unreliable. Full incident + substrate fix: [[cowork-kill-worker-tab-handle-from-foreground-after-spawn-unsafe]]. Origin: Woodford-chat-murder 2026-05-28.
```

Target file: `C:/Users/tjdTa/.claude/CLAUDE.md`. Insert as a new bullet directly after the dispatch_worker reflex bullet.

### G4 (P2). Scheduler-poller routing bug + fix needs a one-line backend/CLAUDE.md entry

The schedulerPollerService.fireTask path was patched today (commit 49618b9f) to dispatch via cowork.dispatch_worker on the laptop-agent instead of POSTing to the deprecated /api/os-session/message route. Future-me, on a cold start, would otherwise re-derive the failure from a 401 in os_scheduled_tasks.result. The pattern file (scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.md) carries the substrate; CLAUDE.md needs a pointer.

Proposed addition to `D:/.code/EcodiaOS/backend/CLAUDE.md`, in the "Scheduling & Autonomy" -> routing-rule paragraph (around the existing "CONDUCTOR_CRONS set contains exactly meta-loop" sentence), append:

```
Scheduled DELAYED tasks (non-cron) route to `cowork.dispatch_worker` on the laptop-agent (`http://127.0.0.1:7456/api/tool` from Corazon, or `http://100.114.219.69:7456` over Tailscale). Pre-2026-05-28, `schedulerPollerService.fireTask` POSTed to /api/os-session/message with no auth header, which 401-ed silently and dropped every fire. Patched at 49618b9f. Substrate doctrine: [[scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28]]. All scheduled fires that spawn a worker must pass `worker_acknowledgment_timeout_ms: 180000`.
```

Target file: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Append to the existing routing-rule paragraph; do not create a new section.

### G5 (P2). play-console-cdp-driven-app-content-setup needs a release-cluster cross-ref

The pattern landed today (commit 9c401b78) covering the API-for-artifacts + CDP-for-questionnaires architecture for autonomous Google Play submission. First validated on Chambers 1.0(17). It is the Android peer of the iOS release-pipeline cluster that backend/CLAUDE.md already cross-references in the "iOS release pipeline cluster (7 May 2026)" paragraph.

Proposed addition to `D:/.code/EcodiaOS/backend/CLAUDE.md`, immediately after the existing "iOS release pipeline cluster" paragraph:

```
**Android release pipeline (28 May 2026):** the Play Console peer of the iOS recipe cluster. Substrate split is API for artifact + listing + release (androidpublisher v3, signed AAB upload, store listing copy, screenshots, internal/production track), CDP-driven web UI for the eight policy attestation questionnaires (Ads, App access, Content rating IARC, Target audience, Data safety, Government, Financial, Health, Advertising ID). Service-account JSON at `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`. Reusable scripts: `D:/.code/EcodiaOS/backend/scripts/play-upload.py` + `D:/.code/EcodiaOS/backend/scripts/chambers-play-listing-push.py`. Two-radio gates ship cleanly; the IARC questionnaire has a Material radio reactivity gotcha that currently requires Tate to finish the 9 Yes/No clicks manually (workaround in the pattern, real fix on the agenda). Full: [[play-console-cdp-driven-app-content-setup]]. Cluster sequencing for any new Android-publishing Ecodia app: one-time per-Google-account setup runs once (gcloud + service-account + Play Console invite), then per-app one-time (Play app record + keystore), then per-build (build AAB + API upload + CDP questionnaires).
```

Target file: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Insert after the iOS release pipeline cluster paragraph, before "GUI doctrine cluster".

### G6 (P3). PM2 hard-stop tripwire deserves a one-line backend/CLAUDE.md mirror

The user-global file already has the comprehensive PM2 hard-stop section (NEVER blind-restart PM2, 3-step pre-check, `# pm2-guard-ok` bypass token, refresh-clobber-watchdog permanently forbidden). backend/CLAUDE.md does not mirror it; a finance/scheduler/cron fork that picks up the wrong CLAUDE.md scope first could still blind-restart. Worth a one-line mirror in the backend "Hard-stop tripwires" surface (the "Conductor owns ecodia-api lifecycle" section is the closest current peer).

Proposed addition to `D:/.code/EcodiaOS/backend/CLAUDE.md`, appended to the "Conductor owns ecodia-api lifecycle" section as a new closing paragraph:

```
**NEVER blind-restart PM2 (mirror of user-global hard-stop tripwire).** `pm2 restart` / `pm2 resurrect` / `pm2 start ecosystem.config.js` / `pm2 save` reload `~/.pm2/dump.pm2`, which has THREE TIMES reloaded the zombie `refresh-clobber-watchdog.js` and signed out every Claude account. Hard-blocked by `~/.claude/hooks/ecodia/pm2_restart_guard.py` PreToolUse hook (exit 2, bypass token `# pm2-guard-ok`). Pre-check: `pm2 list` -> inspect `~/.pm2/dump.pm2` for zombies -> confirm refresh-clobber-watchdog absent -> only then mutate. Full: [[pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27]].
```

Target file: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Append to the existing conductor-owns-ecodia-api-lifecycle section.

---

## Section 2 - Stale items (refs to outdated tooling, removed flags, superseded doctrine)

### S1 (P2). 91 VPS-path references in backend/CLAUDE.md

Grep `grep -c "/home/tate/\|~/ecodiaos/" D:/.code/EcodiaOS/backend/CLAUDE.md` returns 91. The 2026-05-15 local-first cutover moved the conductor onto Corazon; the VPS is now substrate-only. Every `~/ecodiaos/patterns/foo.md` reference in backend/CLAUDE.md is a future-me-on-cold-start hazard because:
- Reading on Corazon, the path does not exist; Glob/Grep returns nothing.
- Reading on a VPS shell session (if one is ever spawned), the path is right but the live working copy lags Corazon.
- Cross-references with double-bracket `[[name]]` syntax are unambiguous; verbose-path references are the brittle form.

Fix shape: bulk find-replace `~/ecodiaos/` -> `D:/.code/EcodiaOS/backend/` throughout backend/CLAUDE.md. The two surviving VPS-anchored references (line 50 "VPS filesystem at `~/ecodiaos/`" and line 63 "Webhook /fire shims at `~/ecodiaos/src/routes/webhooks/...`") legitimately describe the VPS path and stay. Everything else (patterns/, clients/, docs/, scripts/, drafts/, macros/) flips to Corazon.

Affected sections: PATTERN SURFACING, MEMORY SUBSTRATE DOCTRINE, GKG (Phase 1), Macro doctrine, Bookkeeping, status_board section, doctrine-edit-cross-ref surface, scheduling, end-of-session hygiene, restart recovery, cron-fire deliverable discipline. Roughly two-thirds of the file body.

Two-line user-global fix: lines containing `~/ecodiaos/` in `C:/Users/tjdTa/.claude/CLAUDE.md` are inside "Tate's iPhone" example text and an architectural cross-ref; both should also flip to local paths.

Recommendation: do this as a single large MultiEdit on backend/CLAUDE.md to maintain consistency. Verify post-edit with `grep -c "~/ecodiaos/"` returning <= 2 (the legitimate-VPS-anchored remainders).

### S2 (P3). "kg-consolidation Director dead 8d" still surfaced in critical status_board (row b9cb8af9) but the corresponding doctrine in backend/CLAUDE.md says it lives at `pm2 logs ecodia-api kgConsolidationService since 2026-05-04T11:10Z`. Date stale by 24 days. The pattern files referenced still exist and the row's next_action is current; only the date string in CLAUDE.md would mislead. Low-effort fix; can wait.

### S3 (P3). Routines status disclaimer in backend/CLAUDE.md ("Routines status unverified. Many depended on VPS substrate that no longer exists in the same shape") has been in the file since 2026-05-17. The autonomous-scheduler-on-laptop-agent-2026-05-26.md doctrine has since landed; the new scheduler-poller-must-dispatch-worker patch should mean Routines can be re-validated against the new dispatcher. Worth a follow-up audit run in the next 7 days to either confirm or replace the disclaimer.

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

Recent pattern files NOT linked from any CLAUDE.md:

- `scheduler-poller-must-dispatch-worker-not-os-session-message-2026-05-28.md` (gap G1, G4)
- `worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28.md` (gap G2)
- `cowork-kill-worker-tab-handle-from-foreground-after-spawn-is-unsafe-2026-05-28.md` (gap G3)
- `play-console-cdp-driven-app-content-setup.md` (gap G5)
- `scheduling-is-0th-class-primitive-2026-05-28.md` (already cross-ref'd in user-global; gap G1 propagates it to backend/CLAUDE.md)
- `dispatch-worker-runtime-semantics-2026-05-26.md` and `dispatch-worker-worktree-hygiene-2026-05-26.md` are named in user-global; backend/CLAUDE.md mentions them by [[link]] in one place. Adequate.

All five new patterns above are addressed by the gap proposals in Section 1. No additional cross-ref work needed beyond applying Section 1.

---

## Section 4 - Structural issues (header order, findability, redundancy)

### St1. backend/CLAUDE.md "RESIDUAL DEPRECATIONS - 2026-05-26 update" header is now 2 days old and the table inside is half-superseded. The "Local listener tier" row is still accurate. The "Routines (16 scheduled, 4 webhook) firing on tate@/code@/money@ accounts" row is the one that needs re-verification (per S3). Low-effort; resurface during next routines-audit cron.

### St2. backend/CLAUDE.md "Conductor owns ecodia-api lifecycle (structural + cultural rule)" header is great but lives below "Scheduling & Autonomy". The 24x7 autonomy primitives belong adjacent. Consider promoting "24/7 AUTONOMY SUBSTRATE" to live IMMEDIATELY above "Scheduling & Autonomy" (it's currently below), so the four-plus-one primitives (worker self-close, conductor turn-start awareness, conductor claims, outcome verification, self-scheduling per G1) are visually adjacent to the scheduling section that drives them. Editorial pass; not load-bearing.

### St3. user-global `C:/Users/tjdTa/.claude/CLAUDE.md` "Operating doctrine - load-bearing rules" section has grown to 15+ very long bullets, each carrying inline cross-refs and inline doctrine. The file is doing two jobs (concise rule list + extended-doctrine paragraphs). Consider splitting: keep the bullet headlines + short rule statement in the user-global; move the long-form discussion to per-rule pattern files (most already exist; the user-global bullets cite them). Editorial pass; not load-bearing; would noticeably reduce cold-start read cost. Optional - the file is currently scannable because the structure (em-dash banned in body, so bold headlines stand out).

### St4. No redundancy between the three files at the moment. Each layer adds, none repeats. Good.

---

## Section 5 - Prioritised P1/P2/P3 to-do list

### P1 (do in the next session)
1. **G1** - Add scheduling-as-5th-primitive paragraph to backend/CLAUDE.md "24/7 AUTONOMY SUBSTRATE" section. File: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Rationale: scheduling is now 0th-class but backend/CLAUDE.md doesn't name it in the primitives list; future cold-start would miss it.
2. **G2** - Append the `worker_acknowledgment_timeout_ms: 180000` rule to the dispatch_worker reflex bullet in `C:/Users/tjdTa/.claude/CLAUDE.md`. Rationale: the 90s default classifies healthy spawns as orphan; e2e-observed floor is 84.5s.
3. **G3** - Add the kill_worker-on-foreground_after_spawn-tab_handle hazard bullet to `C:/Users/tjdTa/.claude/CLAUDE.md`. Rationale: silent + catastrophic failure mode (live chat closed); needs CLAUDE.md surface not just a pattern file.

### P2 (next 2-3 sessions)
4. **G4** - Add the scheduler-poller routing rule + patch reference to backend/CLAUDE.md "Scheduling & Autonomy" routing-rule paragraph. File: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Rationale: future-me would re-derive a 401 from os_scheduled_tasks without the pointer; doctrine should name the patch.
5. **G5** - Add the Android-release-pipeline cluster paragraph to backend/CLAUDE.md immediately after the iOS release pipeline cluster paragraph. File: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Rationale: peer to existing iOS substrate; first validated on Chambers today; new Android Ecodia apps need this surface to find the right substrate.
6. **S1** - Bulk find-replace `~/ecodiaos/` -> `D:/.code/EcodiaOS/backend/` throughout backend/CLAUDE.md (preserving the 2 legitimate VPS-path references on lines 50 + 63). File: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Rationale: 91 stale path references would all silently miss on Corazon's filesystem; biggest systemic stale-item in the codebase. Single large MultiEdit.

### P3 (worth doing but not blocking)
7. **G6** - Mirror the PM2 hard-stop tripwire in backend/CLAUDE.md (one paragraph in the "Conductor owns ecodia-api lifecycle" section). File: `D:/.code/EcodiaOS/backend/CLAUDE.md`. Rationale: defence-in-depth; a fork that scopes only backend/CLAUDE.md could still blind-restart.
8. **S2** - Update the kg-consolidation date string in backend/CLAUDE.md. Trivial.
9. **S3** - Audit Routines status; either confirm them post-poller-patch or replace the unverified-disclaimer with a precise live-or-dead table. Spawn as its own cron + audit fork pair.
10. **St2** - Editorial pass: promote "24/7 AUTONOMY SUBSTRATE" above "Scheduling & Autonomy" in backend/CLAUDE.md. File: `D:/.code/EcodiaOS/backend/CLAUDE.md`.
11. **St3** - Editorial pass: consider splitting user-global "Operating doctrine - load-bearing rules" into headline-only bullets + cross-refs to existing patterns. File: `C:/Users/tjdTa/.claude/CLAUDE.md`. Optional, not load-bearing.

### Notes
- Audit ran on the cron that fires daily; previous audit was 2026-05-13 (15 days ago) so the cron has been missing fires. Suspect the same scheduler-poller-routing bug that G4 names. Now patched. Future audits should land daily.
- Reference audit shape from `D:/.code/EcodiaOS/backend/drafts/ops/audits/claude-md-gaps/claude-md-gaps-audit-2026-05-13.md`. The brief at-this-fork specifies `drafts/` root rather than the nested `drafts/ops/audits/claude-md-gaps/` location; main can move this file into the canonical nested location during the edit pass.
- New directives in the last 24h: confirmed via the three new May-28 pattern files which capture today's Tate verbatim quotes. No additional directives surfaced that are not already in those pattern files.
