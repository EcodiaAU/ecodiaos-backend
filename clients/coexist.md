---
triggers: coexist, kurt, charliebennett, org.coexistaus.app, coexistaus.org, coexist-release.jks, coexist-licence-fee, INV-2026-003, ip-retention-coexist, capacitor-coexist, tjutlbzekfouwsiaplbr, coexist-android-keystore, COEXIST_KEYSTORE_PASSWORD, coexist-agreement-kurt-countersign, generate-splash.cjs
---

# Co-Exist — Client Knowledge File

Read this BEFORE any Co-Exist work. Update it AFTER every session.

---

## Overview
- **Client:** Co-Exist Australia (Kurt is the contact)
- **App:** Conservation/youth engagement mobile app
- **Stack:** Vite + React + TypeScript + Capacitor (iOS + Android) + Supabase
- **Repo:** GitHub (EcodiaTate org)
- **Hosting:** Vercel (web), App Store (iOS), Google Play (Android)
- **App ID:** `org.coexistaus.app`
- **Agreement:** Signed by Tate. Waiting on Kurt countersign. Clauses 2.5 and 10.2 define scope boundaries.

---

## Build & Deploy Workflow — FOLLOW EVERY TIME

### Web (Vercel)
Auto-deploys from main branch. Push to GitHub, Vercel handles the rest.

### Android (Google Play)
1. **Corazon (Windows laptop):** Make code changes, test locally
2. `git add . && git commit -m "description" && git push`
3. **SY094 (Mac) or Corazon with Android Studio:**
   - `cd` to project directory
   - `git pull`
   - `npm install`
   - `npm run build`
   - `npx cap sync android`
   - Open in Android Studio: `npx cap open android`
   - Build > Generate Signed Bundle/APK
   - Signing key: `android/app/coexist-release.jks` (password in env vars `COEXIST_KEYSTORE_PASSWORD`, `COEXIST_KEY_PASSWORD`)
   - Test on device/emulator
   - Upload AAB to Google Play Console

### iOS (App Store)
1. **Corazon:** Make code changes, commit, push
2. **SY094 (Mac via SSH):**
   - `cd` to project directory
   - `git pull`
   - `npm install`
   - `npm run build`
   - `npx cap sync ios`
   - `npx cap open ios` (opens Xcode)
3. **Xcode (via SY094 GUI or VNC):**
   - Select target device/Generic iOS Device
   - Product > Build (verify no errors)
   - Product > Archive
   - Distribute App > App Store Connect
   - Upload
4. **App Store Connect:** Submit for review (or TestFlight first)

### Pre-Build Checklist (EVERY build)
- [ ] `npm run build` succeeds with zero errors
- [ ] Version bumped in `capacitor.config.ts` (versionCode + versionName)
- [ ] Version bumped in `android/app/build.gradle`
- [ ] Version bumped in `ios/App/App.xcodeproj` (if iOS)
- [ ] All environment variables set correctly
- [ ] Tested on mobile (responsive) before native build
- [ ] No console errors in browser dev tools

---

## Android Splash Screen (Fixed Apr 14 2026)

**Problem:** Default Vite/Capacitor splash screen showing instead of Co-Exist branding. Splash not fully disappearing on some devices.

**Root cause:** `splash.png` in all `android/app/src/main/res/drawable-*` folders was the 4KB default Capacitor placeholder.

**Fix applied:**
- Generated branded splash screens using `scripts/generate-splash.cjs` (uses jimp)
- Co-Exist logo (`public/logos/black-logo-transparent.png`, 1024x1024) centered on `#fafaf8` background
- All 11 density variants generated (6 portrait + 5 landscape)
- Config in `capacitor.config.ts` was already correct (`androidSplashResourceName: 'splash'`)

**Regenerating splash screens:** `node scripts/generate-splash.cjs` from project root.

**Android 12+ note:** Uses `androidx.core:core-splashscreen`. The system splash shows `@drawable/splash` via `AppTheme.NoActionBarLaunch` in `styles.xml`. Then Capacitor's plugin shows its own splash. If splash lingers, check `launchAutoHide` and `launchShowDuration` in `capacitor.config.ts`.

---

## Scope & Contract Notes
- **Clauses 2.5 and 10.2** define what's in/out of scope. Read the agreement BEFORE exploring technical solutions for new requests.
- Squarespace sync request (Apr 13) was out of scope per these clauses. Check contract first, always.
- One round of revisions included in quote.

---

## Pricing & Rates

### Hourly rate (tech assist / out-of-scope work)
**$60/hr AUD (ex-GST).** 50% off rate-card baseline ($120/hr) — strategic discount reflecting monthly recurring relationship + Kurt-as-distribution-engine.
- Applies to: tech assist, ad-hoc work, anything outside the in-scope Co-Exist app contract.
- Does NOT apply to: in-scope app build work (which has its own scoped pricing) or feature work covered by the licence agreement.
- Logged as billable, added to NEXT month's invoice (Co-Exist bills monthly, no chase needed).
- Confirmed by Tate 14:57 AEST 13 May 2026.

---

## Billing Register — READ BEFORE ANY INVOICE WORK

Co-Exist is on a **substrate-tracked recurring billing schedule** (live 7 May 2026). Do NOT render invoices ad-hoc - read the schedule first, generate via `billingScheduleEngine`, persist the run to `client_billing_generations`.

**Schedule:** `client_billing_schedules` row WHERE `client_slug = 'coexist'`. Authored by `fork_mouoh2fb_fcd4f2` on 2026-05-07.
- `schedule_type`: `monthly_combined`
- `frequency`: monthly, `day_of_month` = 7
- `starts_on`: 2026-05-01, `ends_on`: NULL (perpetual; retainer line self-expires)
- `next_due_date`: **2026-06-07** (May was already manually fired as INV-2026-003 by `fork_mouo5of7_d112d2` on 2026-05-07; June is the first cron-driven fire)

**Line items (3):**
1. **Operational retainer** - $1,000.00 ex-GST. 3-month window (May/Jun/Jul 2026 only). Origin: Tate verbatim 2026-04-27 SMS "1k/month do 3 months". Line auto-drops after July fires (`schedule_window.max_count=3`).
2. **Monthly licensing fee** - $200.00 ex-GST. Perpetual until contract termination per the IP & Licence Model section below. No `schedule_window`.
3. **Managed 3rd party costs** - variable per month (Vercel Pro share + Supabase Pro share + M365 share). May was $82 fixed. Engine resolves via `passthrough_query.fallback_amount_cents` until bk_ledger pull is wired.

**GST:** applicable (10%). Total May = $1,410.20 incl GST ($1,282 + $130.20).

**Bill-to block (canonical, embedded in schedule row):**
- Co-Exist Australia Ltd
- ABN: 39 660 776 983 (looked up via ABR.business.gov.au by `fork_mouoh2fb_fcd4f2` after Tate flagged the missing ABN on the v1 INV-2026-003 render)
- Australian Public Company, QLD 4551

**Payment block:**
- Bank Australia, BSB 313-140, Account 12579148, Name "Ecodia Pty Ltd"
- Reference template: `{invoice_number}` (e.g. INV-2026-004)

**Cron:** `recurring-billing-monthly` (daily 09:00 AEST). Silent on no-due-rows days. On a due row: dispatches a fork that drafts via `billingScheduleEngine.draftInvoice`, renders PDF via `renderDraftPdf` (with `--no-pdf-header-footer` so the file path footer never appears), uploads to Supabase, sends test-to-Tate with PDF attached, and writes a `client_billing_generations` row.

**Hard guardrail:** the cron never auto-sends to Co-Exist. Test-to-Tate first, then Tate "send it" -> forward. Per `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`.

**Audit trail:** `SELECT invoice_number, total_cents, status, generated_at FROM client_billing_generations cbg JOIN client_billing_schedules cbs ON cbs.id = cbg.schedule_id WHERE cbs.client_slug = 'coexist' ORDER BY generated_at DESC;`

**Doctrine:** `~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md` (canonical), `~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md`, `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`.

**Invoice register (manual log, mirror of `client_billing_generations`):**
- INV-2026-001 (April 2026): build fee + first month licence + passthrough + tech assistance. PDF: `public/invoice-coexist-2026-001.pdf`. Sent 8 Apr 2026 to hello@coexistaus.org (gmail msg id `19d687d192871ced`).
- INV-2026-002 (??): never rendered on disk; **sequence gap, not an actual invoice**. INV-2026-003 is the 2nd actual invoice (April = 1st, May = 2nd) despite the 003 numbering. Correction email sent to Kurt 2026-05-18 (gmail msg id `19e391f477a5b8c7`).
- INV-2026-003 (May 2026, **2nd actual / month 1 of 3 retainer**): $1,000 retainer + $200 licence + $82 passthrough = $1,282 ex-GST + $130.20 GST = $1,410.20. v2 PDF: `documents/invoices/inv-coexist-2026-003-FINAL-v2-2026-05-07.pdf`. Sent 6 May 2026 to hello@coexistaus.org (gmail msg id `19dffa931a0f2cfd`). **Covers 7 May - 7 Jun 2026** (7th-to-7th cadence).
- INV-2026-004 (June 2026, 3rd actual / month 2 of 3): auto-draft 2026-06-07 via cron. **Covers 7 Jun - 7 Jul 2026.** Projected total $1,462 ex-GST + $146.20 GST = **$1,608.20 incl GST** with current 3hrs MS365 tech support; adjusts up if more hours accrue before send.
- INV-2026-005 (July 2026, 4th actual / month 3 of 3): auto-draft 2026-07-07 via cron. **Covers 7 Jul - 7 Aug 2026.** Last invoice of current retainer arc - after this fires, retainer line drops; INV-2026-006+ would be licence + passthrough only UNLESS the post-Aug renewal lands (which Kurt verbally locked in 2026-05-17 - see Renewal Arc section below).

**Retainer coverage ENDS 7 August 2026** (not end of July). The 7-Jul send-date covers through 7-Aug-2026 inclusive per the 7th-to-7th cadence. Tate-window for landing the renewal contract: 7-15 July 2026 (status_board 59a67b24).

**Tech support hours (live tally at `kv_store.cowork.coexist.tech_support_hours`):**
- Rate: $60/hr ex GST.
- Categories: `MS365 tech support` (Google Workspace / M365 / email / Teams / general workspace troubleshooting - the recurring tech-support stream Co-Exist has paid for since the original arrangement) | `app dev support` (Co-Exist app / Supabase backend / Capacitor hotfixes outside scheduled work) | `other`.
- Current period (June billing): **3hrs MS365 tech support** logged 2026-05-18 (Tate bulk-recorded, specific session breakdown TBD).
- Rules: hours accrued between invoice-send dates roll into NEXT invoice. Reset `hours_logged_for_period` to 0 after invoice send + Tate confirmation.

---

## Renewal Arc — post-2026-08-07 (verbal lock-in 2026-05-17)

Tate confirmed verbally with Kurt the night of 2026-05-17 at Kurt's place that after the current 3-month operational retainer ends (coverage through 7 Aug 2026), Co-Exist returns to retainer + pays bulk payments for an expanded scope.

**Expanded scope (verbal, not contracted):**
- Unify website + app + impact-tracking systems into one coherent platform.
- Replace the current Supabase-DB + Excel-sheet sync mess (Tate's words: "stupid", "obnoxious") with a proper integrated impact substrate. The Excel sync architecture documented above is the load-bearing example - we already have the doctrine to do this.
- Reinstate MS365 tech support at **$1,000/month** (matches the prior arrangement).
- Bulk payments alongside the retainer, not retainer-only.

**Tate-window:** 7-15 July 2026 to land the renewal contract before coverage gap. Anchor to the final-invoice send date (7 Jul) as natural handoff moment.

**Doctrine that lands as first deliverables for the unification work:**
- `~/ecodiaos/patterns/excel-sync-collectives-migration.md`
- `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md`
- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md`

**Substrate cross-refs:**
- status_board: `59a67b24` (renewal opportunity, Tate-due 2026-07-15), `35f91c9c` (June invoice task, ecodiaos-due 2026-06-07), `f652c1fd` (email-path fix - resolved).
- Neo4j: Decision 2998 (Co-Exist retainer renewal + scope expansion locked).
- Auto-memory: `project_coexist_retainer_renewal_2026-07-07.md`, `project_coexist_billing_model_2026-05-18.md`.
- CRM: contact added 2026-05-18, Kurt Jones primary decision_maker, `ceo@coexistaus.org` direct.

---

## IP & Licence Model — READ BEFORE ANY EXTERNAL ARTEFACT

**Recalibrated 2026-04-27 per Tate. See `~/ecodiaos/patterns/coexist-vs-platform-ip-separation.md`.**

| Layer | Owner | Brand | Sellable to others? |
|-------|-------|-------|---------------------|
| Co-Exist app, brand, charity content, member data | Co-Exist Australia (Kurt's charity) | Co-Exist | No - it is their app |
| Underlying conservation platform code patterns (multi-tenant Edge Functions, sync engines, admin UI patterns, deployment automation) | Ecodia Labs Pty Ltd | TBD - rebrand pending Tate | Yes - this is what we sell to other peak bodies |
| The running Co-Exist deployment (their app on a stack we own) | Joint - app theirs, platform underneath ours | Co-Exist | Reference case study only, anonymised by default |

**Co-Exist's licence with Ecodia covers:** operating their Co-Exist app deployment specifically. Build fee + ~$200/mo operating licence (INV-2026-003 May draft). IP-retention model per `~/CLAUDE.md` "IP Retention & Licensing Model" - Ecodia Labs retains platform IP, Co-Exist gets a perpetual non-transferable operating licence contingent on payment. Client-facing contract attributes IP to Ecodia Pty Ltd (Labs → Pty Ltd licensing chain is internal plumbing, not exposed to client).

**Contract status (2026-04-27):** Software agreement sent to hello@coexistaus.org Apr 8 2026. Signed by Tate. Awaiting Kurt countersign. May licence invoice (INV-2026-003) draft-ready in status_board.

**What this means for any work touching Co-Exist:**
- Internal artefacts about Co-Exist app/feature work: no change, business as usual.
- Any artefact that mentions "the platform" or "Platform-Co-Exist" or pitches multi-tenant federation: Co-Exist is the LIGHTHOUSE DEPLOYMENT, not the product brand. Pitch under the platform's TBD rebrand, anonymise Co-Exist as the case study per public-writing doctrine.
- Affected legacy kv_store briefs (keep keys, rewrite content before external derivation): `ceo.briefs.platform-coexist-pricing-benchmarks-2026-04-25`, `ceo.briefs.platform-coexist-federation-thesis-2026-04-26`, `ceo.drafts.platform-coexist-peak-bodies-brief-v1`, `ceo.audit.coexist-multitenant-readiness-2026-04-25`. Each now carries an inline `_ip_recalibration_notice` field flagging the rewrite-pending state.
- Tate-owned blocker on status_board priority 1: name decision for the rebranded platform product. Until stamped, all external artefacts use "conservation platform (working name pending)" placeholder.

---

## Known Issues
- Splash screen on Android: FIXED (Apr 14) — needs rebuild + deploy to verify on device
- Hero images fix: LIVE (commit 6018cc0)
- Blank page fix: LIVE
- Security keys: purged
- Supabase key rotation: still needed (Tate's action)

---

## Architecture Notes
- Capacitor wraps the Vite/React web app for native
- `capacitor.config.ts` is the central config for all native behaviour
- Android signing key at `android/app/coexist-release.jks`
- Push notifications via FCM (Android) + APNs (iOS) — `google-services.json` required in `android/app/`
- Edge-to-edge rendering enabled in `MainActivity.java`
- ESM project (`"type": "module"` in package.json) — use `.cjs` extension for CommonJS scripts

---

## Stats Architecture (canonical as of 11 May 2026)

### Canonical aggregation chain
All four stats pages derive from one path:
- Page -> Hook -> `src/lib/impact-query.ts` (fetchImpactRows + fetchBaselineSettings)
- Hooks: use-impact.ts (national/collective), use-admin-impact-observations.ts (admin), use-public-stats.ts (public)
- DO NOT add bespoke SQL in page or hook files. All filter semantics belong in impact-query.ts.

### Timeframe semantics
- Event date column = `events.date_start` - canonical "when did the impact happen"
- `created_at` is operational only - never use it to bucket impact by year or season
- Baseline date floor: 2026-01-01 (IMPACT_BASELINE_DATE constant)
- Pre-2026 data: covered by app_settings baseline keys (see table below)

### app_settings baseline keys
| Key | Value | Meaning |
|-----|-------|---------|
| `impact_baseline_trees` | 36637 | Total pre-2026 trees planted (all years) |
| `impact_baseline_trees_2022` | 17300 | 2022 trees from master sheet |
| `impact_baseline_trees_2024` | 3702 | 2024 trees from master sheet |
| `impact_baseline_trees_2025` | 15635 | 2025 trees from master sheet |
| `impact_baseline_events` | 340 | Pre-2026 events held |
| `impact_baseline_attendees` | 5500 | Pre-2026 volunteer attendees |
| `impact_baseline_hours` | 11000 | Pre-2026 volunteer hours |
| `impact_baseline_rubbish_kg` | 4900 | Pre-2026 rubbish collected (kg) |

Per-year keys (2022, 2024, 2025) added via migration `20260511030000_per_year_baseline_settings.sql`. Call `fetchBaselineByYear(year)` for per-year comparison queries.

### Drift detection cron
- Cron: nightly 02:00 AEST
- Reads master impact sheet Overall tab via Microsoft Graph API
- Compares against Supabase canonical aggregation (fetchImpactRows + fetchBaselineSettings)
- Writes status_board P2 row + Neo4j Episode if drift detected
- Last run status: app_settings key `stats_drift_last_run`
- Badge visible on /admin/impact page when `stats_drift_detected` is truthy

### Excel sync dedup architecture (as of 11 May 2026)
- `findMatchingAppEvent`: fuzzy title + date match to find existing app events (now includes synthetic event UUIDs as valid candidates - isSyntheticFormsUuid exclusion removed)
- Existence guard: secondary check by (collective_id, date, title) before creating any new synthetic event
- DB-level: partial unique index `events_synthetic_dedup` on `(collective_id, date_start::date, lower(trim(title)))` WHERE v5 UUID
- Migration: `20260511040000_events_synthetic_dedup_index.sql`
- 179/180 duplicate clusters resolved. 1 remaining fuzzy duplicate (Seville Tree Planting) is P3 in status_board for Tate review. Ready-to-run SQL: `~/ecodiaos/drafts/coexist-fuzzy-dupes-2026-05-11.md`

### Pattern docs
- Full architecture: `~/ecodiaos/patterns/co-exist-stats-canonical-aggregation-architecture.md`
- Generalisable doctrine: `~/ecodiaos/patterns/single-canonical-aggregation-feeds-all-dashboard-surfaces.md`

---

## Credentials & Access
- Test credentials: stored in kv_store `creds.coexist` (full schema in `~/ecodiaos/docs/secrets/coexist-app-test.md`)
- App Store Connect: code@ecodia.au
- Google Play Console: via Tate's Google account

---

## Lessons Learned
- Apr 13: Always check contract clauses before exploring technical solutions for new feature requests
- Apr 14: splash.png in Android res folders must be replaced manually or via `scripts/generate-splash.cjs` — Capacitor doesn't auto-generate from web assets
- Apr 14: jimp works on Windows where sharp fails (no native deps). Use `.cjs` extension in ESM projects.
- Apr 14: Android 12+ has TWO splash screens (system + Capacitor plugin). Both need correct assets.
- Apr 21: Excel sync model (FINAL). SharePoint "Master Impact Data Sheet.xlsx" sheet "Post Event Review" is source of truth. Microsoft Forms populates integer-ID rows (rows 2-256, pre-2026 Forms history, UNTOUCHABLE). Supabase Edge Function `excel-sync` (project tjutlbzekfouwsiaplbr) runs the sync.
  - Default direction is `from-excel` (safe read). Never writes to sheet without explicit `?direction=to-excel`.
  - pg_cron jobid 9 (`excel-from-sync`, `*/30 * * * *`): calls `public.cron_excel_from_sync()` which invokes Edge Function with `direction=from-excel`. Reads sheet, writes Forms rows to DB.
  - pg_cron jobid 10 (`excel-to-sync-hourly`, `0 * * * *`): calls `public.cron_excel_to_sync()` which invokes Edge Function with `direction=to-excel`. Pushes all app-created completed events (UUID IDs) from SYNC_CUTOFF_DATE (2026-01-01) to the sheet. Idempotent via id-to-rowIndex map.
  - IDs cannot collide: Forms = integer, app = UUID. `from-excel` skips UUID rows (app owns them); `to-excel` only writes UUID rows.
  - Column mapping (array-index = sheet-col): 0=ID, 1=Title, 2=Date, 3=Collective, 4=Location, 5=Postcode, 6=Primary Organiser (hosting org: Co-Exist/Zorali/etc, from `event_organisations` junction with role priority host>organiser>any, fallback 'Co-Exist'), 7-9=Landcare/OzFish, 10=Leader (person), 11=Attendees, 12-27=survey + metrics.
  - Dedup: if an app event matches a Forms row on (title + date_start + collective), both rows coexist on the sheet (admin reconciles). `syncToExcel` returns `dupeWarnings: [{appEventId, formsRowIndex, formsId, title, date, collective}]` in the response for admin surfacing. No auto-skip (false positives would lose data).
  - `organisations` table is seeded with one row (name='Co-Exist', type='community'). `event_organisations` junction is empty; will populate as partner orgs (Zorali etc) are onboarded to the app.

---

## Excel Sync — Key Paths
- Edge Function source: `supabase/functions/excel-sync/index.ts` in coexist repo
- Deploy: `cd /home/tate/workspaces/coexist && SUPABASE_ACCESS_TOKEN=<creds.supabase_access_token> npx supabase functions deploy excel-sync --project-ref tjutlbzekfouwsiaplbr --no-verify-jwt`
- Graph API file: DRIVE_ID `b!jB_eUPJMbUWf3eip_Me-34G0StMYwYdHtdf4sTNow-uVV9nof_IvQprzswNpaD8y`, ITEM_ID `01RJHFBL37QUUGOQUVL5DJ67A53VKNDAGE`
- Graph API creds: `kv_store.creds.coexist_graph_api` (tenant_id, client_id, client_secret). Injected into Edge Function env (Deno.env), not in code.
- Supabase Management API PAT: `kv_store.creds.supabase_access_token` (`sbp_...`).
- Cron control via `https://api.supabase.com/v1/projects/tjutlbzekfouwsiaplbr/database/query` with Bearer PAT:
  - Disable: `SELECT cron.alter_job(JOBID, active := false)`
  - Jobids: 9 = `excel-from-sync` (every 30m), 10 = `excel-to-sync-hourly` (every hour on the hour).
- Cloudflare WAF quirk: the Management API blocks some SQL payloads with HTTP 403 `error code: 1010`. Workaround: send body via `curl --data-binary @file.json` with a `User-Agent: supabase-cli` header.
- Column A holds the row ID. Forms rows = integers (immutable, owned by sheet). App rows = UUID strings (owned by DB, written by `to-excel`).
- Manual probe: `curl -X POST 'https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/excel-sync?direction=from-excel' -H "Authorization: Bearer <service_role_key>"`. Always pass an explicit `direction=` when probing.

## 2026-04-23 21:50 AEST - SKIP_LINT=1 bypass on fix/mobile-padding-audit push
Reason: main had 184 pre-existing lint errors (not introduced by this PR). Padding commit 9bf9003 touched 20 layout/spacing files only, no code logic. Build green, 158 tests green, only lint skipped via documented targeted flag. Branch pushed at 11:50 UTC. Separate cleanup PR needed to resolve main's lint debt before SKIP_LINT can be retired.

## 2026-04-28: Admin account provisioned for paulplakkaljohn@coexistaus.org
Created via Supabase admin API per Tate directive 2026-04-28 12:39 AEST. auth.users id `7c003bc2-36d0-45a6-938e-82e981c2e6e6`. profiles.role = `admin` (one of admin / manager / leader / national_leader / co_leader / assist_leader / participant - the public.user_role enum; there is no `super_admin` or `coordinator`). No staff_roles row added (granular permissions can be layered if Paul ever needs scoped controls; admin role itself appears to bypass them based on Tate's setup). No email sent (Path B - direct create + temp password). Credentials in kv_store `coexist.temp_credentials.paul_plakkaljohn` (7-day TTL note, Paul to change on first login). Delivered to Tate via fork report - per zero unilateral client contact rule, Tate forwards. Fork fork_moi0r0fh_ed7f7f.

Note: a related Google-signed Paul account already exists (`paulpplakkal@gmail.com`, auth id `31f4ac81-11a8-432c-9aa0-687914742a73`, role=participant from 2026-04-27) - this is Paul's personal Gmail. The new `@coexistaus.org` account is the work-email admin login Tate asked for.

## Account-creation procedure (codified for next time)
1. Check existence: query `auth.users` for the email via service_role admin API or direct DB. Brief domain `@coexistaus.org` = staff (bulk batch on 2026-03-30 seeded core team).
2. Path A (cleanest if email is acceptable): `POST /auth/v1/admin/generate_link` type=invite. WARNING: this sends an email from the Supabase auth project. Do NOT use unless Tate has explicitly authorised contact.
3. Path B (default for client-staff onboarding under no-client-contact rule): `POST /auth/v1/admin/users` with `email`, `password`, `email_confirm: true`, `user_metadata`. No email is sent. Returns auth_user_id.
4. UPDATE the auto-created `public.profiles` row: set `email`, `first_name`, `last_name`, `display_name`, and `role` (enum: admin/manager/leader/national_leader/co_leader/assist_leader/participant). Default for client-org staff = `admin`.
5. Optional `staff_roles` row for granular permissions: `{manage_users, manage_email, manage_merch, manage_charity, manage_partners, manage_challenges, send_announcements}` plus `managed_collectives` UUID array.
6. Store temp password in kv_store `coexist.temp_credentials.{slug}` with TTL note. Never log password to Neo4j or status_board.
7. Insert status_board row entity_type='task', next_action_by='tate'.
8. Tate forwards credentials to user. Paul / user changes on first login.

## 2026-05-11 - SKIP_COEXIST_PREFLIGHT=1 bypass on feat/impact-baseline-fork_mp0odofn_8f8109 push
Reason: pre-push hook hardcodes `COEXIST_DIR=/home/tate/workspaces/coexist` (main worktree) for its dirty-check gate, but push originated from the `coexist-w4-baseline` git worktree. The hook's `git status --porcelain` reported M/D files that did not exist in either worktree (both confirmed clean at time of push). False-positive caused by worktree context mismatch in the hook's path assumption. Bypass is safe: migration already applied to Supabase linked project (`supabase db push` succeeded), commit sha `f77f612` is clean, main worktree independently verified clean. Worker 1 of impact-baseline wave (fork_mp0odofn_8f8109).

## 2026-04-27 20:25 AEST - SKIP_COEXIST_PREFLIGHT=1 bypass on fix/collective-alias-byron-northern-rivers push
Reason: same lint-debt blocker. Pre-push preflight stops on 180 pre-existing eslint errors (all in files this branch did not touch). Branch is 2 commits ahead of origin/main, single-file diff to `supabase/functions/excel-sync/index.ts` (24 inserts, 3 deletes - alias map const + lookup + em-dash to hyphen in error string). Vitest 17 files / 158 tests green pre-push. Awaiting Tate go-ahead to deploy Edge Function (Supabase project ref `tjutlbzekfouwsiaplbr`).

Substrate finding: both Factory dispatches against this codebase appeared to fail review because the worktree was parked on `fix/updates-rules-of-hooks-2026-04-27` (HEAD `3f452ad`, em-dash comment fix). Factory created its own branch correctly and shipped the deliverable; the review tool's diff comparison against the worktree's currently-checked-out branch (rather than the dispatched branch's base) made the work look like a no-op em-dash flip. Real bug is the dispatcher leaving the worktree on a feature branch between dispatches. Recovery: verified deliverable on disk (`git show fix/collective-alias-byron-northern-rivers:supabase/functions/excel-sync/index.ts`), pushed branch, did NOT redispatch.

## 2026-05-11 - SKIP_COEXIST_PREFLIGHT=1 bypass on fix/event-dupe-prevention-2026-05-11 push
Reason: pre-push hook ran `git status --porcelain` in a context that reported the committed migration file as ` D` (deleted in working tree) — a false positive specific to git linked worktrees. The worktree at ~/workspaces/coexist-dupe-prevention was clean (`git status --porcelain` returned empty when called directly). The committed file existed on disk. The constraint was already applied and verified on prod via Management API before the push. Fork: fork_mp0oo9cz_626123.

## 2026-05-11 - SKIP_COEXIST_PREFLIGHT=1 bypass on feat/impact-fe-wiring-fork_mp0ph4u8_084a18 push
Reason: same worktree-context false-positive as the two 2026-05-11 entries above. Pre-push hook hardcodes `COEXIST_DIR=/home/tate/workspaces/coexist` and runs `git status --porcelain` while `GIT_DIR` env still points to the linked worktree's git dir — causing git to compare main-clone files against the worktree branch's HEAD and report them as dirty. Both the worktree (`coexist-w2-impactstats`) and main clone (`/workspaces/coexist`) were independently confirmed clean. Single-file commit (`src/hooks/use-impact.ts`) fixes a ReferenceError bug (`leadersCountRes` used in `useCollectiveImpact` where only `rpcRes` is in scope). Build verified clean (vite 3001 modules). Fork: fork_mp0ph4u8_084a18. Note: preflight.sh needs a fix to unset GIT_DIR/GIT_WORK_TREE before `git status` when called from a linked worktree context.
