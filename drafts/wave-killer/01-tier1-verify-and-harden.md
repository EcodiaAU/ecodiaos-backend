# Wave-Killer Worker 01 - Tier 1 verify and harden

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth. The original 2-3 week quiet build is collapsed to zero.

## Your scope: Tier 1 verify-and-harden

Recon shows Tier 1 of `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` is largely shipped on disk: migrations `0015_member_dues.sql`, `0080_xero_integration.sql`, `0100_becs_direct_debit.sql`, edge functions `chamber-member-dues-checkout`, `chamber-becs-mandate-setup`, `xero-oauth-callback`, `xero-oauth-start`, `xero-sync`, `dues-renewal-scan`, components `BecsSetupSheet.tsx`, `MemberDuesCard.tsx`, admin pages `DuesAdmin.tsx`, `IntegrationsAdmin.tsx`. The audit doc ranks these as Wave wins; it is stale.

Verify each component actually ships an end-to-end happy path against a real SCYCC-style tenant, then patch any genuine gaps. You are NOT rebuilding; you are confirming and hardening.

### Required end-to-end paths

1. Officer sets dues config (renewal lead, grace, overdue, lapse, GST rate, ABN, invoice prefix) in `DuesAdmin.tsx`. Confirm `tenant_dues_config` row writes.
2. Member opens app, sees `MemberDuesCard.tsx` with current period dues + status. Pays via Stripe Checkout (`chamber-member-dues-checkout` edge function). Confirms status flips to `current` + GST tax invoice PDF is generated (`generate-pdf` edge function) and reachable.
3. Member opens `BecsSetupSheet.tsx`, authorises a BECS direct debit mandate (`chamber-becs-mandate-setup`). Confirm `tenant_member_mandates` row writes with status `active`.
4. `dues-renewal-scan` runs (invoke via Supabase cron or manual), generates next-period dues row, charges off-session against the active BECS mandate. Confirm status flow current -> pending -> grace -> overdue -> lapsed timer fires per `tenant_dues_config`.
5. Officer connects Xero org in `IntegrationsAdmin.tsx` via `xero-oauth-start` -> `xero-oauth-callback`. Confirm `tenant_xero_connection` row stores tokens.
6. `xero-sync` pushes paid dues as GST-correct ACCREC invoice + payment. Confirm Xero invoice ID + sync status writes back to `tenant_member_dues.xero_invoice_id` and `xero_sync_status = 'paid'`.
7. Void a Xero invoice, confirm pull-back flips local `xero_sync_status = 'voided'`.

### Out of scope

- Push notifications (worker 02)
- EDM builder UI (worker 03)
- Aged-receivables reporting (worker 04)
- Analytics dashboard (worker 05)
- Bulk ops + dedup (worker 06)
- Events depth (worker 07)
- Tier 3 sweep (worker 08)

## The eight-rung process is non-negotiable

1. Research codebase: read every named migration, edge function, page, and component in full before touching anything. Check `D:/.code/chambers-frontend/.env.example` and the Supabase project config.
2. Plan: TodoWrite each of the 7 end-to-end paths. State per path: probe result + patch (if any) + verify result.
3. Write code: only the patches needed to close real gaps. No refactors. No speculative additions.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test` after each patch.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via the org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Use a test tenant. Confirm row writes via `db_execute`.
6. Visual verify via CDP: `gui.enable_chrome_cdp` -> `cdp.attach_tab` with alias `eos-tier1-verify` -> `cdp.navigate` to `https://chambers-frontend.vercel.app/admin/dues` (or the Vercel preview URL of your feature branch). Screenshot every path. Mobile viewport for `MemberDuesCard.tsx` and `BecsSetupSheet.tsx`.
7. Push: branch `feat/wave-killer-01-tier1-verify-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com` per memory `feedback_vercel_deploys_need_github_recognised_commit_author_2026-05-25`), push to remote.
8. Verify deploy: Vercel READY state on the preview deployment, canary screenshot saved, link added to your `[FORK_REPORT]`.

## Final actions before exit

- Update status_board: upsert a row tagged `wave-killer-tier1-verify-2026-05-29` with the end-to-end pass/fail matrix in `next_action`. Anchor row for the whole wave-killer arc is the Chambers go-to-market row (id `c42c927c-25c7-4d0a-bb30-4a52be025ef9`).
- Neo4j: write an Episode `wave-killer-tier1-verify-2026-05-29` summarising what was verified, what was patched, and what remains broken (if anything).
- Call `coord.signal_done({terminate:true})` then `coord.close_my_tab` as your final action so the IDE tab does not leak per `[[24x7-autonomy-architecture-invariants-2026-05-27]]` invariant 1.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md`
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` in auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`
- Supabase access doctrine: `D:/.code/EcodiaOS/backend/patterns/supabase-access-via-org-pat-local-store-2026-05-20.md`
- CDP launch doctrine: `D:/.code/EcodiaOS/backend/patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`

You inherit conductor context at spawn. Read the audit doc and the new-posture feedback memory before drafting your plan.
