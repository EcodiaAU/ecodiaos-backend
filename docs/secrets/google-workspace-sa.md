---
triggers: google-workspace-service-account, google-dwd, domain-wide-delegation, ecodiaos-workspace-sa, gmail-api-service-account, google-drive-sa, google-calendar-sa, google-docs-sa, workspace-impersonation, ecodia-comms-google-auth, gmail-send-programmatic, google-service-account-json
---

# Google Workspace service account - ecodiaos-workspace (DWD)

The programmatic identity for all Google Workspace API access (Gmail, Calendar, Drive, Docs, Sheets, Contacts) on behalf of the Ecodia workspace. Created 2026-05-29 as a dedicated, least-privilege service account with domain-wide delegation. This is the go-forward canonical Google auth for `ecodia-comms` and any headless Google access.

This is NOT a password and NOT the code@ login. For the code@ Google Workspace web-login password see `google-workspace-code.md`.

## Identity (non-secret)

- SA email: `ecodiaos-workspace@ecodia-code.iam.gserviceaccount.com`
- client_id (authorized in Workspace admin DWD): `109787078907811760931`
- GCP project: `ecodia-code`
- GCP IAM roles: NONE (deliberate least-privilege; capability comes from DWD scopes, not project roles).

## DWD authorization (live, confirmed 2026-05-29)

Authorized in admin.google.com -> Security -> API controls -> Domain-wide delegation for client_id `109787078907811760931`, scopes:
- `https://mail.google.com/`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/contacts`

There is no separate DWD enable-toggle on the SA in GCP; the admin.google authorization is the whole step.

## Impersonation subject

Always `code@ecodia.au` (Ecodia's primary operational mailbox). A DWD service account impersonates a specific user; ecodia-comms must set this as the subject.

## Key storage

- **Local (current):** `/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json` (Corazon, laptop-agent-blocked, NOT git-tracked).
- **Canonical (to populate during migration wiring):** `kv_store.creds.google_workspace_sa` - the full SA JSON as the value, so the VPS `ecodia-comms` connector can read it. The full private key never appears in any logged, committed, or chat surface.

## Consumer-surface checklist (verify after any rotation)

| Surface | Holds the key? | Notes |
|---|---|---|
| `kv_store.creds.google_workspace_sa` (canonical, pending) | yes | populate during ecodia-comms wiring |
| `/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json` (local) | yes | source copy |
| `ecodia-comms` connector config (VPS) | reads from kv_store | set subject=code@ecodia.au |
| VPS `.env` `GOOGLE_SERVICE_ACCOUNT_JSON` | yes - SWAPPED to this new SA 2026-05-29 | backup `.env.bak-2026-05-29`; takes effect on next ecodia-api restart |
| Any repo `.env` / git-tracked file | NEVER | P1 incident if found |

## Reconciliation note (RESOLVED 2026-05-29)

The OLD `GOOGLE_SERVICE_ACCOUNT_JSON` on the VPS was `ecodia-hub@ecodia-hub.iam.gserviceaccount.com` (a separate `ecodia-hub` GCP project), consumed by the live `gmailService` (which backs the cowork gateway `gmail.send` used by Routines) plus dormant calendar/drive services. Swapped in-place to `ecodiaos-workspace@ecodia-code` on 2026-05-29 so the old SA can be deleted without a Gmail outage. The swap takes effect on the next ecodia-api restart; until then the running process still holds `ecodia-hub` in memory, so delete `ecodia-hub` in GCP only AFTER a restart has picked up the new SA and Gmail is verified. The `ecodiaos-vps` SA in `ecodia-code` is a different, unrelated identity (left alone).

## Cross-references

- Migration brief: `backend/drafts/mcp-migration-brief-for-scheduling-chat-2026-05-29.md` (step 3).
- `google-workspace-code.md` - the code@ login password (different credential).
- `cred-rotation-must-propagate-to-all-consumers.md` - rotation discipline.
- Origin: provisioned by Tate 2026-05-29 during the MCP monolith->narrow-connector consolidation (Neo4j Episode 4431).
