# Wave-Killer Worker 08 - Tier 3 reach extension sweep

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 3 reach extension (the whole tier)

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 3, ship the five reach-extension features tonight. Tier 3 is intentionally lighter than Tier 1 and Tier 2; each item below is a focused slice, not a maximalist build. Bias to credible v1.

### Required deliverables

1. **Open API + webhooks layer.**
   - New Supabase edge function `public-api` exposes a stable REST surface scoped per tenant: `GET /members`, `GET /events`, `GET /newsletters`, `POST /members`, `POST /events`. Auth via a new `tenant_api_keys(id, tenant_id, key_hash, scopes[], created_by, created_at, last_used_at)` table; key issued from `IntegrationsAdmin.tsx` as `chk_live_<32-hex>`, hashed at rest with SHA-256.
   - Webhook subscriptions: `tenant_webhook_subscriptions(id, tenant_id, url, events[], secret, last_status, last_fired_at)`. Events emit on `member.created`, `member.updated`, `event.created`, `dues.paid`. New edge function `webhook-fire` signs each delivery with HMAC-SHA256 over the JSON body, header `X-Chambers-Signature: t=<unix>,v1=<hex>`.
   - Officer-facing docs page at `/admin/integrations/api` with the key issuer, the webhook subscription manager, and a short reference covering the five GET / two POST routes.

2. **Document / file library.**
   - Supabase Storage bucket `tenant-documents` (per-tenant prefix). Schema migration `0180_documents.sql` adds `tenant_documents(id, tenant_id, owner_id, name, storage_path, mime, size_bytes, visibility, version_of_id NULL, created_at)`.
   - Visibility values: `public_tenant` (any member can view), `committee_<id>` (committee-scoped), `officer_only`.
   - Versioning: uploading a file with `version_of_id` set links the new row to the prior version; the prior version is preserved and visible from the new row's history.
   - New admin page `DocumentsAdmin.tsx` at `/admin/documents` for upload + visibility editing + version history. Member-facing read-only library at `/documents` (filtered by visibility).

3. **Custom fields / flexible member schema.**
   - Migration `0190_custom_fields.sql`: `tenant_custom_field_defs(id, tenant_id, key, label, type, options[] NULL, required, sort_order)` and `tenant_member_custom_values(member_id, field_id, value_json)`.
   - Field types: `text`, `multiline`, `select`, `multiselect`, `number`, `date`, `url`, `boolean`.
   - Officer manages defs in a new `CustomFieldsAdmin.tsx` page under Settings.
   - `Profile.tsx` and `MemberSignUp.tsx` render the defs dynamically; required defs gate save.
   - `MembersAdmin.tsx` exposes custom fields as filterable columns.

4. **Committee admin polish + group-scoped comms.**
   - `CommitteesAdmin.tsx` already exists. Verify the roster editor (add / remove member, assign role) is complete; patch if not.
   - New per-committee announcement composer: officer can compose a short broadcast (uses `RichTextEditor.tsx`) that emails + pushes to the committee roster only. Reuses `send-email` and `send-push` with a committee_id audience filter.
   - Per-committee chat thread: extend the existing focus-groups chat substrate (`0004_focus_groups.sql`) so each committee gets a private thread bound to its members.

5. **Custom domains + per-tenant SEO.**
   - Migration `0200_tenant_custom_domains.sql`: `tenant_custom_domains(tenant_id, domain TEXT PRIMARY KEY, verification_token, verified_at NULL, ssl_status)`.
   - Officer enters a domain in `BrandingAdmin.tsx`, gets a TXT record value to add at their registrar. A new edge function `custom-domain-verify` polls DNS, flips `verified_at` when the TXT matches.
   - On the Vercel side: register the document for a follow-up automation that adds the domain to the project via Vercel API (this is the manual gap that survives tonight - leave a `[FOLLOW-UP]` marker in `[FORK_REPORT]` and a status_board P3 row naming what is left for tomorrow).
   - Per-tenant SEO: `tenants` table gains `meta_title`, `meta_description`, `og_image_url`. `index.html` reads these via a `loadTenantMeta` shim or a server-side function on the public marketing site host.

### Out of scope for tonight

- Anything not in the five items above.
- Full Zapier app submission (covered by the public API + webhooks; Zapier app comes later).
- Vercel-side custom-domain attachment automation (left as documented follow-up).

## The eight-rung process is non-negotiable

1. Research codebase: read `src/pages/admin/IntegrationsAdmin.tsx`, `CommitteesAdmin.tsx`, `BrandingAdmin.tsx`, `Settings.tsx`, `src/pages/Profile.tsx`, `MemberSignUp.tsx`, `MembersAdmin.tsx`, `supabase/migrations/0004_focus_groups.sql`, `0008_chamber_signup_and_onboarding.sql`, every existing edge function under `supabase/functions/` for shared patterns.
2. Plan: TodoWrite all five deliverables with sub-items. This is a bulk worker; expect ~30 todos. Surface dependencies (eg. custom fields touches Profile, MemberSignUp, MembersAdmin).
3. Write code: migrations `0180_documents.sql`, `0190_custom_fields.sql`, `0200_tenant_custom_domains.sql`, edge functions `public-api`, `webhook-fire`, `custom-domain-verify`, admin pages DocumentsAdmin + CustomFieldsAdmin + the integration docs surface, committee announcement composer, dynamic field renderers in Profile and MemberSignUp.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests per edge function handler, dynamic field renderer, webhook HMAC signer.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Issue an API key, hit each GET / POST route, subscribe a webhook to a request-bin URL, fire a member.created event, validate signature. Upload a document, version it, change visibility. Define 3 custom fields, sign up a test member, verify required gating.
6. Visual verify via CDP: walk each new admin surface, screenshot. Resolve the per-tenant SEO change by viewing source on the public marketing host with a tenant subdomain.
7. Push: branch `feat/wave-killer-08-tier3-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshots of every new surface, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-tier3-2026-05-29` with deliverable matrix and a P3 follow-up row for the Vercel-side custom-domain attachment automation.
- Neo4j: Episode `wave-killer-tier3-2026-05-29` covering API + webhooks + documents + custom fields + committee comms + custom domains.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 3 (all five items)
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan. Bias to credible v1 across all five items rather than maximalist on one.
