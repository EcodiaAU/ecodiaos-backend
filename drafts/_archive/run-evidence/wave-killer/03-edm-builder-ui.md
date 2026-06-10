# Wave-Killer Worker 03 - Branded EDM builder UI

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 2 modern AI-assisted branded EDM builder

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 1, Wave's single most-cited weakness across reviews is its "dated and clunky" EDM composer. The audit calls a modern branded builder a decisive win because Chambers already has AI compose (`newsletter-compose` edge function) plus `RichTextEditor.tsx` (Tiptap). Build the editor surface that turns those primitives into a real branded builder a chamber officer would prefer over Wave's.

### Required deliverables

1. A new admin route `/admin/newsletters/new` and `/admin/newsletters/:id` rendering a block-based composer. Reuse `RichTextEditor.tsx` (Tiptap) for prose blocks and add discrete block types: header image, headline, prose, member spotlight, upcoming events strip, event card, button CTA, divider, signature.
2. Each block reads tenant branding from `tenant_brand_customisation` (migration `0003_brand_customisation.sql`) so the rendered email matches the chamber's brand tokens automatically. No hand-rolled colour pickers.
3. AI assist button on every block: calls `newsletter-compose` (`supabase/functions/newsletter-compose/`) with the block kind, returns a draft. Member spotlight block accepts a member id and the AI auto-writes the spotlight from the member's profile.
4. Preview pane that renders the assembled email as HTML in an iframe, desktop + mobile viewports toggleable.
5. Save / schedule integration: `NewslettersAdmin.tsx` already lists newsletters; the builder writes to `tenant_newsletter_campaigns` (migration `0011_newsletter_campaigns.sql`) and flips status via existing edge functions `newsletter-send` and `newsletter-scheduled-fire`.
6. Test-send to officer's own email before broadcast. Reuses `newsletter-send`.
7. Engagement stats per send (opens, clicks) surface on the campaign detail. Schema column add if `tenant_newsletter_campaigns` does not already track them; `newsletter-webhook` (Postmark / Resend webhook) writes the counters.

### Out of scope

- Not the send infrastructure (`newsletter-send` already ships).
- Not the AI prompt design beyond what `newsletter-compose` already accepts.
- Not analytics dashboards across campaigns (worker 05 owns reporting).

## The eight-rung process is non-negotiable

1. Research codebase: read `src/pages/admin/NewslettersAdmin.tsx`, `src/components/RichTextEditor.tsx`, `supabase/migrations/0003_brand_customisation.sql`, `0011_newsletter_campaigns.sql`, every `supabase/functions/newsletter-*` directory.
2. Plan: TodoWrite each block type + each integration point + the preview iframe + the test-send + the stats roll-back.
3. Write code: new builder page + block components in `src/components/admin/edm/`, new route in the admin router, schema additions if needed (migration `0130_newsletter_engagement.sql` if engagement columns missing).
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests per block component + the preview rendering + the AI assist call shape.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Compose a campaign with every block type, save, test-send, broadcast to a one-member test tenant.
6. Visual verify via CDP: `gui.enable_chrome_cdp` -> `cdp.attach_tab` alias `eos-edm-builder` -> navigate to `/admin/newsletters/new` on the Vercel preview, walk every block, screenshot mobile and desktop preview panes.
7. Push: branch `feat/wave-killer-03-edm-builder-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshot of the new builder, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-edm-builder-2026-05-29` with deliverable matrix.
- Neo4j: Episode `wave-killer-edm-builder-2026-05-29` describing block types shipped + AI assist hooks + engagement stats path.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 1, Part 4 item 2
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`
- Brand aesthetic source of truth lives per-tenant in `tenant_brand_customisation`; no hardcoded palette.

Read the audit doc + the new-posture feedback memory before drafting your plan.
