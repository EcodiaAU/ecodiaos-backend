---
triggers: vercel, vercel-api, vercel-token, vcp_, vercel-deploy, vercel-rest-api, vercel_list_deployments, vercel_trigger_deploy, vercel-team, vercel-monitor, vercel-probe, vercel-project-env
class: programmatic-required
owner: tate
---

# creds.vercel_api_token

Vercel REST API token used for programmatic access to Vercel team resources: deployment
listing, triggering deploys, probing deployment status, and any VPS-side Vercel
automation that previously required GUI driving through Corazon.

Provisioned 12 May 2026 14:48 AEST by Tate at vercel.com/account/tokens. Verified same
session via `GET /v2/user` + `GET /v2/teams` returning 200 with the ecodia team.

## kv_store key

`creds.vercel_api_token`

## Shape

Object stored as JSON in kv_store:

```jsonc
{
  "token": "vcp_4Ekh...",          // bearer token, vcp_ prefix shape
  "team_id": "team_pMMrkRf7JVN0ZdZsn2WDeHXw",
  "team_slug": "ecodia",
  "user_id": "pYAFatEfUJls7ATVlHHx2u6d",
  "user_email": "tate@ecodia.au",
  "created_aest": "2026-05-12T14:48",
  "created_by": "tate_verbatim",
  "scope_note": "Generated at vercel.com/account/tokens. Covers Ecodia team.",
  "verified_via": "GET /v2/user + GET /v2/teams returned 200 with expected ecodia team",
  "verified_at_aest": "2026-05-12T14:49",
  "consumer_surfaces": [
    "kv_store.creds.vercel_api_token (canonical)",
    "src/services/ (any service needing programmatic Vercel ops)",
    "fork briefs that previously routed Vercel through GUI driving",
    "cron vercel-deploy-monitor (if it consumes a Vercel API key)"
  ]
}
```

## Used by

All Vercel REST API calls from VPS automation and forks:

1. **`mcp__business-tools__vercel_*` MCP tools.** These tools call the Vercel REST API.
   They require the team token to enumerate projects and deployments across the ecodia
   team scope.
2. **`vercel-deploy-monitor` cron.** Every 2h health check on production deployments.
   Previously routed through `vercel_list_deployments` MCP tool which also needs the token.
3. **Fork briefs needing deployment state.** Any fork that needs to verify a deploy
   status, trigger a redeploy, or probe a preview URL should use this token via MCP
   rather than GUI-driving Corazon through the Vercel dashboard.

## Replaceable by macro?

Partially. The Vercel dashboard UI is accessible through Corazon via `input.*` +
`screenshot.*`. For high-frequency automation (deploy monitoring, CI verification,
status probing) the REST API is the correct path - GUI driving would be 5-10x slower
and fragile. Use the token. GUI driving is the fallback if the token is missing or
revoked, not the default.

See `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` for
the test: if the workflow is fundamentally headless (cron, fork, no human in loop), the
programmatic token is right. If it needs interactive visual state (drag-drop, design
changes, team member management), GUI is right.

## Rotation

No expiry was set at generation time (Vercel allows no-expiry for account tokens).
Rotate on:
- Suspected leak (token shape in any error log, status_board context, pasted message)
- Tate account credential rotation
- Scope change (if Vercel adds per-token scope controls)

On rotation: UPSERT kv_store row, update `consumer_surfaces` list, verify each consumer
surface. See `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`.

## Restoration if missing

1. Tate logs into vercel.com > Account Settings > Tokens > Create Token.
2. Scope: full account (Ecodia team). No expiry or 1-year max.
3. Copy token immediately - Vercel shows it once.
4. UPSERT `kv_store.creds.vercel_api_token` with new token + updated `created_aest`.
5. Verify: `curl -H "Authorization: Bearer <token>" https://api.vercel.com/v2/user`
   should return 200 + `tate@ecodia.au`.

## Origin

Provisioned 12 May 2026 14:48 AEST. Context: fork_mp24fnj9_ac4f05 had classified a
wildmountains deploy failure as a GitHub App reauth issue. Tate pushed back ("wdym vercel
reauth"), conductor re-probed, found the real cause was git identity mismatch
(`code@ecodia.au` in local git config overriding global `tate@ecodia.au`). After fixing
the git identity Tate provisioned this token so future Vercel probes run via REST API
rather than GUI driving. See `~/ecodiaos/patterns/tate-pushback-is-a-verification-probe-not-a-complaint.md`
for the full cascade that surfaced this gap.

## Cross-references

- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` - rotation discipline
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - always probe actual
  deployment state, not just status_board narration
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` - when to
  prefer GUI vs programmatic token
- `~/ecodiaos/docs/secrets/github-pat.md` - schema-template sibling (same programmatic-required
  class)
- `~/ecodiaos/docs/secrets/INDEX.md` - registry index
