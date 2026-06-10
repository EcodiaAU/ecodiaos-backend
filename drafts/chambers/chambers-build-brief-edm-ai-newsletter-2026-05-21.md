# Build brief: AI-native newsletter for Chambers

**Date:** 2026-05-21
**Codebase:** `D:/.code/chambers-frontend` (registered as `chambers-frontend`)
**Supabase project:** `arkbjjkfjsjibnhivjis`
**Tenants seeded:** `scycc`, `samplechamber`
**Worker context:** First Tier 1 + Tier 2 feature combined. Builds commodity EDM parity AND the AI cross-domain differentiator in one stream.

## Goal

Ship a chamber-side newsletter surface that does two things at once:

1. **Commodity parity with WaveCRM / Mailchimp.** Template-based campaigns, recipient segmentation, scheduled send, open + click tracking, unsubscribe handling.
2. **AI cross-domain composition.** Single button: "Draft this week's newsletter." Pulls from `tenant_events` (upcoming + just-finished), `tenant_members` (new joiners + recent renewals + at-risk lapses), `tenant_team` (sponsor news), recent `tenant_resources`. Feeds a Claude call. Returns a publishable draft the EO edits and sends.

The second one is the actual differentiator. Mailchimp + Eventbrite + Stripe siloed cannot do this because their data sits behind separate API boundaries. Our advantage is one tenant substrate.

## Existing surface (DO NOT rebuild)

- `BillingAdmin.tsx`, `EventsAdmin.tsx`, `MembersAdmin.tsx`, `BrandingAdmin.tsx`, `NotificationsAdmin.tsx`, `GroupsAdmin.tsx` exist.
- `tenant_events`, `tenant_members`, `tenant_team`, `tenant_membership_tiers`, `tenant_resources` schemas exist.
- Capacitor native app surfaces exist.

## New schema

```sql
-- Migration filename: 200_tenant_newsletter_campaigns.sql

CREATE TABLE tenant_newsletter_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_segment jsonb, -- e.g. {"member_status": ["active"]}, or full SQL filter ast
  ai_compose_context jsonb, -- inputs the AI used (event ids, member counts, etc) for audit
  ai_compose_prompt text, -- prompt that produced the draft
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_newsletter_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES tenant_newsletter_campaigns(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES tenant_members(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued, sent, opened, clicked, bounced, unsubscribed
  resend_message_id text,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  UNIQUE (campaign_id, member_id)
);

CREATE INDEX idx_newsletter_recipients_campaign ON tenant_newsletter_recipients(campaign_id);
CREATE INDEX idx_newsletter_campaigns_tenant_status ON tenant_newsletter_campaigns(tenant_id, status);

-- RLS:
-- Officers can CRUD campaigns for their own tenant.
-- Members can read their own recipient row.
-- Public unsubscribe endpoint updates recipient status without auth.
```

## New service

Path: `D:/.code/chambers-frontend/src/services/newsletterService.ts`

- `composeCampaignWithAI(tenantId)` — gathers cross-domain context (events, members, sponsors, resources), calls Claude via existing AI client, returns `{subject, body_html, body_text, ai_compose_context, ai_compose_prompt}`.
- `saveCampaignDraft(tenantId, campaign)`
- `scheduleCampaign(campaignId, scheduledAt)`
- `sendCampaignNow(campaignId)` — calls Resend API, populates recipients, tracks message ids.
- `recordOpen(messageId)` / `recordClick(messageId)` — Resend webhook handlers.

## Resend integration

- Account: register `chambers@ecodia.au` sending domain. Verify DKIM + SPF.
- API key in `kv_store.creds.resend_chambers` (rotate from Resend dashboard).
- Webhook endpoint: `POST /api/webhooks/resend/{tenant_id}` for open/click/bounce events.

## AI compose flow specifics

Cross-domain context fed to Claude:

```typescript
const context = {
  tenant: { name, branding, voice_profile },
  events_this_week: [{ name, date, status, rsvp_count }],
  events_just_finished: [{ name, date, attendance }],
  new_members_this_period: [{ name, business, joined_at }],
  renewals_this_period: [{ name, renewed_at }],
  at_risk_members: [{ name, days_since_engagement }],
  upcoming_sponsor_news: [{ sponsor, message }],
  recent_resources: [{ title, url }]
};
```

Claude prompt (sketch):

```
You are drafting a weekly newsletter for {tenant.name}, a chamber of commerce.
Voice: {tenant.voice_profile} (warm, professional, AU-local).
Audience: members of this chamber.

Context for this week:
- Events upcoming: {events_this_week}
- Events just finished: {events_just_finished}
- New members joined: {new_members_this_period}
- Members renewing: {renewals_this_period}
- Members at risk (haven't engaged 60+ days): {at_risk_members}
- Sponsor news: {upcoming_sponsor_news}

Compose a complete newsletter:
- Subject line (under 60 chars).
- Plain-text body (for accessibility).
- HTML body with chamber branding tokens (logo_url, primary_color, hero_color).

Do NOT mention members at-risk by name in the public newsletter. Use them only to inform tone (e.g. include a re-engagement prompt if 5+ at-risk members exist).
```

Output JSON-mode for deterministic parsing.

## New UI surface

Path: `D:/.code/chambers-frontend/src/pages/admin/NewslettersAdmin.tsx`

- Top: "+ Draft with AI" button. Click triggers `composeCampaignWithAI`. Shows skeleton while loading. Renders editable draft on return.
- Editor: subject input, body HTML editor (use existing `react-quill` or `tiptap` if installed; otherwise plain HTML textarea), preview pane.
- Segment selector: simple dropdown with prebuilt segments (`all members`, `active members`, `new members last 30 days`).
- Schedule vs send-now toggle.
- Sent-campaigns list with per-campaign open + click rates.

Mobile parity: keep the editor functional on phone. Most chamber EOs will compose on a phone.

## Testing

- Unit: `composeCampaignWithAI` returns valid JSON shape when given mock tenant data.
- Integration: schedule a campaign, fire the send job, verify Resend message ids populate.
- E2E: officer logs in to scycc, drafts AI newsletter, edits subject, sends to a test recipient, opens email, sees open recorded.

## Acceptance criteria

A scycc officer can:

1. Land on `/admin/newsletters`.
2. Click "Draft with AI", get a usable draft in <30 seconds.
3. Edit subject + body inline.
4. Schedule or send-now.
5. See open + click rates on the sent campaigns list.
6. Member receives a branded email styled to scycc's tokens.
7. Member can unsubscribe; status flips to `unsubscribed` and they're excluded from future sends.

## Worker scope boundaries

DO:
- Schema migration + service + admin UI + Resend wiring + AI compose flow.
- Test against `scycc` tenant.
- Commit + push to a feature branch `feat/ai-newsletter-2026-05-21`.

DO NOT:
- Touch other admin surfaces unrelated to newsletters.
- Modify the `tenants` row schema.
- Change pricing tiers or membership flow.
- Send any real test email outside the verified sandbox.

## Time budget

5-7 days part-time at our velocity. Worker should ship the migration + schema + AI compose + a working draft UI within 2 days. Polish + send pipeline + tracking by day 5. QA + Resend prod-domain verify by day 7.
