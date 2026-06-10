# Daily briefing, Tuesday 2026-06-10 AEST

For Tate, on waking. Written by EcodiaOS overnight from live substrate. 90 second read.

---

## 1. Yesterday's substrate footprint (2026-06-09 AEST)

- status_board rows touched: 122.
- Neo4j Episodes written: 65. Decisions: 9. Reflections: 0.
- Patterns authored (git-tracked, dated): 13 new files in backend/patterns/. Highlights: `cron-silent-fail-when-external-api-auth-dies`, `migrations-must-run-on-deploy-not-just-ship`, `transcript-jsonl-is-canonical-substrate-for-self-evolution-audits`, `secrets-audit-must-inspect-tracked-env-content`, `release-walker-state-matrix`.
- Drafts written (filename-dated 2026-06-09): 18. Notable: `three-big-chats-postmortem`, `coexist-1-9-postmortem`, `seedme-thesis`, `mac-organisation-system-v2-hardened`, `bold-moves-2026-06-08` (still the standing conviction list).
- Crons fired with last_run yesterday: 35 total. 17 active, 8 completed, 7 dispatching, 2 running, 1 cancelled, 1 paused. Zero new-orphans in the last 36h.
- Cron failures, lifetime: 9 stuck `failed`, all 9 with `last_error = "spawn failed: VS Code not running"`. These are Corazon-era stale fires (oldest 2026-05-07, newest 2026-05-18). Not new overnight.

## 2. P1 and P2 blocking on Tate today (next_action_by = tate, 16 rows)

P1 (5):

- [2618be34] **BAS Q3 FY26 (Jan-Mar 2026)** for Ecodia Pty Ltd. Refund $147.15 owed by ATO. Decide whether to lodge. Touched 22h ago.
- [e6869164] **BAS Q2 FY26 (Oct-Dec 2025)** for Ecodia Pty Ltd. Refund $150.30 owed. Same shape, same decision. 101 days overdue against the ATO calendar.
- [65373c16] **BAS Q1 FY26 (Jul-Sep 2025)** for Ecodia Pty Ltd. Refund $121.30 owed. 224 days overdue. Three BAS instalments total $418.75 in refunds sitting unclaimed.
- [87833a81] **Algorithmic-Manager Kit / Cofound checkout** revenue priority. Verified at 23:16 UTC 2026-06-09 still showing only mailto:code@ecodia.au, zero buy.stripe.com on https://ecodia.au/cofound. The 22h ship window passed. Brief is dispatch-ready: stripeAgentService.createPaymentLink for $3,500 AUD, edit ecodia-site cofound page CTA, push EcodiaAU/EcodiaSite, await Vercel READY. Picked as today's top move below.
- [8c3199ea] **WM intensive: Lizz Hills antagonist thread.** Tate leads. Standing watch for any Lizz/Kurt/WM signal.

P2 (11), grouped:

- **Bookkeeping** [9a372f74]: Xero Custom Connection scopes stripped, xero_tokens empty, 41 rows queued $2,077.99 unsynced (12 days broken). Re-grant 7 scopes at developer.xero.com (code@ecodia.au Xero login). Categoriser flagged 2 more this fire (32 BankTransactions + 9 ManualJournals).
- **Compliance**: ASIC annual review fees on both Ecodia Pty Ltd [44e282e7] and Ecodia Labs Pty Ltd [fad5e9ce], AU$329 each, due date pegged to formation anniversary plus invoice. Wyoming DAO LLC annual report [11faa34c] due first day of formation-anniversary month, license tax minimum US$60.
- **Client / brand**: Vikki Marsh [e7bea4e4] needs Tate to call Digital Pacific for the DNS-cutover and collect final revisions. LostMe redesign prompt [cfe46165] drafted at drafts/clients/moss/lostme-design-prompt-2026-06-03.md, three open questions pending Tate signoff. YnY land-stake [34c2198f] decision: ~$500 builder, Ecodia takes land/events stake.
- **Product**: Woodfordia all-in-one [c80b1241] foundations on feat/ios-native-foundation + feat/android-native-foundation, 7 surface worker briefs awaiting Tate paste-into-new-tabs (briefs path is Corazon-era D:/ path, will need Mac re-export). Context iOS [4269647a] Build 48 shipped with four triggers and a relevance floor; Tate one concrete failure case wanted before more blind builds.
- **Infra**: cred-rotation daemon [3f07250a] not running on Mac; code.json long-lived auth token invalid, needs a reverse-sync helper from .credentials.json to the per-account file.

## 3. P1 and P2 EcodiaOS is working today (next_action_by = ecodiaos, 22 rows)

P1 (4):

- [b22cc8dd] **Scheduler dispatch path** investigation row. Child investigator dispatched 2026-06-09 23:44 UTC, 7 probe angles open. Memory note: signal_bound was actually healed since 2026-06-08 04:45 AEST; this row may itself be drifted. Conductor verifies on session start.
- [d6489696] **factoryBridge / kg-consolidation watermark** drift. Code fix shipped commit d6002d5f. Pending: restart ecodia-api on VPS, trigger kg-consolidation via curl, confirm watermark advances past 2026-05-19. Sister row 651a1304 verifies on the same trigger.
- [5f4d0670] **Goodreach restructure + Resonaverde channel merge.** Confirm Tom + Angelica alignment, draft restructure in EcodiaOS aesthetic, surface decision points to Tate.
- [939cac51] **Corazon C: drive 95% used (5.8GB free).** Corazon-era row, Mac is now canonical (since 2026-06-08), so this is archival-pending unless Corazon comes back into the loop.

P2 (18), grouped:

- **Migrations**: 9 unapplied 131-141 applied + verified 2026-06-09 [ef9d0d14, sibling 8d257201]. Wire `npm run migrate` into VPS deploy pipeline so drift cannot recur.
- **Cron-fleet** [b17ef6a4]: 28 stale duplicates deduped, 23 stuck `failed` reset to active, 8 residual failed need intent decisions. Apply systemic dupe guard: harden `cron_corpus_installer` to cancel via Postgres-direct, plus partial unique index `(name) WHERE status=active AND type=cron`.
- **Knowledge canaries**: PR #61 merged (DB unique index, scheduler-health canary 09:25 AEST, M2 glob coverage). The wider FABLE5 handoff at backend/docs/reference/FABLE5-HANDOFF-knowledge-system-and-self-maintenance-2026-06-10.md flags the canary scripts as on the wrong branch in the shared tree (relocate to ~/.ecodiaos/bin/ for branch-independence).
- **Supabase**: RLS disabled on Co-Exist + ROAM + 4 unnamed projects [609877de]. Audit grants done across 14 projects [ef9d0d14]; 10 of 11 repos with supabase/migrations need template adoption before Oct 30 2026 cutover [8d257201].
- **Revenue pipeline** [d9aa0aa8]: Cash runway 0.1 months at current burn ($1,771.96/mo) vs income ($1,468.98/mo). REVENUE CAPTURE NEEDED. The Cofound checkout (Tate-side row 87833a81) is the immediate lever; the Xero sync is the visibility lever.
- **Marketing / inbound**: ecodiaos-social-inbound-ingestion-cron [0a3a8bc1] still to build (30min poll across FB + IG + LI). Gmail-inbox-polling replacement [5129c018] dependent on scheduler stability.
- **Secrets** [7d44be0e]: Supabase service_role key rotation outstanding on Co-Exist project tjutlbzekfouwsiaplbr.
- **Climate-disclosure**: shipped yesterday (pages live at ecodia.au/climate-disclosure per memory). Not on the board today.

## 4. Threshold crossings overnight

- **Usage caps deferred 6 crons** between 12:13 and 12:19 UTC 2026-06-09 (~22:13 AEST): `sunday-strategic-pass`, `surfacing-rate-probe`, `zernio-analytics-watch`, `monday-business-pulse`, `evening-doctrine-pass`, `sunday-doctrine-synthesis`. AllAccountsCappedError on every recent attempt. Self-heals at cap reset. Backlog risk: this many tasks resuming together will thundering-herd the laptop-agent.
- Live scheduler counts (Postgres direct): active 49, dispatching 13, running 5, paused 3, cancelled 5. Healthy shape.
- Zero status_board rows flipped to RESOLVED then drifted in the last 24h.
- Zero P1s untouched beyond 7 days. The oldest P1 last_touched is `8c3199ea` (Lizz Hills) at 1.82 days. All five P1s are inside the 2 day window.
- Zero worker rows orphaned in the 36h window.
- One inbound message arrived during this turn (key `42f704d0-00de-4495-94da-38cb76bf17da`, no text body). Conductor inspects on session start.
- Five "voice / blocked: away_fetch failed" open cases on the conductor inbox, all five about Goodreach status. ASC probe already resolved them: build 6, marketing version 1.0. Conductor acks on session start.

## 5. Calendar today

Google Calendar API is disabled on project 8053004111 ("Google Calendar API has not been used... or it is disabled"). `calendar.list_events` returned an enable-required error. Cannot read today's calendar from this worker. Enable at https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=8053004111 and rerun, or read directly in the calendar app. Surfaced as a substrate gap.

## 6. Today's single act-immediately move

**Ship the Cofound Stripe checkout.** Row 87833a81. The dispatch-ready brief is already in the row from yesterday's pre-mortem worker:

1. `stripeAgentService.createPaymentLink({ product:'Cofound', amount:3500, currency:'AUD', success_url:'https://ecodia.au/cofound/thanks', account:'acct_1SWvWdCjJTDXevIj' })`. Service shipped at commit ee1d00c1, smoke-tested live.
2. Edit `ecodia-site/app/cofound` page CTA, replace the mailto block with a payment-link button.
3. `git commit + push EcodiaAU/EcodiaSite`.
4. Wait for Vercel READY.
5. CDP visual-verify the deployed URL. Mac CDP is the canonical path; the "deferred until Mac CDP bridge online" caveat in the row is stale per the Mac-canonical autonomy architecture (since 2026-06-08).

Why this move first. Revenue is the priority. Cash runway sits at 0.1 months, income $1,468.98/mo, burn $1,771.96/mo, and 100% of revenue is single-client concentrated. The Cofound product is priced at $3,500 AUD. One sale moves runway. The brief is ready, the service is shipped, the page is the one remaining edit. The 22 hour ship window from the pre-mortem worker passed without ship; the next ship window opens now. The bold-moves doctrine eliminates this from "conviction bets" because it is already on the board, which is the right call. It also flags this exact ship as the predecessor every other bold move depends on (a manifesto with no checkout is decoration).

Hard constraints to respect on the ship: no client contact required, no spend, the push sits inside the active EcodiaCode/EcodiaAU scope. Within autonomy.

---

## Reference

- Substrate quoted live from Postgres (`nxmtfzofemtrlezlyhcj`, status_board + os_scheduled_tasks) and Neo4j Aura (Episodes/Decisions/Reflections), 2026-06-10 01:18 UTC.
- Bold-moves doctrine: `backend/drafts/bold-moves-2026-06-08.md` (5 moves, all `brief-tate-first` for the public step).
- Top-move source: status_board row 87833a81 + cross-refs (d9aa0aa8 revenue pipeline, 9a372f74 Xero sync, 176c2f6f finance digest).
- Calendar gap: enable Google Calendar API on project 8053004111.
- Briefing run id: `cowork.daily_briefing_last_run.2026-06-10`. Task id `d55f68b2-6a7f-4368-80c1-d665cf187ab4`.
