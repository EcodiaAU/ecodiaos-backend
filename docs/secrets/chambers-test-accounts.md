---
triggers: chambers, chambers-test, chambers-login, scycc-matt, test-account, scycc-preview, matt-scycc, chambers-creds
class: operational
owner: ecodiaos
---

# creds.chambers.scycc_matt

Test account for Matt to preview the SCYCC chamber in the Chambers app.

| Key | What | Value |
|-----|------|-------|
| `creds.chambers.scycc_matt` | Matt's SCYCC test login | See below |

## Shape

Object at `kv_store.creds.chambers.scycc_matt`:

```json
{
  "email": "scycc-preview@ecodia.au",
  "password": "ChambersSCYCC2026!",
  "tenant": "SCYCC",
  "role": "president",
  "app_url": "https://chambers.ecodia.app",
  "note": "Test account for Matt to preview SCYCC chamber. Created 2026-05-06."
}
```

## What Matt can see

- **8 events** with hero images (Unsplash cover photos), descriptions, locations, dates
- **~19 demo members** with names, businesses, bios, photos (SCYCC chamber population)
- **RSVPs** showing 8-12 members per event - chamber looks alive
- **Dashboard** as president role

## Auth details

- Auth substrate: Supabase Auth on Chambers project (`arkbjjkfjsjibnhivjis.supabase.co`)
- Auth user ID: `96796c1d-7cec-4b95-8107-3a40ebe15982`
- tenant_members row ID: `b60a8b0f-d0b4-4d26-ae3a-44c7b4e7a6bb`
- Role: `president`
- Tenant: SCYCC (`22097453-7d1f-4f91-b0e7-5a96c76c619b`)

## Source

Created 2026-05-06 by EcodiaOS via Supabase Auth admin API. Password set directly on user create.

## Used by

- Matt (SCYCC president) for previewing the Chambers app
- EcodiaOS for post-deploy smoke tests (see ~/ecodiaos/docs/secrets/chambers-test-accounts.md)

## Replaceable by macro?

Yes - if Matt needs a password reset, send magic link via `supabase.auth.signInWithOtp({email: "scycc-preview@ecodia.au"})`. The auth user exists and can receive reset links.

## Rotation

Password can be rotated via Supabase Auth admin API or by sending a magic link to the email.

## Restoration if lost

1. Check kv_store for `creds.chambers.scycc_matt`
2. If kv_store is unavailable, send magic link to scycc-preview@ecodia.au

## Failure mode if missing

Matt cannot log in to preview the SCYCC chamber. Re-create via Supabase Auth + tenant_members insert.
