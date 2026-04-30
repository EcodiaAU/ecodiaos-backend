---
triggers: code-at-ecodia-au-password, google-workspace-password, code@ecodia.au, gmail-login-code, workspace-code-account, admin-google-com-code-user, gmail-password-rotation-code
---

# Google Workspace password — code@ecodia.au

The login password for the `code@ecodia.au` Google Workspace user (Ecodia DAO LLC's primary operational mailbox + the second Anthropic Claude Max account holder).

## kv_store key

`kv_store.creds.google_workspace_code_password` — single string, the current live password.

## Current value

Stored at the kv_store key above. **Last 4 chars: `2yK*`**. Full value never appears in any logged or committed surface.

## Rotation history

| Date (UTC) | Rotated by | How | Reason |
|---|---|---|---|
| 2026-04-30 00:46Z | Cowork-Claude (Tate proxy) via admin.google.com auto-generate | Sensitive-action re-auth completed by Tate; Cowork-Claude drove the rest | GitGuardian leak in commit 635644b on public ecodiaos-backend (scripts/coexist-privacy-smoke.js); incident 2e08b39f |

## Consumer-surface checklist (verify after every rotation)

| Surface | Holds the password? | Verified post-rotation? |
|---|---|---|
| `kv_store.creds.google_workspace_code_password` (canonical) | yes | YES (this rotation) |
| Tate's Chrome on Corazon — saved-password autofill for accounts.google.com | yes (autofill cache) | NO — will surface as a re-prompt next time Cowork-Claude or Tate logs into a Google property; let it overwrite naturally |
| **Anthropic Claude Desktop OAuth (code@ paired Max account UUID 864b45e4-c302-4326-82c1-b3ef2147e6d3)** | yes — Anthropic auth is via Google OAuth | **CONFIRMED INVALIDATED 30 Apr 2026 11:20 AEST: 403 permission_error 'Account is no longer a member of the organization' surfaced 34min after password rotation. Cascade: Google password rotation invalidates Google OAuth refresh tokens, which Anthropic Claude Desktop holds. Recovery: re-sign-in via Google on Claude Desktop with new password.** |
| Supabase Auth SMTP config | NO — uses Resend SMTP, not Gmail credentials | n/a |
| Resend SMTP config | NO — uses Resend API key | n/a |
| VPS `.env` | NO — no direct password dependency (Gmail OAuth tokens used for `mcp__google-workspace__*`, separate from web login password) | n/a |
| Vercel env vars | NO | n/a |
| Any other repo `.env` checked into git | MUST be NEVER. If discovered, this row is a P1 incident. | n/a |
| Any documented runbook / pattern file naming a value | NEVER name the value, only the kv_store key. | n/a |

**Important:** Google Workspace password rotations may invalidate refresh tokens for OAuth applications associated with the user. The MCP google-workspace tool uses long-lived OAuth tokens minted via the Google Cloud service account JSON in `.env` (`GOOGLE_SERVICE_ACCOUNT_JSON`), NOT the user password — so the MCP tool path is unaffected by this rotation. If any tool starts failing with `invalid_grant` against code@ecodia.au, re-mint the OAuth token via Google Cloud Console.

## How to rotate

1. **Pre-stage (Cowork-Claude):** open Tate's Chrome on Corazon, navigate to `admin.google.com` → Users → `Ecodia Code` → Reset Password.
2. **Sensitive-action gate (Tate, ~30s):** Google fires a re-auth prompt asking for Tate's super-admin password. Cowork-Claude cannot type this per `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md`. Tate types it.
3. **Generate (Cowork-Claude):** click "Automatically generate password" or type a 24+ char value. Capture the new value.
4. **Return value to conductor (single line, no surrounding text):** Cowork-Claude pastes the new value into the conductor chat.
5. **Store (conductor):** `INSERT/UPDATE kv_store SET value = to_jsonb('<value>'::text) WHERE key = 'creds.google_workspace_code_password';`
6. **Update this doc:** add a row to the rotation history table with date, who, how, why. Update the last-4 chars line. Walk the consumer-surface checklist.
7. **Verify each consumer surface.** For each row in the checklist marked "yes", confirm the new password is propagated. For "no" / "n/a" rows, confirm the assumption is still true.
8. **Archive the security incident status_board row** when all surfaces are verified.

## Cross-references

- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` — the parent rotation discipline rule.
- `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` — why this rotation requires the duo split.
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` — what `code@ecodia.au` is and isn't (this password is the Google Workspace credential, NOT the Anthropic Claude Max account password — those are separate).
- Status_board row `2e08b39f-3c0d-4d8d-96fd-cf4862e216c0` (now archived) — the security incident this rotation addresses.
- Origin commit of the leak: `635644b` on `EcodiaTate/ecodiaos-backend` at `scripts/coexist-privacy-smoke.js`. Old password is now dead at Google; commit history retains the dead value (acceptable per `~/ecodiaos/clients/coexist-resend-smtp-setup-2026-04-29.md` precedent).
