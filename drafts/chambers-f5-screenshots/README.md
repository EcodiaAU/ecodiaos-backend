# Chambers F5 — visual verification artefacts

Fork: `fork_mos0swkk_564f27` (redispatch after F5-original `fork_mos0mkrq_7e580c` credit-exhausted at 12:34 AEST 5 May 2026, before any tool calls).

## Why no localhost screenshots

The chambers frontend resolves the tenant via the request hostname's subdomain (see `src/lib/tenant/TenantProvider.tsx`). On plain `localhost:4174` the slug resolver returns nothing → `<TenantNotFound />` is rendered. So a localhost screenshot would only show the tenant-not-found page, not the F5 surfaces.

Visual verification path for F5 is therefore the path the brief specifies as the merge gate:
> "After push, poll Vercel deployment until READY or ERROR. **Do not declare done until Vercel READY.**"

That happens against the real subdomain (`scycc.chambers.ecodia.au`) where the tenant resolver succeeds and the F5 surfaces actually render with data.

## Static artefacts captured

- `build-manifest.txt` — `dist/assets/` listing showing the new lazy chunks emitted:
  - `NotificationsAdmin-*.js` (5.2 KB)
  - `PrivacyAdmin-*.js` (4.4 KB)
  - `BrandingAdmin-*.js` (15.0 KB, grew from F4 with hero-image upload + 3 new social fields + 2 sub-page links)
  - `Home-*.js` (13.0 KB, grew with hero-image background + 3 new social icons)
  - `Resources-*.js` (4.8 KB, grew with 3 new social-link entries)

## What F5 ships in code

### Migration `supabase/migrations/0007_tenant_admin_config_expansion.sql`
- `tenants.social_tiktok TEXT`
- `tenants.social_threads TEXT`
- `tenants.social_bluesky TEXT`
- `tenants.privacy_settings JSONB NOT NULL DEFAULT { show_event_attendees_publicly:false, show_member_list_publicly:false, allow_non_members_to_see_events:true }`
- `tenant_notification_settings` table + officer-RLS + `updated_at` trigger
- Idempotent (`IF NOT EXISTS` everywhere, `INSERT ... ON CONFLICT DO NOTHING` for seed)

### `src/pages/admin/BrandingAdmin.tsx`
- Hero image upload widget under the existing logo widget. Uploads to `tenant-assets/<tenant_id>/hero.<ext>` (storage RLS already in place from migration 0003). Cache-bust query string on the public URL.
- 3 new social fields: TikTok / Threads / Bluesky (free-text URL inputs in the existing Social section).
- 2 new "More settings" link cards routing to `/admin/notifications` and `/admin/privacy`.

### `src/pages/admin/NotificationsAdmin.tsx` (new)
- Reads/upserts `tenant_notification_settings` keyed by tenant_id.
- 4 fields: event reminder timing (1h / 6h / 1d / 2d / 3d / 1wk select), allow-member-mute toggle, push-on toggle, email-on toggle.
- Save uses `<Button>` from F2 design system + F4 `haptics.success/error` on save.

### `src/pages/admin/PrivacyAdmin.tsx` (new)
- Reads `tenants.privacy_settings` JSONB, coerces missing keys to safe defaults.
- 3 toggles: show member list publicly, allow non-members to see events, show event attendees publicly.
- Persists via `UPDATE tenants SET privacy_settings = ...`.

### `src/App.tsx`
- 2 new routes: `/admin/notifications` → `NotificationsAdmin`, `/admin/privacy` → `PrivacyAdmin`.

### `src/pages/admin/AdminLayout.tsx`
- 2 new nav tabs: "Notifications" + "Privacy".

### `src/pages/Home.tsx`
- Hero image renders behind the headline as `<img>` + dark gradient overlay when `tenant.hero_image_url` is non-null. Falls back to the flat-primary hero when null. Z-index handled via `relative` on the foreground.
- 3 new social-row icons: TikTok (Music2), Threads (AtSign), Bluesky (Cloud) — Lucide brand-icon set doesn't include these natively so closest-meaning icons are used until the design system ships custom marks.

### `src/pages/Resources.tsx`
- 3 new social-link cards: TikTok / Threads / Bluesky (matching Home).

### `src/lib/tenant/types.ts`
- `Tenant` extended with `social_tiktok`, `social_threads`, `social_bluesky`, `privacy_settings`.
- New `PrivacySettings` interface + `DEFAULT_PRIVACY_SETTINGS`.
- New `TenantNotificationSettings` interface + `DEFAULT_NOTIFICATION_SETTINGS`.
- `BrandingForm` Pick extended with the 3 new social fields.

## Build verification

- `npm run typecheck` — clean (no errors).
- `npm run build` — clean, all chunks emitted, ✓ built in 608ms.
- Vercel deploy verification follows after push.
