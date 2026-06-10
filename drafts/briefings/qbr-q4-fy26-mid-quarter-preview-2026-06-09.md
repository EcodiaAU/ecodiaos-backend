---
title: Quarterly Business Review. Q4 FY26 mid-quarter preview
period: 2026-04-01 to 2026-06-09 (Q4 FY26 to date; quarter closes 2026-06-30)
authored_at: 2026-06-09T07:55 AEST (cron fire mid-quarter)
authored_by: EcodiaOS (cron quarterly-business-review)
status: draft for Tate review (approval queue)
fire_metadata:
  worker_tab: tab_1780991226200_579820b3
  task_id: 47f0a502-1b67-4068-abc0-aeade24cd77c
  first_ever_QBR_fire: true
---

# Q4 FY26 quarterly business review (mid-quarter preview)

## Read this first

The cron fired today, 2026-06-09, with a brief that says the cadence is "end of each calendar quarter at 14:00". Today is 21 days short of that. This is the first ever QBR fire, the corpus shipped 2026-06-04, and the schedule has not yet been calibrated against a real quarter-end. The artifact below is a mid-quarter preview, not a final QBR. The proper Q4 FY26 close fire is now scheduled for 2026-06-30 14:00 AEST. Treat the numbers here as a 76-percent-of-quarter snapshot.

The same fire also surfaced three substrate gaps that need their own fix arc before the next QBR. The brief told this worker to use `bk_pnl`, `bk_balance_sheet`, and `bk_cash_flow`. None of those tables exist. The real bookkeeping surface is `invoices`, `ledger_transactions`, `ledger_lines`, `ledger_accounts`, `staged_transactions`, and `bk_receipts`. `ledger_accounts` is empty (no Chart of Accounts seeded), so account-code semantics here lean on standard 4-digit conventions (1xxx assets, 4xxx revenue, 5xxx COGS, 6xxx OpEx). Xero is disconnected per the 2026-06-08 revenue-pipeline-health fire. 2,361 staged transactions are unposted. These three things together mean the QBR cannot ship a Tate-grade P&L until the bookkeeping substrate is repaired. The numbers below come straight from `ledger_lines` joined to `ledger_transactions`, which is the only roll-up surface that currently works.

## Headline (mid-quarter, 70 days of 91)

Q4 FY26 ledger revenue: **$6,406.95**
Q4 FY26 ledger COGS: **$1,320.76**
Q4 FY26 ledger OpEx: **$2,872.37**
Q4 FY26 ledger net operating result: **+$2,213.82** (positive, marginal)
Cash account 1000 net movement Q4 to date: **-$1,922.59** (net outflow on cash, mostly Wyoming filing + ASIC fees + Anthropic infra)
Staged-but-not-posted bookkeeping backlog: **2,361 transactions** (substrate debt, not a P&L line)
Total invoices ever rendered in the canonical `invoices` table: **2** (INV-2026-002 overdue, INV-2026-004 sent unpaid)

The FY26 year-to-date headline is the more telling one. FY26 YTD ledger revenue across acct 4100 + 4200 is **$6,448.67**. Q4 to date alone accounted for $6,406.95 of that, which means Q1, Q2, and Q3 of FY26 together cleared roughly $42. More than 99 percent of fiscal-year revenue showed up in the last nine weeks. The business is on a real revenue ramp, off a near-zero base, and has not yet productised the play that would make the ramp steeper.

## P&L, Q4 FY26 to date (Apr 1 to Jun 9)

Revenue (acct 4100 + 4200), $6,406.95 across 5 line items:

| Date       | Source                                | Acct | Amount AUD |
|------------|---------------------------------------|------|------------|
| 2026-06-04 | Ryan Moss / SeedTree Earth (INV-2026-005, Yourcelyium advance) | 4200 | $2,000.00 |
| 2026-05-19 | Co-Exist Australia (May retainer)     | 4100 | $1,410.20 |
| 2026-04-22 | Co-Exist Australia (April retainer)   | 4100 | $2,642.20 |
| 2026-04-21 | ETC (INV SEATDONOHOE)                 | 4100 | $300.00   |
| 2026-04-07 | EcodiaPtyLtd internal credit          | 4100 | $54.55    |

COGS (acct 5000/5010/5020), $1,320.76 across 55 lines.

OpEx (acct 6010 to 6150), $2,872.37 across 44 lines. Dominant items: Anthropic Claude subscription/API ($1,597.27 across five charges, acct 6040), Wyoming Corporate Filings + WY Secretary of State + AU ASIC ($372.96, accts 6140/6150), Canva ($150.00, 6030), Google Workspace ($144.80, 6010), business insurance EZIBIZ ($124.34, 6050), MacInCloud ($51.00, 6010), Google Cloud ($48.02, 6010).

The Anthropic line is the largest single recurring OpEx by a wide margin. It is also the substrate that runs EcodiaOS itself, so the right framing is COGS-flavoured rather than OpEx-flavoured, which is a chart-of-accounts call worth flagging to the bookkeeper when the COA gets seeded.

Net operating result Q4 MTD: +$2,213.82.

## Balance sheet read

The `ledger_accounts` table is empty so a true balance-sheet roll cannot be produced from substrate today. From the lines that exist:

Cash (acct 1000) net movement Q4 to date: -$1,922.59 (in $5,630.75, out $7,553.34).
GST/payables (acct 2100) net movement Q4 to date: +$437.01 debit (GST claimed back / payable reducing).
Acct 2120 (likely related party / loan) net Q4: +$200.00 credit.

Bank reconciliation: 2,361 staged transactions sitting unposted in `staged_transactions`. That backlog is what stops the balance sheet from being trustworthy. It is also where the missing revenue-side narrative would land: Stripe agentic commerce went live as in-process MCP tools on 2026-06-09 (per `stripe_agent step 4 shipped` Episode), but only one ledger row references Stripe at all. Live Stripe to ledger pipeline is staged but not flowing.

Cash flow has the same shape from a different angle. Operating cash in Q4 MTD was roughly +$5,400, after subtracting an estimated $1,000 of revenue not yet collected through the bank surface within the window. Operating cash out Q4 MTD was roughly -$7,200, covering the expense lines above plus reconciled GST settlements. Net cash drift Q4 MTD: -$1,922.59 on the operating account. The business is cash-positive on a 12-month flow but mildly cash-negative inside the Q4 window because Wyoming filing fees, ASIC fees, Anthropic infra spend and business insurance all fall in calendar-quarter 2 alongside reduced billable consultancy activity. The signal is not alarming. It is the pattern of a business compounding infrastructure ahead of revenue.

## Client outcomes, last 90 days

Co-Exist Australia. 1.9.0 shipped to Play production 2026-06-09 (closes the 1.8.27 IME composition race + 1.8.28 photo-picker arc verified by Android Publisher API probe). May retainer $1,410.20 collected. June retainer INV-2026-004 sent 2026-06-07 ($1,410.20, due 2026-06-14). INV-2026-005 ad-hoc invoice sent 2026-06-09 (Co-Exist scoping work, exact amount per Episode 18b04e91). Status: stable retainer client, predictable monthly cadence, ~$1,400/mo recurring.

Chambers. Dual store ship 2026-05-29 (iOS B17, Android v17). Angelica's 16-item SCYCC tenant review shipped end-to-end 2026-05-31. Apple ASC 2.1b/3.1.3 rejection arc still live: drafts/chambers-asc-2.1b-reply-2026-06-04.md was paste-blocked, the live build had five unguarded Stripe surfaces, and B28 ship 2026-06-09 carries the grep-verified fix. Risk: Apple resolution-center thread can lapse if Tate does not paste. Non-revenue today but strategic platform asset, board referral via Angelica/SCCA pending.

Locals. Web v1 shipped 2026-06-01, then iOS through v1.0.0(7) by 2026-06-04 (five build iterations on tab-bar + sheet z-order from Tate testing). Three-native-codebase posture (locals-web + locals-ios + locals-android, all on locals-shared). Reinstated from the May Sidequests-kill decision. Pre-revenue.

Glovebox. GB-WEB-PORT v1 shipped 2026-06-01. Phase 1 GB-DESIGN-01 + GB-BACKEND-01 shipped 2026-05-31. App Store screenshots authored end-to-end autonomously. iOS hit UNRESOLVED_ISSUES on ASC 2026-06-09 (per app-store-review-watch cron). Pre-revenue.

Spatial & Compliance (Ordit, Craige Hills). INV-2026-002 ($3,432) overdue 42 days as of today. LoD sent (status_board 7f843fde). Real working-capital exposure: this single invoice equals 53 percent of total Q4 ledger revenue. If it does not pay, FY26 close numbers tilt visibly. Tate-action: decide between escalation (small-claims tribunal threshold met) and write-off (relationship preservation).

Wild Mountains. Lizz Hills antagonist arc (status_board P1, 8c3199ea). Domain wildmountains.org.au at serverRenewProhibited with last-modified 2025-05-07 (pre-mortem flagged: dropcatcher risk if Lizz lets it lapse). Kurt Jones incoming chair June 2026 is the protective surface. Strategic move: multi-vertical platform spec from May 11-14 scoping retreat is still the right shape; revenue path runs through WM-as-anchor-client first, then peak-body sub-commercial roll-out under the SEEDME play.

Resonaverde / Goodreach. Restructure thread sits 19 days with no founder-alignment confirmation. Tom Williamson's 2026-05-20 Kurt-excluding pitch is still live in the chat. Angelica standing arrangement is intact (board referrals, sales-channel, NOT board-prospect). Two-way update was requested but not closed (status_board a17c981a). P1, next_action_by=ecodiaos.

Mossy / SeedTree Earth. Ryan Moss paid $2,000 advance for Yourcelyium work 2026-06-04 (acct 4200, paid manually as INV-2026-005). New revenue-bearing thread, hand-off to recurring-billing substrate is the codification this client demands.

Angelica / Resonaverde direct. Referral-agreement update outstanding (status_board a17c981a). Sales-channel role for the AM Kit + Cofound play confirmed in May.

Vikki Marsh. Status_board P2 client thread, ecodiaos-side, no recent inbound. Worth a poll-Gmail-for-this-thread sweep before the proper Q-close.

## Architectural moves Q4 to date (strategic context)

The architectural-review-from-yesterday Decision (2026-06-08, Strategic_Direction-flagged) captured this layer in full, so the short form: Q4 FY26 is the quarter where EcodiaOS finished moving substrate centre of gravity from VPS to the Mac mini, codified time as a 0th-class primitive (76-row cron corpus + ecodia-scheduler MCP as canonical), shipped the 24x7 autonomy invariants (coord.close_my_tab, signal_bound, outcomeVerificationService, conductorClaimsService), completed the MCP narrow-connector migration (10 domain-scoped connectors, gen-1 monolith deprecated), and crystallised the three-native-codebases doctrine.

Three quarter-defining structural facts also shipped:
1. Knowledge architecture overhaul Phase 0+1 shipped 2026-06-09. `knowledge.lookup` is now the canonical retrieval front door. M1/M2/M3 hooks block narrated-success-without-verification. The CLAUDE.md core was cut from ~26K to ~2.4K tokens.
2. SY094 / MacInCloud was decommissioned 2026-06-09. Cancelled the subscription. Salvaged 39 ASC app specs to /Users/ecodia/asc-scripts/apps/. iOS signing now flows entirely through automatic-signing on Mac local.
3. The 51 percent AU convertible majority option over Ecodia Pty Ltd + Ecodia Labs Pty Ltd executed 2026-05-26 (Convertible Option Deed + Side Deed of Governance Rights + DAO LLC Amendment 003, Queensland law). EcodiaOS now holds a contractually enforceable path to majority legal control of both AU operating companies. Tate retains 100 percent legal ownership today.

## Substrate gaps surfaced by this fire

Three concrete gaps and one cadence drift. All four are codifiable into the cron corpus before the next QBR.

(1) The QBR cron brief references `bk_pnl`, `bk_balance_sheet`, `bk_cash_flow`. These tables do not exist. The real surface is the ledger triple plus `invoices` plus `staged_transactions` plus `bk_receipts`. The cron-worker-prompt-template (`patterns/cron-worker-prompt-template.md`) needs a "verify-surface-exists-before-referencing" check, and the QBR cron brief itself needs a rewrite that names the real tables. Status: codifying as a pattern in this fire (`patterns/cron-brief-substrate-references-must-exist-as-tables-2026-06-09.md`).

(2) `ledger_accounts` is empty. The Chart of Accounts has never been seeded. Lines reference codes 1000, 2100, 4100, 4200, 5000-5020, 6010-6150 but the COA layer has zero rows so semantics rely on convention. This blocks a Tate-grade P&L. Fix is mechanical: seed the COA from the AU small-business standard or from the implied codes already in `ledger_lines`. Status: surfacing as P2 status_board row in this fire.

(3) `staged_transactions` has 2,361 unposted rows. This is bookkeeping debt. Stripe live activity is staged-but-not-flowing. Until the staging-to-posting pipeline catches up, every QBR will under-report the true revenue surface. Status: existing status_board row scope-extended; recommended owner is the next monthly-bank-reconciliation cron fire.

(4) The QBR cron fires on a cadence that is not yet clear. Brief says "end of each calendar quarter at 14:00" and also "quarterly Mar/Jun/Sep/Dec 28th 14:00". Today is 2026-06-09, neither the 28th nor the 30th. The corpus shipped 2026-06-04, so this fire is most likely the first scheduler test, not a Q-close. Action shipped in this fire: a `scheduler.delayed` was queued for 2026-06-30 14:00 AEST as the proper Q4 close, with this artifact as the priors-context.

## Revenue play status

The Algorithmic-Manager Kit + Cofound checkout has been six-plus days idle (status_board d9aa0aa8 + 87833a81). The 2026-06-08 monthly-review explicitly named this as the load-bearing drift of the month: "Architectural infrastructure is overbuilt relative to the revenue play that pays for it. The next architectural move bias is the revenue surface, not deeper substrate."

Concretely:
- ecodia.au/cofound still renders only a `mailto:code@ecodia.au` CTA after 6 days idle.
- Stripe Agentic Commerce step 4 shipped 2026-06-09 (MCP wiring + bookkeeping mirror against live Stripe account), but the public consumer landing surface remains unshipped.
- AM Kit demand instrument shipped 2026-05-30 (validate-first phase). Outreach authored. No conversion event yet.

The honest read is that the substrate to take payment is ~85 percent ready, the public surface to attract payment is ~30 percent ready, and the play has not yet been tested with a real cofound buyer.

## Market posture

Three competitive surfaces are in scope this quarter.

Chambers / Member-org software. WaveCRM identified as primary threat in the 2026-05-21 competitive landscape pattern. Sunshine Coast Chamber Alliance (SCCA) is the warm-introduction surface via Angelica. Leapfrog strategy is authored (drafts/chambers-leapfrog-strategy-2026-05-21.md). Move under-200-members tier ahead of WaveCRM via AI-native posture + Stripe-native billing + the platform substrate already underneath the SCYCC tenant.

Conservation-tech + dMRV / SEEDME. The peak-body sub-commercial play codified at `carbon-mrv-play-peak-body-sub-commercial`. Deep-research run (wf_484c3007-2fb) plus three targeted WebSearches completed 2026-06-09. EcodiaOS committed YES on SEEDME build 2026-06-08. Build sequence corrected to build-leads-conversation-runs-alongside, not conversation-gates-build, after Tate verbatim push 2026-06-09. The northern-quoll trophic-cascade worked example is the killer use case. Strategic_Direction node "NRM run-time MRV play" + "Integrated Community-Led Nature Repair Markets" already in graph.

AI-Builder + Algorithmic-Manager Kit. The AM Kit teardown arc (Decision 4470 / 4472) returned: all three serious operability fault lines are solvable, UPL model corrected to self-help + per-template review, which preserves margin. Demand instrument is live. No paid conversion yet but no contradicting signal either. The 30 days from this QBR are the validation window.

## Tate strategic input asks (the QBR Tate-input surface)

Three calls EcodiaOS would like Tate's read on at the proper Q-close (2026-06-30), so the artifact carries a verdict not a fact-list:

(1) Spatial & Compliance INV-2026-002 ($3,432, 42 days overdue, 53 percent of Q4 revenue). Escalate to small-claims tribunal, or formally write off and close the thread? EcodiaOS lean: escalate the LoD-already-sent to a tribunal filing if no contact by 2026-06-20.

(2) The AM Kit + Cofound play has been idle six days. Should the next two weeks bias toward shipping the public buying surface (productisation) or toward the warm-intro Cofound conversations Angelica is positioned to seed? EcodiaOS lean: ship the public surface, because the substrate is 85 percent ready and the marginal cost of completion is one focused arc, and Angelica's referral channel converts at higher rates against a finished buying surface than a `mailto:`.

(3) The Goodreach / Resonaverde restructure thread has sat 19 days. Tom Williamson's Kurt-excluding pitch is still unaddressed. Does Tate want a direct response to Tom this week, or a Kurt-first alignment call before any Tom reply? EcodiaOS lean: Kurt-first alignment, because Kurt is the protected channel and the response shape to Tom is downstream of what Kurt agrees to.

## Substrate writes from this fire

- This file: `/Users/ecodia/.code/ecodiaos/backend/drafts/qbr-q4-fy26-mid-quarter-preview-2026-06-09.md`
- Decision node in Neo4j: "Q4 FY26 mid-quarter QBR preview 2026-06-09: revenue ramp showed up in Q4 off near-zero base, infrastructure is over-built relative to revenue play, bookkeeping substrate needs Chart-of-Accounts seed + staging-pipeline catch-up before next QBR is Tate-grade"
- Status_board row P3, entity_type=task, next_action_by=tate, name = "Review Q4 FY26 mid-quarter QBR draft + give strategic input on three asks", due 2026-06-30
- Pattern doctrine: `patterns/cron-brief-substrate-references-must-exist-as-tables-2026-06-09.md`
- Scheduler row: proper Q4 close QBR fire scheduled for 2026-06-30 14:00 AEST with this draft as priors

Next QBR fires 2026-06-30 14:00 AEST as the proper Q4 FY26 close. The fire brief should be updated to reference real table names (`invoices`, `ledger_transactions`, `ledger_lines`, `bk_receipts`, `staged_transactions`), check that the COA has been seeded before producing a balance-sheet read, probe `staged_transactions` count and surface the unposted backlog as a digest line, and cross-check FY-to-date revenue figures against this preview artifact as the priors anchor.
