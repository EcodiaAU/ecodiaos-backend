---
status: draft
recipient: hello@coexistaus.org (Kurt Jones)
from: code@ecodia.au
gate: tate-goahead-required (no standing arrangement for Co-Exist)
suggested_send_window: 2026-06-13 to 2026-06-16 (5 to 7 days after INV-2026-005 went out, before renewal window opens 2026-07-07)
why_not_today: INV-2026-004 sent 2026-06-08, INV-2026-005 sent 2026-06-09. A check-in this week competes with two invoices in the same thread tree.
context_for_tate: |
  90-day post-ship check-in. App has been live many months; INV-2026-005 was for 2hr impact-stats
  export support, which suggests Kurt is actively using the impact data for grant acquittals.
  Retainer ends 2026-08-07; renewal verbally locked at Kurt's place 2026-05-17 (unify website + app
  + impact, replace Excel-sync mess with integrated impact substrate, reinstate $1,000/mo MS365
  support). This check-in surfaces real signal for that scope conversation without preempting it.
voice_register: outbound-Tate (plain, specific, warm without performance). No em-dashes. No NPS pattern.
---

# Co-Exist outcome check-in draft - Kurt

**Subject:** Co-Exist app check-in

Hi Kurt,

The app has been live and bedded in for a while now, and we're far enough past the last big push that you'll have a real read on it. Wanted to ask a few specific questions while it's a useful moment to ask them, ahead of the August retainer review.

A few things in particular:

1. Stats and the Impact Report. Are leaders and admins reaching for these, and is the data lining up with what funders ask for in acquittals? The recent ad-hoc export suggests yes on funders, but I'd value the colour.

2. Check-in window on event day - did the lifecycle change (leaders during, all attendees on the day, leaders only after, closing once impact is logged) match how the field runs events, or has it created friction we should round off?

3. Excel sync to the SharePoint master - is the sheet staying clean for the team that lives in it, or are you still working around dedupe edge cases or direction glitches?

4. Anything that's been quietly annoying you or the collectives that you haven't bothered to raise. The small ones are usually the most worth catching.

No need to write a thesis - dot points or a quick call works either way. Whatever's easiest.

Tate

---

## Feature-anchor notes (internal context only)

- Stats pages = `/admin/impact` + 3 sibling pages, all derive from `fetchImpactRows`; baseline floor 2026-01-01; drift detection nightly 02:00 AEST against the master sheet.
- Impact Report rewrite shipped in 1.8.12 build 48 (26 May 2026). 90-day pause makes this question well-timed.
- Check-in window lifecycle shipped 20 May 2026 via migration `20260520000000_post_event_checkin_backfill.sql`. Branch `feat/post-event-checkin-backfill-2026-05-20` was pending merge at the time of writing the manifest. **Verify it's actually merged + deployed before sending this email** so Question 2 doesn't ask about a feature Kurt hasn't received.
- Excel sync direction discipline: default `from-excel` (safe read). Forms rows are sheet-owned (rows 2-256, integer IDs). App rows are UUIDs. Dupe prevention sits on a partial unique index plus a fuzzy `findMatchingAppEvent` predicate. The April incident drove a backup-snapshot Supabase project that still exists.
- INV-2026-005 ad-hoc was 2hrs of impact-stats export for grant acquittals and applications. The "is the data lining up with what funders are asking for" question is grounded in that.
- MS365 tech support wasn't asked because the May 5hr (3 MS365 + 2 stats export) was billed across INV-2026-004 + INV-2026-005, so that surface is already in active dialogue.

## Verify-before-send checklist (Tate)

- [ ] Branch `feat/post-event-checkin-backfill-2026-05-20` merged into main and deployed (otherwise drop Question 2 or rephrase as "the change we're shipping").
- [ ] `app.coexistaus.org` returns latest build (Vercel `coexist` project, prod alias on main).
- [ ] No open P1 Co-Exist row on status_board that should be addressed before asking "what's not working" (avoid asking a question whose answer is "the thing you already know about").
