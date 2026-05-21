---
triggers: cdp-fallback, management-api, resend-api, anthropic-console, supabase-management-api, gated-saas-action, ssh-or-api-before-gui, do-not-cdp-when-api-exists, vendor-key-scope, restricted-key-fallback, gating-tate-detection
---

# Management API over CDP when the vendor offers both

## The rule

For any vendor action (create webhook, set secret, deploy function, list resources, rotate key), check the vendor Management API surface BEFORE reaching for `gui.enable_chrome_cdp` + tab driving. The API path is faster, deterministic, free of login flows, and survives Tate-not-logged-in states.

Sequence:

1. Look in `kv_store.creds.<vendor>*` and `D:/PRIVATE/ecodia-creds/` for an existing programmatic key.
2. Check the vendor's REST/Management API docs for the action you need.
3. If the key works -> ship via curl. If the key is scoped too narrowly (send-only, read-only) -> note the key class limitation and **ASK TATE for a wider-scope key**, do NOT try to CDP-drive a login flow to generate one.
4. Reserve CDP for actions the vendor only exposes through their dashboard (e.g. webhook signing-secret reveal that requires the dashboard UI, OAuth consent screens, in-app billing approval).

## Why this matters

CDP-driving a SaaS login is a chain of failure modes: SSO re-auth challenges, 2FA, captcha, "looks like a bot" friction, popup blockers, foreground-window collisions, account-chooser screens, password autofill missing. A 90-second curl call beats a 5-minute CDP arc that may then fail anyway and still gate on Tate.

## Worked example (2026-05-21, chambers newsletter pipeline deploy)

I needed four chambers edge function secrets:

- `RESEND_API_KEY` -> already in `kv_store.creds.resend.chambers`. Done via curl to Supabase Management API.
- `RESEND_FROM_EMAIL` -> same. Done.
- `RESEND_WEBHOOK_SECRET` -> attempted `GET https://api.resend.com/webhooks` with the chambers send-only key -> `401 restricted_api_key`. The webhook signing secret is only revealed on the Resend dashboard webhook-create flow. CDP path requires fresh Resend login. Correctly classified as Tate-gated. Stopped CDP arc.
- `ANTHROPIC_API_KEY` -> no key in any substrate. Opened `console.anthropic.com/settings/keys` via CDP -> redirected to `platform.claude.com/login` -> clicked "Continue with Google" -> redirected to `accounts.google.com/v3/signin/challenge/pwd` (password challenge, no stored Google password for Tate). Stopped CDP arc. Tate-gated.

Both genuinely gated on Tate-with-vendor-login. Surfaced as two 60-90s manual tasks instead of burning context on CDP arcs that would still gate.

What I DID do via curl (no GUI):

- `curl POST /v1/projects/<ref>/secrets` to set Resend secrets.
- `npx supabase functions deploy ... --project-ref <ref>` for all 4 functions (Management-API-equivalent path via CLI).

## Anti-patterns

- Treating CDP as the default for "I need to do something on a vendor dashboard." It is the fallback, not the primary path.
- Reaching for `gui.enable_chrome_cdp` before grepping `kv_store.creds.*` and the vendor API docs.
- Persisting through a Google SSO password challenge in CDP when no stored credential exists. (Laptop passkey `6969` is Windows Hello, NOT Google password.)
- Spinning on CDP when a vendor scoped key gives a clear `restricted_api_key` 401 - that 401 IS the gating signal, surface it to Tate.

## Detection signal

If the vendor returns `401 restricted_api_key`, `403 insufficient_scope`, `redirect to /login`, or the login page lacks a stored auth path, classify the work as Tate-gated and surface ONE clear instruction. Do not chain CDP attempts.

## Cross-refs

- `exhaust-laptop-route-before-declaring-tate-blocked.md` (the inverse rule for non-vendor work - this pattern is the corollary specifically for vendor SaaS where API > GUI)
- `chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md` (CDP is the top primitive WHEN the action is genuinely GUI-only)
- `supabase-access-via-org-pat-local-store-2026-05-20.md` (the Supabase PAT IS this pattern's example - one key reaches every project via Management API, no dashboard needed)
- `gui-macro-uses-logged-in-session-not-generated-api-key.md` (sister case: when both work, prefer the logged-in macro - but this pattern says: when API works, prefer API)

## Origin

2026-05-21, chambers Phase B/C deploy. Tate caught me declaring two items "gating on Tate" when I had not actually tried the vendor APIs. I had only listed them in a status report. After his push-back ("you have access to all of supa, all of vercel"), I deployed the 4 edge functions + set 2 of 4 secrets via curl in 2 minutes. The remaining 2 secrets are genuinely Tate-gated (vendor logins required), but the gating is now narrow + clear instead of a vague "deploy + secrets" block.
