---
name: apple-id-asc-login
triggers: appstore-connect, asc, app-store-connect, apple-developer, apple-id, ios-app-store, asc-login, code-ecodia-asc, apple-2fa, apple-signin, glovebox-asc, roam-asc, in-app-purchase, iap-create
kv_key: creds.apple_id_asc_login
shape: object {email, password, note}
---

# Apple ID / App Store Connect login - code@ecodia.au

Username + password for the Apple ID that has Admin role on the
**Ecodia Code** Apple Developer team (Team ID `86PUY7393S`). This is the
account that owns the ASC web UI session - use it for any GUI flow at
`appstoreconnect.apple.com` (IAP creation, App Store version rows, build
distribution, etc).

## Where the value lives

`kv_store.creds.apple_id_asc_login`:

```json
{
  "email": "code@ecodia.au",
  "password": "<see kv_store>",
  "note": "Apple Developer Admin on Ecodia Code team (86PUY7393S)."
}
```

Fetch via the org PAT path:

```bash
set -a; . /Users/ecodia/PRIVATE/ecodia-creds/supabase.env; set +a
curl -s "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query" \
  -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT value FROM kv_store WHERE key='creds.apple_id_asc_login'"}'
```

## When to use

- CDP-drive ASC at `appstoreconnect.apple.com` (IAP creation, App Store
  version rows, TestFlight management, build distribution).
- Apple Developer portal at `developer.apple.com` (certs, identifiers,
  provisioning, capability grants like CarPlay).
- Any time a SaaS console asks for an Apple ID + password and the work
  belongs to Ecodia Code team rather than Tate's personal Apple ID.

Do NOT use for:
- Tate's personal Apple ID (different account, different password). His
  personal ID is on his iPhone for iCloud + the App Store; the Apple
  Developer team owns this `code@ecodia.au` separately.
- Sign in with Apple in any consumer app - that's user-facing OAuth, not
  these creds.

## 2FA

The account has Apple's standard 2FA enabled. Trusted-device prompts land
on the Mac at SY094 (MacInCloud) AND on Tate's iPhone. CDP-drive can fill
email + password, but the 6-digit 2FA code must be typed in by Tate from
whichever trusted device prompted.

If the Chrome profile has "Trust this browser" persisted from a prior
login, 2FA may not prompt for ~30 days. Worth trying without surfacing the
ask until the page actually shows the 2FA input.

## Consumer surfaces (rotation checklist)

When this password rotates:
- `kv_store.creds.apple_id_asc_login.password` (canonical)
- Any saved-password entry in Chrome's `Default` profile on Corazon
  (where CDP drives from)
- SY094 keychain entry for `code@ecodia.au` (if Tate logged in
  interactively there)
- Any per-script env var hardcoded to this email (search code for
  `code@ecodia.au` + a password literal - should be zero hits)

Origin: Tate verbatim 2026-05-31 in the Glovebox v2 ASC-IAP arc - the
ASC GUI is reachable from my Chrome session with these creds, removing
the "Tate-required for ASC login" gate.
