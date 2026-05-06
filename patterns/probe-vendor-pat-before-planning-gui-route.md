---
triggers: vendor-pat, supabase-pat, github-pat, vercel-pat, stripe-restricted-key, programmatic-creds-first, pat-first, kv-store-creds-probe, gui-vs-pat, before-gui-driving, gui-route-when-pat-exists, dashboard-vs-api, supabase-studio-vs-cli, programmatic-vs-gui, route-selection
---

# Probe vendor PAT/API token in kv_store BEFORE planning GUI route

## The rule

Before planning any vendor-touching workflow (Supabase / GitHub / Bitbucket / Vercel / Stripe / Resend / Xero / Zernio / Apple Developer / Google Cloud / Cloudflare / AWS / etc), the FIRST step is:

```bash
Grep "triggers:" ~/ecodiaos/docs/secrets/ -A 1 | grep <vendor>
```

If a programmatic credential exists for that vendor in `kv_store.creds.*` or documented under `~/ecodiaos/docs/secrets/<vendor>.md`, that route supersedes the GUI route for the same task. The order of preference is:

1. **Vendor's official CLI** authenticated against the stored PAT/API token (`supabase`, `gh`, `vercel`, `stripe`, etc)
2. **Vendor's REST API** with the stored token via `curl` or SDK
3. **Vendor's logged-in GUI** via Corazon `input.*` + `screenshot.*`

GUI driving is ONLY correct when steps 1 and 2 are not available — either because no programmatic credential exists for the vendor, or because the specific action is not exposed by CLI/API (rare for first-party vendors, common only for billing/identity-verification flows).

## What this rule is the inverse of

`~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` says: don't GENERATE new API keys when the workflow can run through Tate's logged-in GUI session (logged-in session is cheaper than provisioning a fresh credential and rotating it across consumers).

This rule says: when programmatic credentials ALREADY EXIST in `kv_store.creds.*`, don't waste them by driving GUI for the same task. Use what's there.

The distinction at decision time:
- "Do we already have programmatic creds for this vendor?" → YES → use them (this rule)
- "Do we already have programmatic creds for this vendor?" → NO → don't generate fresh creds just to avoid GUI; drive GUI via Corazon (the inverse rule)

## Do

- Grep `~/ecodiaos/docs/secrets/` BEFORE writing any plan that involves a vendor's GUI/dashboard
- When the vendor is named in a brief, the credential probe is part of the brief authoring, not a follow-up
- When `kv_store.creds.<vendor>_pat` exists, the brief MUST cite the credential and use it
- For Supabase specifically: the SUPABASE_ACCESS_TOKEN (PAT) handles project management, migrations, secrets, edge function deploys, log queries. Use `supabase` CLI authenticated with the PAT before reaching for Supabase Studio
- For GitHub: `kv_store.creds.github.token` handles 95% of repo/PR/workflow/release work. Use `gh` CLI before driving github.com web UI
- For Vercel: `kv_store.creds.vercel_token` handles deploys, env vars, project config. Use `vercel` CLI before driving vercel.com dashboard
- For Bitbucket: `kv_store.creds.bitbucket_api_token` handles PR comments, diffs, branch listing via REST. Use REST before driving bitbucket.org web UI

## Do not

- Plan a GUI route to a vendor without first checking whether a PAT exists for it
- Treat the kv_store as a "fallback" surface — it's the FIRST surface for vendor work
- Make Tate clarify "we have a PAT for that". The probe is on me, not on him

## Verification protocol

Before any brief authored that names a vendor:

1. `Grep "triggers:" ~/ecodiaos/docs/secrets/ -A 1` — does any file's triggers include the vendor name?
2. `db_query SELECT key FROM kv_store WHERE key LIKE 'creds.<vendor>%'` — is there a row?
3. If either is YES, the brief uses CLI/API as primary, GUI as fallback if-and-only-if the action is not exposed programmatically
4. If both are NO, fall through to the GUI rule (inverse pattern) and probe whether Tate's existing logged-in session covers it

## Origin

6 May 2026 14:00 AEST. Tate verbatim: "we should've known abt th supa pat token right away instead of me needing to clarify, need to codify that."

Context: Co-Exist 1.8.3 Phase 1 fork was authored to drive Supabase Studio GUI to deploy carpool edge functions and run migrations, when `kv_store.creds.supabase_access_token` (the SUPABASE_ACCESS_TOKEN PAT) already exists and the `supabase` CLI is installed on the VPS. The brief should have used `supabase functions deploy` and `supabase db push` directly. The author of that brief (me) didn't probe `~/ecodiaos/docs/secrets/` first.

This is the second-strike pattern: I had already learned `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` (don't generate fresh API keys when GUI works), but failed to learn the symmetric companion rule (don't drive GUI when programmatic creds exist). Codifying both halves explicitly so the decision tree at brief-authoring time is exhaustive.

## Cross-references

- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — symmetric companion (don't generate creds when GUI works)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — 5-point check baseline
- `~/ecodiaos/patterns/when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md` — every block is a routing problem; PAT route is one of the routes
- `~/ecodiaos/docs/secrets/INDEX.md` — full inventory of provisioned + pending credentials
- `~/ecodiaos/CLAUDE.md` Credentials section — kv_store canonical locations
