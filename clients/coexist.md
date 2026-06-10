# Co-Exist - canonical infra manifest

> The single source of truth for Co-Exist's repos, hosting, domains, and substrate.
> Read this BEFORE touching any Co-Exist surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Co-Exist Australia - conservation/youth-engagement mobile app.

**People (verified by Tate 2026-06-11):**
- **Kurt Jones (CEO)** at `hello@coexistaus.org`. Decision-holder. The "Kurt opening the foundation/trust committee door" arc is his pitch.
- **Jess (Jessica Ditchfield, community manager)** at `jessicaditchfield@coexistaus.org`. Community manager, NOT CEO. Not a principal. The 2026-06-10 Woodfordia prep brief asserted Jess as CEO and Tate as a "Co-Exist principal" - both false. Quarantined at `.archive/quarantine/2026-06-11-woodfordia-prep-brief/`. Doctrine at `patterns/factual-claims-require-substrate-citation-before-deliverable-2026-06-11.md`.
- **`ceo@coexistaus.org`** routes to Kurt Jones. Earlier kv_store guess "Jocelyn likely" was unverified and is now retired.
- **Ecodia (Tate) posture toward Co-Exist:** Ecodia is the platform vendor + app builder for Co-Exist. Tate is NOT part of Co-Exist and does not represent Co-Exist in external meetings. Standing arrangement does not extend to author-level open lines (see "No client contact without Tate go-ahead" + agreement clauses 2.5 / 10.2 below).

**Immutable identifiers (never change these):**
- iOS bundle id / Android package: `org.coexistaus.app`
- Apple Team ID: `86PUY7393S` · ASC app Apple ID: `6760897574`
- ASC API key id: `R8P6K38X47` (issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`,
  p8 on SY094 at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8`).
  `kv_store.creds.asc_api_key_id` is STALE (points at the old Roam key `6U5835AAQY`)
  - read from `kv_store.creds.apple.asc_api_key.*` instead.

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web app** | `EcodiaTate/coexist` (Vite + React + TS + Capacitor 8 wrapper) | Vercel project **`coexist`** (framework `vite`, prod branch `main`, auto-deploy) | **`app.coexistaus.org`** + `coexist-alpha.vercel.app` | LIVE |
| Marketing site | (Squarespace under Kurt, not our repo) | Squarespace | `coexistaus.org` (301 -> Squarespace) | LIVE, NOT our build |
| **iOS** | same repo, `ios/App` Capacitor target | TestFlight / App Store | `org.coexistaus.app` | LIVE |
| **Android** | same repo, `android/` Capacitor target | Google Play | `org.coexistaus.app` | LIVE |

**Local Corazon path:** `D:/.code/coexist/` (main clone, branch `main`).
A linked worktree at `D:/.code/coexist-mobile` may exist when mobile work is in flight.

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`tjutlbzekfouwsiaplbr`** (name `Co-Exist`, region `ap-southeast-2`). |
| Backups | `njprlytfwtqzbyktegha` (Co-Exist Backup) + `yfmihkgbpechyoitohjb` (coexist-recovery-2026-05-11) - read-only references, do NOT deploy against these. |
| Web env (Vercel) | Vite env: `VITE_SUPABASE_URL=https://tjutlbzekfouwsiaplbr.supabase.co`, anon key, Sentry DSN. Auto-injected on prod + preview. |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. ASC app id `6760897574`. API key `R8P6K38X47` / issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`, p8 at `/Users/ecodia/PRIVATE/ecodia-creds/apple/AuthKey_R8P6K38X47.p8`. TWO headless paths: (1) SY094 driver `~/asc-scripts/ship-ios.py` (reads `apps/coexist.json`); (2) **Mac-local fully headless via API-key signing** (`xcodebuild -allowProvisioningUpdates` archive + export + `altool` upload + ASC-API reviewSubmission) - VERIFIED 2026-06-08 shipping 1.9.0/7 to `WAITING_FOR_REVIEW`. Recipe: [[mac-local-headless-ios-ship-via-asc-api-2026-06-08]]. |
| **Google Play** | Published under the **Ecodia Code** Play developer account (dev id `4956975013415025789`). Co-Exist Play Console **app id `4972698454438935612`** (publishing overview: `play.google.com/console/u/0/developers/4956975013415025789/app/4972698454438935612/publishing`). Signing key `android/app/coexist-release.jks`, alias `coexist`. Passwords live ONLY in the Mac login Keychain (`security ... -a coexist -s COEXIST_KEYSTORE_PASSWORD` / `COEXIST_KEY_PASSWORD`); `android/app/build.gradle` `signingSecret()` reads them at build time so signing is hands-off and the password is never seen. Release SA `play-uploader@ecodia-code.iam.gserviceaccount.com` (key `/Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json`) has full release access. **Fully headless+CDP release verified 2026-06-08 (1.9.0/35):** Keychain `bundleRelease` then `androidpublisher` API stages the prod release (commit `changesNotSentForReview=True`) then CDP clicks Send for review. Recipe: [[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]]. |
| Excel sync | SharePoint master sheet via Microsoft Graph. DRIVE_ID `b!jB_eUPJMbUWf3eip_Me-34G0StMYwYdHtdf4sTNow-uVV9nof_IvQprzswNpaD8y`, ITEM_ID `01RJHFBL37QUUGOQUVL5DJ67A53VKNDAGE`. Edge Function `excel-sync` (project tjutlbzekfouwsiaplbr). Graph creds at `kv_store.creds.coexist_graph_api`. pg_cron jobs 9 (`excel-from-sync` every 30m) + 10 (`excel-to-sync-hourly` every 1h). |
| Test login | `kv_store.creds.coexist` (full schema in `docs/secrets/coexist-app-test.md`). |
| Billing register | `client_billing_schedules` row WHERE `client_slug = 'coexist'` is canonical (NOT the prose log below). Cron `recurring-billing-monthly` daily 09:00 AEST. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **`app.coexistaus.org` is the canonical web URL, NOT `coexistaus.org`.** `coexistaus.org` is a Squarespace marketing site Kurt owns and is unrelated to our deploy. The dev-process-registry previously claimed `https://coexistaus.org` was the Vercel deploy URL - that is stale.
- **Backup Supabase projects are NOT deployment targets.** `Co-Exist Backup` (njprlytfwtqzbyktegha) and `coexist-recovery-2026-05-11` (yfmihkgbpechyoitohjb) are snapshots from the 2026-05-11 dupe-prevention incident, kept for recovery. Pointing the app at them by accident = data loss.
- **`creds.asc_api_key_id` is STALE.** It still points at the old Roam key `6U5835AAQY`. Real Co-Exist ASC key is `R8P6K38X47` under `kv_store.creds.apple.asc_api_key`.
- **iOS `pbxproj` has local signing mods** (CODE_SIGN_STYLE=Automatic, DEVELOPMENT_TEAM=86PUY7393S, empty PROVISIONING_PROFILE_SPECIFIER). `ship-ios.py` re-applies them idempotently after `git pull`.
- **Capacitor 8.3.1 requires Node >=22.** SY094 default is already `nvm alias default 22` (set 2026-05-29).
- **Local helper scripts in `D:/.code/coexist/scripts/`** (`ssh-ship.py`, `asc-probe-version.py`, `asc-create-version.py`, `asc-submit-remote.py`) are **SUPERSEDED** by `~/asc-scripts/ship-ios.py` on SY094. Do not author new ones; parameterise the SY094 driver instead.
- **Excel sync direction discipline.** Default is `from-excel` (safe read). Never write to sheet without explicit `?direction=to-excel`. Forms rows have integer IDs and are sheet-owned (UNTOUCHABLE rows 2-256). App rows have UUID IDs.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`coexist` project). No manual step.
- **iOS one-line headless:**
  ```
  ssh tate@100.103.227.90 "sshpass -p xve24085ehi ssh -o StrictHostKeyChecking=no user276189@SY094.macincloud.com 'python3 ~/asc-scripts/ship-ios.py coexist'"
  ```
  Full 10-step flow: pull, version bump, signing patch, `cap sync`, archive, export, `altool` upload, ASC build poll, attach build to ASV, submit reviewSubmission. **UPDATE `apps/coexist.json` marketing_version + asv_id BEFORE running.** Probe-only: `ssh tate@100.103.227.90 'python3 /tmp/asc-probe.py'`. ALWAYS PROBE FIRST: if current MARKETING_VERSION is READY_FOR_SALE -> bump MARKETING; if WAITING_FOR_REVIEW -> only bump CURRENT_PROJECT_VERSION.
- **Android:** Play Console UI via Android Studio on Corazon, per `patterns/play-console-android-release-recipe.md`. No headless path yet.
- **Edge function deploy:**
  ```
  cd /home/tate/workspaces/coexist && SUPABASE_ACCESS_TOKEN=<creds.supabase_access_token> npx supabase functions deploy excel-sync --project-ref tjutlbzekfouwsiaplbr --no-verify-jwt
  ```
- **Recipes:**
  - iOS: `patterns/ios-app-asc-headless-ship-protocol.md` (universal driver), `patterns/coexist-ios-headless-ship-recipe.md` (per-app deltas).
  - Android: `patterns/play-console-android-release-recipe.md`.

---

## Operational layers (read when working in that surface)

The operational content below is NOT infrastructure; it lives here because it is load-bearing
for every billing/IP/feature/triage decision on Co-Exist. The infra manifest above (sections 1-5)
is the canonical surface for "what repos, what hosting, what URLs."

### Agreement + scope
- **Software agreement** sent to hello@coexistaus.org 8 Apr 2026. Signed by Tate. Kurt countersign pending.
- **Clauses 2.5 and 10.2** define in/out of scope - read the agreement BEFORE exploring technical solutions for new requests. Squarespace sync request (13 Apr 2026) was out of scope per these clauses.
- One round of revisions included in quote. Hourly rate for out-of-scope: $60/hr ex-GST (50% off rate-card $120/hr, strategic discount reflecting monthly recurring relationship). Confirmed 14:57 AEST 13 May 2026.

### Billing register (mirror of `client_billing_generations`)
Co-Exist is on a substrate-tracked recurring billing schedule (live 7 May 2026). Do NOT render invoices ad-hoc - read the schedule first, generate via `billingScheduleEngine`, persist the run to `client_billing_generations`.

- Schedule: `client_billing_schedules` row WHERE `client_slug = 'coexist'`. monthly_combined, day_of_month=7, starts_on 2026-05-01, perpetual.
- Lines: (1) Operational retainer $1,000 ex-GST, 3-month window May/Jun/Jul 2026 only. (2) Monthly licensing fee $200 ex-GST, perpetual. (3) Managed 3rd-party costs (Vercel Pro share + Supabase Pro share + M365 share), variable, May fixed at $82.
- Bill-to: Co-Exist Australia Ltd · ABN 39 660 776 983 · QLD 4551.
- Payment: Bank Australia BSB 313-140 acct 12579148, name "Ecodia Pty Ltd". Reference template `{invoice_number}`.
- GST applicable (10%).
- Cron: `recurring-billing-monthly` daily 09:00 AEST. Never auto-sends to Co-Exist (test-to-Tate first, then Tate "send it" -> forward). Per `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`.
- Invoices:
  - INV-2026-001 (Apr 2026) sent 8 Apr to hello@coexistaus.org (gmail msg id `19d687d192871ced`).
  - INV-2026-002 - sequence gap, never rendered.
  - INV-2026-003 (May 2026, $1,410.20 incl GST) sent 6 May (gmail msg id `19dffa931a0f2cfd`). v2 PDF at `documents/invoices/inv-coexist-2026-003-FINAL-v2-2026-05-07.pdf`. Paid 19 May 2026 via direct credit (ledger tx `1fe8f35f-9469-486a-9cbb-a0c4c917271b`, Co-Exist's bank ref accidentally said "INV-2026-001" but amount $1,410.20 matches 003).
  - INV-2026-004 (Jun 2026, $1,410.20 incl GST: retainer $1000 + licence $200 + passthrough $82) sent 2026-06-08 09:39 AEST to hello@coexistaus.org from code@ via SA-JWT direct Gmail API (gmail msg id `19ea473c33430b4b`, thread `19ea473c33430b4b`, 2-part MIME verified PDF 129328b). Final PDF: `documents/invoices/inv-coexist-2026-004-FINAL-2026-06-08.pdf`. Invoices row `90c03fcf-702e-4dd0-b709-83645271b222` status=sent. client_billing_generations row `c905568e-e4f2-43d9-9d27-401d9c9b9353` status=sent_to_client. Schedule `012722b9` advanced to next_due_date 2026-07-07; duplicate schedule `8eb34faa` archived. **Tate edit dropped MS365 tech support line** ($180 ex/$198 inc, 3hrs from cowork.coexist.tech_support_hours) via chat 2026-06-08 09:30 AEST "Take th 180 for ms365 hours off the invoce pls and re calc final, then send it". Those 3hrs stay on `cowork.coexist.tech_support_hours.log` UNBILLED, NOT reset, awaiting Tate decision on whether to bill on INV-2026-005, write off, or hold for renewal arc. Due 14 June 2026.
  - INV-2026-005 (Jul 2026) auto-draft 2026-07-07. Last invoice of current retainer-line arc; licence + passthrough continue perpetually until archived. Open question for INV-2026-005 render: roll the 3hrs MS365 (and any newly-logged hours by then) forward or hold per Tate's still-open intent on the 2026-06-08 edit.
- Tech support hours tally: `kv_store.cowork.coexist.tech_support_hours`. Rate $60/hr ex-GST. Categories: `MS365 tech support` | `app dev support` | `other`. Reset `hours_logged_for_period` to 0 after invoice send + Tate confirmation.
- Unbilled tech-assist log (migrated from status_board row 9414d926 on 2026-06-02, the row Tate flagged should live on the client doc not the board):
  - 3hr tech assist ex-GST $180 -> add to next invoice (INV-2026-004 Jun 2026 auto-draft).
- Retainer coverage ENDS 7 August 2026 (status_board 59a67b24). Renewal window 7-15 July 2026.

### Renewal arc (post-2026-08-07)
Tate verbally locked with Kurt 2026-05-17 at Kurt's place: post-retainer-end, Co-Exist returns to retainer + bulk payments for expanded scope. Unify website + app + impact-tracking into one platform. Replace Supabase-DB + Excel-sheet sync mess with a proper integrated impact substrate. Reinstate MS365 tech support at $1,000/month. Tate-window 7-15 Jul 2026.

### IP & licence
- Per `~/ecodiaos/patterns/coexist-vs-platform-ip-separation.md` (recalibrated 2026-04-27).
- Co-Exist app/brand/data = owned by Co-Exist Australia.
- Underlying multi-tenant conservation-platform patterns = owned by Ecodia Labs Pty Ltd (rebrand pending).
- Co-Exist licence with Ecodia covers operating their Co-Exist deployment specifically. Build fee + $200/mo operating licence.
- Client-facing contract attributes IP to Ecodia Pty Ltd (Labs -> Pty Ltd licensing chain internal).
- Affected legacy kv_store briefs carry `_ip_recalibration_notice`: `ceo.briefs.platform-coexist-pricing-benchmarks-2026-04-25`, `ceo.briefs.platform-coexist-federation-thesis-2026-04-26`, `ceo.drafts.platform-coexist-peak-bodies-brief-v1`, `ceo.audit.coexist-multitenant-readiness-2026-04-25`.

### Stats architecture (canonical as of 11 May 2026)
- All four stats pages derive from one path: Page -> Hook -> `src/lib/impact-query.ts` (`fetchImpactRows` + `fetchBaselineSettings`).
- Event date column = `events.date_start`. `created_at` is operational only.
- Baseline floor: 2026-01-01 (`IMPACT_BASELINE_DATE`). Pre-2026 data in `app_settings` keys (`impact_baseline_trees`/`_2022`/`_2024`/`_2025` etc).
- Drift detection cron nightly 02:00 AEST reads master sheet Overall tab vs Supabase aggregation; status_board P2 row + Neo4j Episode on drift. Badge visible on `/admin/impact` when `stats_drift_detected` is truthy.
- Excel sync dedup: `findMatchingAppEvent` fuzzy title + date match, partial unique index `events_synthetic_dedup` on `(collective_id, date_start::date, lower(trim(title)))` WHERE v5 UUID.
- Doctrine: `~/ecodiaos/patterns/co-exist-stats-canonical-aggregation-architecture.md`, `~/ecodiaos/patterns/single-canonical-aggregation-feeds-all-dashboard-surfaces.md`.

### Check-in window (post-event backfill, 2026-05-20)
- Lifecycle, leaders/admins only. FUTURE blocked. EVENT DAY open to all. AFTER event day open to collective leaders/admins ONLY, and ONLY while no `event_impact` row exists. Logging impact closes the window.
- FE predicate `isCheckInOpenForLeader(dateStartIso, tz, impactLogged)` in `src/lib/date-format.ts`.
- Migration `20260520000000_post_event_checkin_backfill.sql` rewrites `enforce_event_day_check_in_window` + `enforce_walk_in_day_window`. service_role bypass preserved.
- Branch `feat/post-event-checkin-backfill-2026-05-20` (commit 5f7350b) still pending merge as of 20 May 2026.
- Spec: `docs/specs/2026-05-20-post-event-check-in-design.md`.

### Account-creation procedure (codified after 2026-04-28 Paul provisioning)
1. Check existence: query `auth.users` via service_role admin API for the email.
2. Path B (default, no email sent): `POST /auth/v1/admin/users` with `email`, `password`, `email_confirm: true`, `user_metadata`. Returns auth_user_id.
3. UPDATE auto-created `public.profiles`: set `email`, `first_name`, `last_name`, `display_name`, `role` (enum: admin/manager/leader/national_leader/co_leader/assist_leader/participant).
4. Optional `staff_roles` row for granular permissions: `{manage_users, manage_email, manage_merch, manage_charity, manage_partners, manage_challenges, send_announcements}` plus `managed_collectives` UUID array.
5. Store temp password in kv_store `coexist.temp_credentials.{slug}` with TTL note. Never log password to Neo4j or status_board.
6. status_board row entity_type='task', next_action_by='tate'. Tate forwards credentials.

### Lint debt + pre-push bypass
`SKIP_LINT=1` or `SKIP_COEXIST_PREFLIGHT=1` bypasses are documented across the pre-push history (see git log for `SKIP_COEXIST_PREFLIGHT`). Root cause: pre-push hook hardcodes `COEXIST_DIR=/home/tate/workspaces/coexist` and runs `git status --porcelain` with `GIT_DIR` still pointing at the linked worktree's git dir - false-positive specific to git linked worktrees. Fix in preflight.sh: unset `GIT_DIR`/`GIT_WORK_TREE` before `git status` when called from a linked worktree.
