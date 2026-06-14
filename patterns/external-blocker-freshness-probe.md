---
triggers: next_action_by=external, external-blocker, stale-external-blocker, GST-blocker, ATO-blocker, ABR-blocker, Apple-Paid-Apps, ASIC-blocker, IRS-blocker, blocker-drift, blocked-on-external, external-freshness-probe
---

# External-blocker freshness probe - any external-blocked status_board row idle >14 days needs a real-world verification

## The rule

Status_board rows where `next_action_by = 'external'` go stale silently. External counterparties (ATO, Apple, Stripe, ASIC, IRS, banks, clients) update their own systems without notifying you. The blocker may have cleared weeks or months ago without any inbound signal you would notice.

**Threshold:** Any status_board row where `next_action_by = 'external'` AND `last_touched > NOW() - INTERVAL '14 days'` is FALSE (meaning idle 14+ days) MUST be probed against the real-world source before it appears on another morning briefing as still-blocked.

**Scope is wider than the `external` tag.** The failure class is "a row is waiting on a counterparty and nobody is probing", and the tag is not a reliable proxy for that. A row blocked on a counterparty can carry `next_action_by = 'client'` (client reply / signature / kickoff awaited) or even `next_action_by IS NULL` (mistagged at creation). Those rows are invisible to a query that filters on `'external'` alone, so they rot forever, which is exactly the origin failure (a real revenue blocker that was tagged but unprobed for 84 days). The probe MUST therefore sweep `next_action_by IN ('external','client')` AND scan the `NULL`-tagged backlog for external-waiting semantics (await / waiting / pending / review / verdict / submitted / approval / reply / response / ATO / Apple / Google / Stripe / broker / insurer / signature / locked-in / kickoff). Verified live 2026-06-14: 4 `external` + 2 `client` rows were all fresh (0-6d) and the closest-to-stale was Wildmountains at 6d, but a `client`-tagged blocker idle 20 days would have been silently missed by the old `external`-only query.

**Re-probe cadence:** every 14 days until the blocker either clears or the row archives.

## Why this happens

External-blocked rows are designed to be "leave alone, owner will update us." That is correct on day 0. By day 14+, that assumption is dangerous because external systems publish state changes silently. The cost of NOT probing compounds with time: revenue paths sitting unblocked, deals stalling on a phantom blocker that does not exist anymore, morning briefings that lie to Tate about what is actionable.

## Probe playbook by counterparty

- **ATO / GST / ABN state:** WebFetch `https://abr.business.gov.au/ABN/View?id=<ABN>` and read the GST section. No auth needed. 30 seconds.
- **Apple App Store Connect / IAP / Paid Apps Agreement:** GUI-only. Either probe via SY094 Mac via Tate (manual), or check for inbound email from `appstoreconnect@apple.com` / `noreply@email.apple.com` for state-change notifications.
- **Stripe state (e.g. account verification, payouts enabled):** Stripe API GET `/account` returns `charges_enabled`, `payouts_enabled`, `requirements`. Free, fast.
- **ASIC filings / company state:** ASIC Connect public lookup (free, GUI), or `https://abr.business.gov.au/` cross-references.
- **IRS / EIN / Wyoming SOS state:** Wyoming SOS public registry (free) for entity status, IRS does not publish state externally so probe by checking inbound mail for IRS letters.
- **Bank verification states (Up Bank, Mercury):** check inbound email or dashboard.
- **Client-blocked threads (waiting on client reply):** scan the most recent thread in Gmail for the client; if no reply in 14 days, downgrade priority + send a soft follow-up nudge AFTER Tate go-ahead per zero-unilateral-client-contact rule.

## Implementation - automate this

The probe should not depend on me remembering. It should be a cron:

```
schedule_cron name="status-board-external-freshness-probe" schedule="every 24h" prompt="
Query status_board for rows where next_action_by IN ('external','client') AND archived_at IS NULL
AND last_touched < NOW() - INTERVAL '14 days'. THEN separately scan the next_action_by IS NULL
backlog over the same 14-day threshold for external-waiting semantics (await / waiting / pending /
review / verdict / submitted / approval / reply / response / ATO / Apple / Google / Stripe / broker /
insurer / signature / locked-in / kickoff) so a mistagged blocker cannot rot invisibly.
For each row, probe the real-world source per the playbook in
backend/patterns/external-blocker-freshness-probe.md.
If the blocker has cleared, update the row to next_action_by='ecodiaos' or 'tate'
with the new actionable next_action, and write a Neo4j Episode capturing the unblock.
If the blocker is still real, update last_touched=NOW() and a fresh context note.
"
```

The canonical doctrine path is `backend/patterns/external-blocker-freshness-probe.md` on the Mac host. The `~/ecodiaos/patterns/` form is a Corazon-era ghost and does not resolve here per [[hook-substrate-must-track-canonical-host-not-corazon-ghosts-2026-06-10]].

Until that cron runs reliably, the manual rule is: every meta-loop, after reading the status board, sweep `WHERE next_action_by IN ('external','client') AND last_touched < NOW() - INTERVAL '14 days'` plus the NULL-semantics scan above, and probe each row.

## Do

- Probe ANY external-blocked row idle 14+ days before letting it ride into another morning briefing.
- When you find a stale-clear (blocker is actually gone), capture both the unblock event AND any updates needed downstream (other rows that referenced this blocker should also be revisited).
- Schedule the next probe (`schedule_delayed "in 14d"`) when you confirm the blocker is still real, so the cycle continues without relying on memory.

## Do NOT

- Do not assume `next_action_by = external` is "set and forget." External systems do not push you state changes.
- Do not trust kv_store memory files older than 14 days for blocker state. They were authored at a moment in time and the world moves on.
- Do not let a row sit external-blocked for >30 days without escalating to Tate "either probe or kill."

## Origin

2026-04-27 21:11 AEST. Roam IAP "blocked on GST" framing was on the morning briefing for Tue 28 Apr. ABR public lookup verified Ecodia Pty Ltd GST registered from 3 Feb 2026 - 84 days ago. status_board row "GST Registration" (id 17cfa84b) had been "in_progress / awaiting response" with last_touched 2026-04-23, 80+ days after the actual registration. kv_store `project_roam_iap.md` was authored 2026-04-08 saying "filed, ABR will update within days" - which was already 64 days after the actual ABR update. CLAUDE.md was correct ("Ecodia Pty Ltd... GST registered") but no system was probing reality. Real revenue path silently unblocked for nearly three months.

The lesson would have been "remember to check ATO" - that loses to silence over months. The lesson is: any external-blocked row idle >14 days gets probed automatically.
