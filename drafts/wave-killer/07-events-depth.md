# Wave-Killer Worker 07 - Events depth (waitlist, recurring, virtual, multi-tier, QR check-in)

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 2 events depth

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 5 and Part 4 item 9, Wave is thin on event depth and structurally cannot do native-app QR check-in. Chambers has a Capacitor native app; turn that into a decisive event-management win.

### Required deliverables

1. Capacity + waitlist on `tenant_events`:
   - Migration `0170_event_capacity_waitlist.sql` adds `capacity INT NULL` (NULL = uncapped), `waitlist_enabled BOOLEAN DEFAULT false`.
   - New table `tenant_event_waitlist(id, tenant_id, event_id, member_id, joined_at, promoted_at, promoted_ticket_id)`.
   - When `chamber-event-ticket-checkout` (existing edge function) hits capacity, the buyer is offered the waitlist instead of paying.
   - When an attendee cancels (refund flow on `chamber-stripe-webhook`), auto-promote the head of the waitlist + email them a 24h paywall link.
2. Recurring events:
   - `tenant_events` gains `recurrence_rule TEXT NULL` (RFC 5545 RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY, COUNT or UNTIL).
   - View `v_tenant_event_occurrences` materialises the next 90 days of occurrences per event so the public list page can show them.
   - `EventsAdmin.tsx` gets a recurrence picker; `EventDetail.tsx` shows the upcoming occurrence and a "see all dates" toggle.
3. Virtual events:
   - `tenant_events.virtual_url TEXT NULL` + `virtual_provider TEXT NULL` (`zoom|meet|other`).
   - Public list + detail show a Join button instead of a venue address when set. The button is RSVP-gated.
4. Multi-tier tickets:
   - `tenant_event_ticket_tiers(id, tenant_id, event_id, name, price_cents, member_price_cents, capacity NULL, sort_order)`.
   - `EventsAdmin.tsx` gets a tiers editor; `EventDetail.tsx` ticket purchase becomes tier-aware.
   - `chamber-event-ticket-checkout` accepts a `tier_id` and validates capacity per tier.
   - Existing single-price columns stay as a legacy fallback; new events default to a single auto-created "General" tier.
5. QR check-in via the native app:
   - Each successful ticket purchase writes a `tenant_event_tickets(id, event_id, member_id, tier_id, qr_token, redeemed_at NULL)` row with a server-generated short `qr_token` (HMAC of `(event_id, member_id, ticket_id)` truncated to 16 chars).
   - Member's `MemberHome.tsx` and `EventDetail.tsx` display the QR code (use a tiny zero-dep QR lib, eg. `qrcode.react` already pinned or `qrcode-generator`).
   - New officer-only page `/admin/events/:id/check-in` opens the device camera (`@capacitor/camera` is already pinned or use the browser MediaDevices API as fallback), scans QR via `jsQR` or equivalent, hits a new edge function `chamber-event-checkin` that validates the HMAC, sets `redeemed_at = now()`, returns the attendee profile card.
   - Officer sees a live attendees feed as people scan in.
6. Post-event survey (`event-recap-compose` already exists for the AI recap): add a tiny survey on the event detail 24h after end-time. One question: NPS 0-10 + optional comment. Writes to a new `tenant_event_feedback` table. Officer sees the rolled-up score on the event detail.

### Out of scope

- Bulk operations on events (worker 06 owns bulk on members).
- Newsletter / EDM (worker 03 owns).
- Tier 3 surfaces (worker 08 owns API + file library + custom fields + custom domains).

## The eight-rung process is non-negotiable

1. Research codebase: read `src/pages/EventDetail.tsx`, `Events.tsx`, `src/pages/admin/EventsAdmin.tsx`, `supabase/migrations/0012_paid_event_ticketing.sql`, `0090_event_member_pricing_and_vouchers.sql`, `0110_event_status.sql`, every `supabase/functions/chamber-event-*` + `event-*` directory, `chamber-stripe-webhook`.
2. Plan: TodoWrite each of the 6 deliverables. State per item: schema + admin UI + member UI + edge function + verify.
3. Write code: migration `0170_event_capacity_waitlist.sql` and the recurring + virtual + tiers + tickets schema changes; new edge function `chamber-event-checkin`; admin UI for tiers + recurrence + waitlist; member UI for QR + virtual join; check-in scanner page; post-event survey component.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests for the RRULE expansion (90-day window), the HMAC token, the waitlist promotion on refund, the tier capacity counter.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Create a recurring event with 3 tiers + capacity 2 + waitlist on, buy 2 tickets, third buyer hits waitlist, refund one of the two, confirm waitlist auto-promotes + email fires. Scan a QR token against the check-in function, confirm `redeemed_at` writes.
6. Visual verify via CDP: navigate to `/admin/events`, screenshot tiers + recurrence picker. As member, view a tier-priced event, buy a ticket, see QR, screenshot. As officer on a tablet viewport, open the check-in scanner page, screenshot.
7. Push: branch `feat/wave-killer-07-events-depth-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshots of all five paths, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-events-depth-2026-05-29` with deliverable matrix.
- Neo4j: Episode `wave-killer-events-depth-2026-05-29` covering waitlist + recurrence + virtual + tiers + QR check-in + survey.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 5, Part 4 item 9
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan.
