---
name: REGISTRY
description: Per-account fire-URL + fire-token registry for the 16 Routines. Tate updates this after creating each Routine in claude.ai web UI. Run populateRegistry.js to push entries to kv_store.
---

# Routine fire-URL/token registry

After creating each Routine at `https://claude.ai/code/routines` (per `backend/docs/MIGRATION_PARALLEL_WORK_FOR_TATE.md` step 4), capture the routine's `/fire` URL and bearer token from the Routine settings page and paste them into the table below.

Then run `node backend/scripts/populateRegistry.js` from the local conductor (or via SSH from VPS) to push every row into `kv_store.cowork.routine_registry.<account>.<routine_name>`. The webhook fire-shims and `accountRouter.js` read from these kv_store keys at request time.

## Format

Pipe-separated table. Comments use `<!-- ... -->`. Empty rows are skipped by the parser. The `scope_hint` column is optional; comma-separate multiple hints.

| account | routine_name | fire_url | fire_token | scope_hint |
|---|---|---|---|---|
<!-- tate@ schedule-trigger -->
| tate@ecodia.au | meta-loop |  |  |  |
| tate@ecodia.au | system-health |  |  |  |
| tate@ecodia.au | morning-briefing |  |  | gmail.send,sms.tate |
| tate@ecodia.au | deep-research |  |  | web.search,web.fetch |
| tate@ecodia.au | self-evolution |  |  | filesystem.write_file |
| tate@ecodia.au | strategic-thinking |  |  | gmail.send |
| tate@ecodia.au | inner-life |  |  |  |
| tate@ecodia.au | claude-md-reflection |  |  | filesystem.write_file |
| tate@ecodia.au | vercel-deploy-monitor |  |  | vercel.list_deployments |
| tate@ecodia.au | pattern-corpus-health-check |  |  | web.fetch |
| tate@ecodia.au | daily-index-regen |  |  |  |
| tate@ecodia.au | kg-consolidation |  |  | vps.shell_exec |
<!-- code@ schedule-trigger -->
| code@ecodia.au | email-triage |  |  | email_threads.read,gmail.send |
| code@ecodia.au | outreach-engine |  |  | crm.query,gmail.send |
<!-- money@ schedule-trigger -->
| money@ecodia.au | parallel-builder |  |  | forks.spawn |
| money@ecodia.au | marketing-outreach |  |  | linkedin.list_dms,gmail.send |
| money@ecodia.au | marketing-cadence-monitor |  |  | kv_store.set,status_board.upsert |
| money@ecodia.au | weekly-financial-review |  |  | stripe.list_charges,bookkeeping.list_staged_transactions |
<!-- API-trigger routines -->
| code@ecodia.au | inbound-email-handler | https://api.anthropic.com/v1/claude_code/routines/trig_01775aASgZk6tindvW7r8XJ9/fire | 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 | email_threads.read,kv_store.set |
| money@ecodia.au | stripe-event-handler | https://api.anthropic.com/v1/claude_code/routines/trig_019t21QMsPSLMcPqgyU2Zqfq/fire | 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 | bookkeeping.record_income,sms.tate |
| tate@ecodia.au | vercel-deploy-handler | https://api.anthropic.com/v1/claude_code/routines/trig_017vrZELRWBLGHrVTMNszK2M/fire | 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 | gmail.send,kv_store.set |
| tate@ecodia.au | apple-asn-handler | https://api.anthropic.com/v1/claude_code/routines/trig_01EVnKmwjYYmbDHxxj6omVAp/fire | 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 | bookkeeping.record_income,sms.tate |
<!-- inbound-sms-handler row REMOVED 2026-05-16: SMS no longer routes through a cloud Routine. See backend/patterns/corazon-reflex-substrate-vscode-claude-code-tab-2026-05-16.md + status_board row 7830e176. smsWebhook now POSTs to the Corazon reflex over Tailscale. -->
<!-- TODO: re-evaluate the other api-triggered routines (resend / stripe / vercel / apple-asn) for migration to the reflex substrate after SMS path is proven E2E. -->

<!-- Lane C factory replacement (optional) -->
| money@ecodia.au | factory-cloud | https://api.anthropic.com/v1/claude_code/routines/trig_012yurQzWJq3awKjw3dd6NcG/fire | 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 | filesystem.write_file,git.commit,git.push |

## Fire endpoint contract (CANONICAL - per code.claude.com/docs/en/routines)

- **URL format:** `https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire`
- **Required headers:**
  - `Authorization: Bearer <fire_token>`
  - `anthropic-beta: experimental-cc-routine-2026-04-01`
  - `anthropic-version: 2023-06-01`
  - `Content-Type: application/json`
- **Body shape:** `{"text": "<freeform string>"}` - the text field is NOT parsed; the routine receives it as a literal string. To pass structured data (e.g. a Stripe webhook payload), JSON.stringify the payload and put the whole string inside `text`.
- **Success response:** 200 with `{"type":"routine_fire","claude_code_session_id":"...","claude_code_session_url":"..."}`
- **Webhook shims:** `~/ecodiaos/src/routes/webhooks/*-fire-shim.js` MUST set all four headers when calling /fire. If the shim was authored before 2026-05-16 and only sets Authorization, it will likely 4xx until updated.

## How to use

1. Create each Routine in claude.ai/code/routines per the parallel-work prompt.
2. After each create, open the Routine's settings page, copy the API trigger URL and bearer token.
3. Paste them into the matching row above (between the existing `|` separators - do NOT change column order).
4. Save this file.
5. Run `node backend/scripts/populateRegistry.js` from the local conductor. The script is idempotent - re-running it after adding more rows is safe.
6. Verify with `psql $DATABASE_URL -c "SELECT key FROM kv_store WHERE key LIKE 'cowork.routine_registry.%' ORDER BY key"`.

## Re-keying a Routine

If you regenerate a fire token in the web UI:
1. Update the row in this file with the new token.
2. Re-run `node backend/scripts/populateRegistry.js` - it overwrites existing keys.

## Adding a new Routine

1. Add a new pipe-separated row above (any `|` count >= 5 is parsed).
2. Run the populator.
3. The webhook shims and accountRouter pick it up at next request.
