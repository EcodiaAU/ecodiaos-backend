---
triggers: chambers-resend, chambers-smtp, chambers-supabase-auth, chambers-email, resend-chambers, chambers@ecodia.au, arkbjjkfjsjibnhivjis-smtp, password-reset-chambers
class: programmatic-required
owner: ecodiaos
---

# creds.resend.chambers

Restricted send-only Resend API key powering Chambers Supabase Auth SMTP. Sender is `Chambers <chambers@ecodia.au>` from the verified `ecodia.au` Resend domain. Created 2026-05-19 to replace the rate-limited Supabase default mailer (cap was 2 emails/hr - blocking password resets and the signup flow).

## Source

resend.com via Management API call against the full-access `creds.resend.meeting_analysis` key:
`POST /api-keys` with `permission=sending_access` and `domain_id=<ecodia.au id>`.

## Shape

```json
{
  "api_key": "re_...",
  "key_id": "c3327334-0868-48bd-be29-ec9dd346b545",
  "domain_id": "4e873aa1-7098-47a8-9c70-61d3d3a1e394",
  "scope": "send-only",
  "domain": "ecodia.au",
  "from_email": "chambers@ecodia.au",
  "from_name": "Chambers",
  "supabase_project": "arkbjjkfjsjibnhivjis",
  "stored_by": "opus_session_2026-05-19",
  "stored_at": "2026-05-19"
}
```

## Used by

- Chambers Supabase Auth SMTP (`smtp_pass` on project `arkbjjkfjsjibnhivjis`). Configured via Management API PATCH 2026-05-19. Powers password reset, signup confirmation, magic link, invite, and email-change emails for every chamber tenant (subdomain on `*.chambers.ecodia.au` / `*.chambers.app`).
- Restricted scope `sending_access` - cannot list domains, create more keys, or read account state. Reduces blast radius vs reusing `creds.resend.meeting_analysis` directly.

## Replaceable by macro?

No. Supabase Auth SMTP is a server-to-server credential consumed by GoTrue. The API key IS the integration.

## Rotation

On-leak-only. To rotate:

1. Use `creds.resend.meeting_analysis` (full access) to `POST /api-keys` for a fresh send-only key on the same `domain_id`.
2. PATCH the chambers Supabase Auth `smtp_pass` field with the new key.
3. UPSERT this row.
4. Revoke the old `key_id` via `DELETE /api-keys/{key_id}`.

## Restoration if lost

The full-access `creds.resend.meeting_analysis` key can mint a fresh send-only key against `domain_id=4e873aa1-7098-47a8-9c70-61d3d3a1e394` (ecodia.au) at any time. No manual dashboard work required.

## Failure mode if missing

Every Chambers auth email fails to send. Symptom: `POST /auth/v1/recover` returns HTTP 200 (anti-enumeration) but no email arrives; `POST /auth/v1/signup` succeeds at the DB layer but the confirmation never lands so users can't activate their accounts. Supabase Auth logs at dashboard > Auth > Logs show SMTP send failures.

## Companion config

Chambers Supabase Auth config locked at:
- `site_url: https://chambers.ecodia.au`
- `uri_allow_list` covers `https://chambers.ecodia.au` + wildcards on `*.chambers.ecodia.au` + `chambers.app` + `capacitor://localhost/**` + `chambers://**` (the iOS scheme set in capacitor.config.ts) + local dev ports.
- `smtp_host=smtp.resend.com:587`, `smtp_user=resend`, `smtp_admin_email=chambers@ecodia.au`, `smtp_sender_name=Chambers`, `rate_limit_email_sent=100`.
- Branded HTML templates for recovery, confirmation, magic link, invite, and email change (all reference `{{ .ConfirmationURL }}` and the `chambers@ecodia.au` from-address).

## DNS state (ecodia.au, verified)

DNS on Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Resend's required records are already in place on the `ecodia.au` zone and the domain status is `verified`:
- DKIM TXT at `resend._domainkey.ecodia.au`
- SPF TXT at `send.ecodia.au` (`v=spf1 include:amazonses.com ~all`)
- MX at `send.ecodia.au` pointing at `feedback-smtp.us-east-1.amazonses.com` (bounce processing)
- DMARC TXT at `_dmarc.ecodia.au` (`p=none` policy)

Reset emails to a real Gmail account land in INBOX (initial smoke test against a +alias landed in SPAM, which is Gmail's standard treatment of +alias addresses for a new sender; real-user emails are unaffected).

## Doctrine pointers

- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` - this is the textbook case where API keys ARE the right answer (GoTrue is server-to-server, no human GUI session in the loop).
- `~/ecodiaos/clients/coexist-resend-smtp-setup-2026-04-29.md` - the Co-Exist twin that proved the Resend + Supabase Auth pattern.
