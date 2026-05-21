---
triggers: chambers, chambers-frontend, supabase-functions, edge-function-deploy, edge-function, coexist-scaffolding, deploy-functions, deploy-functions.sh, chambers-deploy, supabase-deploy, newsletter-compose
---

# Chambers edge functions deploy per-function. Skip deploy-functions.sh

## The rule

`chambers-frontend/supabase/deploy-functions.sh` targets the Co-Exist Supabase project ref (`tjutlbzekfouwsiaplbr`). It does not target chambers (`arkbjjkfjsjibnhivjis`). The shared `supabase/functions/` folder contains Co-Exist scaffolding (create-checkout, stripe-webhook, send-email, generate-email, generate-pdf, send-campaign, etc.) that was copied during the April scaffolding pass but never made chambers-aware.

When deploying a chamber-specific edge function:

- Do NOT run `./supabase/deploy-functions.sh`. It targets Co-Exist's project.
- Do NOT add the function to the FUNCTIONS array in that script. Same reason.
- Deploy per-function with explicit project ref:
  ```
  npx supabase functions deploy <function-name> \
    --no-verify-jwt \
    --project-ref arkbjjkfjsjibnhivjis
  ```
- Set chamber-specific secrets on the chambers project itself (not Co-Exist's):
  ```
  npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... \
    --project-ref arkbjjkfjsjibnhivjis
  ```

## Why

The April 28 buildout plan flagged the Co-Exist contamination explicitly: "These were copied from coexist as scaffolding and are NOT chambers-aware. Treat as starting code, not as shipped behaviour." The contamination has not been cleaned up. Running the shared script deploys Co-Exist-shaped functions to Co-Exist's project. At best a no-op. At worst it overwrites Co-Exist functions with stale chambers-local copies and breaks Co-Exist production.

## Authoring discipline

When adding a new edge function in `chambers-frontend/supabase/functions/<name>/`:

1. Place a deployment header comment at the top of `index.ts` naming the chambers project ref + required secrets explicitly.
2. Do NOT add the function name to `deploy-functions.sh`.
3. If the function is chamber-specific (uses chambers tables, chambers tenants, etc.), include the warning "chambers, NOT Co-Exist" near the deploy command in the header.

## Cleanup direction (someday)

The proper fix is to either:

- Replace `deploy-functions.sh` with a chambers-specific script that targets `arkbjjkfjsjibnhivjis` + only lists chambers-aware functions.
- Move all Co-Exist scaffolding out of `chambers-frontend/supabase/functions/` so the folder only holds chambers functions.

Until that cleanup lands, every new chambers function carries the per-function deploy command in its header.

## Cross-refs

- `verify-deployed-state-against-narrated-state.md` (parent rule)
- `chambers-competitive-landscape-wavecrm-2026-05-21.md` (companion from same session)
- `drafts/chambers-buildout-plan-v1.md` (source of the April contamination flag)

## Origin

2026-05-21 Phase B newsletter-compose edge function shipped. Caught the Co-Exist project ref in `deploy-functions.sh` before triggering a wrong-target deploy. Pattern authored at the moment the next person touching chambers edge functions would think to use the shared script.
