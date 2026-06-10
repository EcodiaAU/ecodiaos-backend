# App test accounts (Maestro suites)

Where the per-app test credentials LIVE (values never in flow YAML; the
canonical runner `scripts/app-tests/run-app-tests.sh` env-injects them
from the kv-mirror).

| App | Mirror file (kv-mirror/) | kv_store key | Env names | Account |
|---|---|---|---|---|
| coexist | coexist.json | creds.coexist | MAESTRO_CX_EMAIL / _PASSWORD | has ADMIN role on the web app |
| locals | locals.json | creds.locals | MAESTRO_LC_EMAIL / _PASSWORD | locals-apptest@ecodia.au, customer only (NO merchant role), minted 2026-06-11 via GoTrue admin API on dpumgcxpwfigtpotayjq, password-grant verified |
| glovebox | glovebox.json | creds.glovebox | MAESTRO_GB_EMAIL / _PASSWORD | glovebox-apptest@ecodia.au, minted 2026-06-11 on vzauarlfmkjfkcphojbd, password-grant verified |
| goodreach | goodreach.json | (pending) | MAESTRO_GR_EMAIL / _PASSWORD | demo@goodreach.com.au; password not yet mirrored |

Minting recipe (when an app lacks a test account): org PAT from
`PRIVATE/ecodia-creds/supabase.env` -> management API
`GET /v1/projects/<ref>/api-keys?reveal=true` for service_role ->
`POST <project-url>/auth/v1/admin/users` with email_confirm true ->
VERIFY with a real password-grant token call -> write BOTH the kv-mirror
json (email/password/url) and the kv_store `creds.<app>` row (dollar-quoted
jsonb upsert via the management query endpoint). Both writes or the next
mirror refresh / cloud worker diverges.

Origin: 2026-06-10 overnight coverage fleet stalled because locals and
glovebox had NO test account anywhere; minted + verified 2026-06-11.
