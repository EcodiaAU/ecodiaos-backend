---
date: 2026-06-08
client: goodreach
bundle_id: au.ecodia.goodreach
asc_app_id: 6771579670
probed_via: scripts/probes/asc-build-probe.py
context: substrate replacement for broken away_fetch voice path
  (voice cases c725614f, bc727c7e, 75285a44, 4cc89f9f)
---

# Goodreach iOS - ASC build state probe, 2026-06-08

## Live state (probed 2026-06-08T15:34:13+1000)

- **App:** Goodreach (`au.ecodia.goodreach`)
- **ASC app id:** `6771579670`
- **Latest build:** **1.0 (6)** [iOS]
  - Uploaded: `2026-05-21T03:59:43-07:00` (~18 days ago)
  - Processing state: **VALID**
  - Expiration: `2026-08-19T03:59:43-07:00` (expired=false; ~72 days remaining)
  - Audience: `APP_STORE_ELIGIBLE`
  - Beta App Review state: **null** (never submitted to TestFlight external review)
  - Delivery UUID: `501e5f94-9c26-439f-bf1a-cadec80e8bcd`

## Recent build history (last 5, newest first)

| Version | Build | Uploaded                       | Processing |
|---------|-------|--------------------------------|------------|
| 1.0     | 6     | 2026-05-21T03:59:43-07:00      | VALID      |
| 1.0     | 5     | 2026-05-21T03:46:46-07:00      | VALID      |
| 1.0     | 4     | 2026-05-21T02:37:06-07:00      | VALID      |
| 1.0     | 3     | 2026-05-21T01:59:04-07:00      | VALID      |
| 1.0     | 2     | 2026-05-20T20:33:10-07:00      | VALID      |

Five builds shipped across the 20-21 May 2026 window. Build cadence pattern suggests
an iteration session, not a casual ship. All five are still VALID and unexpired.

## Read

- Last upload was 18 days ago. Nothing has shipped since.
- The latest build sits on `APP_STORE_ELIGIBLE` audience but has **no** beta review submission attached, so it is not visible to external TestFlight testers without explicit submission.
- No build is in `PROCESSING` or `INVALID` state - the pipeline is quiet, not stuck.
- Expiration is 2026-08-19, so the current latest survives ~10 weeks without a re-upload.

## Reproducibility

```bash
python3 /Users/ecodia/.code/ecodiaos/backend/scripts/probes/asc-build-probe.py au.ecodia.goodreach
python3 /Users/ecodia/.code/ecodiaos/backend/scripts/probes/asc-build-probe.py au.ecodia.goodreach --json
```

Substrate now lives at `scripts/probes/asc-build-probe.py`. ASC creds (key_id
`R8P6K38X47`, issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`, .p8 at
`/Users/ecodia/PRIVATE/ecodia-creds/apple/AuthKey_R8P6K38X47.p8`) per
`docs/secrets/apple.md`. ES256 JWT, 20-min lifetime, read-only `GET /apps` +
`GET /builds`. The cron substrate is at `cron-prompts/goodreach-ios-build-watch.md`
(6h cadence).

## Replaces

- voice-case `c725614f` (away_fetch attempt)
- voice-case `bc727c7e` (away_fetch attempt)
- voice-case `75285a44` (away_fetch attempt)
- voice-case `4cc89f9f` (away_fetch attempt)

All four were trying to fetch the same data this probe now returns deterministically.
