---
triggers: supabase-pat, supabase-org-access, cross-project-query, different-db, can-not-reach, separate-project, coexist-db-from-main, chambers-db-from-main, project-ref-lookup, service-role-key, rest-api-direct, kv-store-creds-supabase, punt-to-fork-trap
---

# Supabase PAT gives REST access to every owned project from main - never punt cross-project DB probes to forks

## The rule

The Supabase access token at `kv_store.creds.supabase_access_token` is an org-level PAT (`sbp_...`). Combined with the per-project URL and service_role_key stored at `kv_store.creds.<project>_supabase` (coexist, chambers, etc.), the conductor on main can run direct REST API queries against ANY owned Supabase project without spawning a fork.

```bash
COEXIST_URL="https://tjutlbzekfouwsiaplbr.supabase.co"
COEXIST_KEY="$(db_query kv_store creds.coexist_supabase | jq -r .service_role_key)"
curl -s "$COEXIST_URL/rest/v1/<table>?select=count" \
  -H "apikey: $COEXIST_KEY" \
  -H "Authorization: Bearer $COEXIST_KEY" \
  -H "Prefer: count=exact" -I | grep content-range
```

That is a 30-second thin-on-main operation. It is NOT a fork-scale task.

## Anti-pattern

Saying "Co-Exist is a different Supabase project, I can't reach it from main" or "that's the fork's problem" when Tate or a flow needs a count, a row, or a targeted update on a non-EcodiaOS Supabase project. That framing is path-of-least-resistance and a direct failure of the routing-problem check.

## Do

- When Tate asks for a count, row, or patch on a client Supabase project: read `kv_store.creds.<project>_supabase` (15s), build the REST call, execute it on main.
- Single REST query = thin-on-main exception per fork-by-default doctrine.
- For multi-artefact work (edit code + write status_board + multi-row UPDATE with branching logic), spawn a fork as usual.

## Do not

- Punt a single-query probe to a fork because "different DB."
- Claim "I don't have access" without first checking kv_store for the project's creds.
- Confuse the org-level PAT (supabase_access_token) with per-project service_role_key. The PAT is for Management API (`api.supabase.com/v1/projects/...`); the service_role_key is for Data API (`<ref>.supabase.co/rest/v1/...`). Both are in kv_store.

## Verification protocol

Before declaring any cross-project DB access blocked:
```sql
SELECT key, LEFT(value::text, 60) FROM kv_store
WHERE key ILIKE '%supabase%' OR key ILIKE 'creds.coexist%' OR key ILIKE 'creds.chambers%'
ORDER BY key;
```
If a cred row exists for the project, the route is open. No fork needed for read-only probes.

## Known projects in kv_store

| kv_store key | project_ref | project |
|---|---|---|
| `creds.coexist_supabase` | `tjutlbzekfouwsiaplbr` | Co-Exist |
| `creds.chambers_supabase` | `arkbjjkfjsjibnhivjis` | Chambers |
| `creds.supabase_access_token` | org-level | Management API PAT |

## Origin

Tate verbatim 16:21 AEST 11 May 2026: "Wtf are you on about coexist is a different db OF COURSE IT IS YOU HAVE PAT FOR SUPABASE ORG" - during the Co-Exist event-cancel P0 arc. Conductor classified "co-exist is a different Supabase project" as a fork-required blocker when a single curl with the service_role_key from kv_store would have answered Tate's question in 30 seconds.

## Cross-references

- `~/ecodiaos/patterns/when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md` (every block is a routing problem)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` (same shape, different substrate)
- `~/ecodiaos/patterns/probe-all-env-files-not-just-dotenv.md` (probe before saying "no creds")
- `~/ecodiaos/patterns/_archived/fork-by-default-stay-thin-on-main.md` (single REST query is the thin-on-main exception)
