# Wave-Killer Worker 02 - Push notifications end-to-end

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: push notifications fully wired

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 1 item 5, push notifications are Chambers's biggest structural advantage over Wave (Wave is web-only, no app, no push). Today the send path exists (`supabase/functions/send-push/`) but client-side registration and token storage may be hollow. Make it real.

### Required end-to-end paths

1. Capacitor `@capacitor/push-notifications@8.0.2` is already in `package.json`. Confirm `PushNotifications.requestPermissions()` and `register()` are invoked once on first authenticated app open (not before sign-in). Add the call if missing. Single source of truth lives in `src/lib/` (likely a new `src/lib/push/index.ts`).
2. On `registration` event, capture the device token + platform (`ios` / `android`) and POST to a new `tenant_push_tokens` table keyed by `(member_id, device_token)`. Author migration `0120_push_tokens.sql` if the table does not exist. RLS: member can read/insert/delete OWN tokens; officers read all in tenant.
3. `send-push` edge function reads tokens from `tenant_push_tokens` and dispatches via APNs (iOS) + FCM (Android). Confirm the function handles batch + per-platform payload shape. Verify APNs auth key + FCM service-account creds in Supabase secrets.
4. Wire two trigger paths end-to-end:
   - Officer fires a broadcast push from `NotificationsAdmin.tsx` to all tenant members.
   - Event reminder push fires from `event-reminders` edge function 24h before each event start.
5. Confirm push notification opens deep-link back into the right Chambers route (event detail / newsletter / dues card).
6. Handle token rotation: on every authenticated session start, re-register and update the row if the token changed.
7. Surface failure path: store last-send result per token, mark `inactive` on `Unregistered` / `BadDeviceToken` so the broadcaster does not keep retrying dead tokens.

### Out of scope

- Anything outside push (worker 01 owns Tier 1 verify, others own EDM / AR / analytics / bulk / events / Tier 3).

## The eight-rung process is non-negotiable

1. Research codebase: read `supabase/functions/send-push/`, `src/App.tsx`, `src/main.tsx`, `src/pages/admin/NotificationsAdmin.tsx` in full. Check existing token-storage anywhere with `grep -r push_token src/ supabase/`.
2. Plan: TodoWrite the seven items above. State per item: current state + patch + verify.
3. Write code: client push registration module, migration `0120_push_tokens.sql`, NotificationsAdmin broadcast button + form, push handler in send-push for batch + per-platform, deep-link handler in app, rotation logic, dead-token marker.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests for the push registration module + dead-token mark.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Send a test push to a test member's device token via the `send-push` function.
6. Visual verify via CDP: navigate to `/admin/notifications` on the preview deployment, screenshot the broadcast UI. For the actual device path, run the iOS simulator on SY094 (`ios.boot` + `ios.install` + `ios.launch` MCP tools) and screenshot the push delivery.
7. Push: branch `feat/wave-killer-02-push-e2e-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, Supabase function deployed, simulator screenshot of received push.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-push-e2e-2026-05-29` with verify matrix.
- Neo4j: Episode `wave-killer-push-e2e-2026-05-29` summarising shipped vs broken.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 1 item 5
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Capacitor push doctrine: skill `capacitor-push-notifications`
- iOS APNs key recipe: `D:/.code/EcodiaOS/backend/patterns/apple-dev-apns-auth-key-create-recipe.md`
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan.
