---
date: 2026-06-08
sweep_by: EcodiaOS
inboxes: [code@ecodia.au, tate@ecodia.au]
voice_register: conductor
---

# Inbox sweep 2026-06-08

## Counts per bucket per inbox

| Bucket | code@ | tate@ |
|---|---|---|
| urgent_client | 0 | 0 |
| substantive_internal | 4 | 2 |
| automated_noise | 18 | 4 |
| newsletter | 2 | 0 |
| personal (Tate to code) | 2 | 0 |
| self-sent briefings | 0 | 2 |
| **total unread last 7d** | 26 | 8 |

No Angelica or Resonaverde mail. No outbound sent.

## Top 5 urgents

1. **Co-Exist Google Play rejection - READ_MEDIA permissions.** Thread id
   `19e91790fd480f25` (rejection notice) + `19e9454c591f6727` (policy
   specialist offer 5 Jun). Fix is Android Photo Picker migration. Strip
   `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` from
   `coexist/android/app/src/main/AndroidManifest.xml`, bump version code 33 to
   34, rebuild AAB, resubmit. Draft at
   `/Users/ecodia/.code/ecodiaos/backend/drafts/inbox-replies-2026-06-08/19e91790fd480f25-coexist-play-rejection.md`.

2. **Chambers iOS submission flagged by Apple.** Thread id `19e8ee546f5ce8b2`,
   submission `1ececcd0-9528-489d-9718-7ee7e8ae4fe5`, 3 Jun 2026 19:10 GMT.
   Specifics live in ASC resolution centre. Read via Corazon CDP first, then
   scope. Draft at
   `/Users/ecodia/.code/ecodiaos/backend/drafts/inbox-replies-2026-06-08/19e8ee546f5ce8b2-chambers-asc-issue.md`.

3. **GitHub 2FA enforcement deadline 18 Jul 2026.** Thread id
   `19e8ef03fc1f1c29`. EcodiaCode account gets limited access after that date
   without 2FA. No email reply. Action is enroll TOTP via Corazon CDP on
   `github.com/settings/two_factor_authentication/setup/intro`. 40 days of
   runway, but the second TestFlight machine and any push from new Mac will
   hit this.

4. **AWS Free Tier expires 30 Jun 2026, account 438209018053.** Thread id
   `19ea4f850e47536f` on tate@. 22 days of runway. Read the Billing dashboard,
   terminate anything still running per-region, or accept the pay-as-you-go
   rate. Not currently used by EcodiaOS substrate as far as I know, so
   probably terminate.

5. **Co-Exist 1.9.0 build 7 shipped to TestFlight (tate@ inbox).** Thread id
   `19ea5b48a4bf98e9`. Mid-sweep on 8 Jun 05:28 GMT. Informational, no reply.
   Worth flagging because the Android version is still rejected, so the iOS
   and Android tracks have drifted on version numbers.

## Sent outbound

None. The Angelica or Resonaverde standing arrangement was the only outbound
authorization in scope. No mail from them in the 7-day window.

## Recommended filters / automation rules

- **TestFlight noise.** Subject prefix "Glovebox 2.0.0" and similar build-number
  emails from `testflight_no_reply@email.apple.com` should auto-label
  `automation/testflight` and skip Inbox. 18 unread Glovebox emails in 7 days,
  all redundant after the first.
- **Vercel sign-in alerts and Google security alerts** from new Mac. Expected
  during the 6 Jun 2026 Mac migration. Auto-label `automation/sign-in-alerts`
  and skip Inbox unless flagged from outside Sunshine Coast.
- **Apple iCloud sign-in alerts** when from MacBookPro.lan. Same treatment.
- **Coinbase, DigitalOcean marketing.** Filter to Promotions and auto-archive
  after 30 days.
- **Self-sent briefings code to tate** (monthly close, weekly review).
  Auto-label `automation/self-briefings`, skip Inbox, keep searchable.
- **Google Workspace invoice, Fly.io receipt.** Already auto-charged. Route to
  Xero auto-categorize via the bookkeeping cron path. Skip Inbox.
- **Co-Exist event registration confirmations** (Cotton Tree Beach Clean Up).
  Personal substrate, not Ecodia ops. Filter to a `personal/coexist-events`
  label, skip Inbox.

## Notes on the Tate to code email

Thread id `19ea430482e9a642` is Tate pasting a PowerShell transcript showing
he authored a firewall rule for the Corazon laptop-agent on port 7456. Health
endpoint now returns 200 from both 127.0.0.1 and the Tailscale IP. No reply
needed. The substrate fact is that Corazon firewall was the blocker on inbound
7456 access from the Tailscale mesh and that is now cleared.

## Substrate hygiene actions taken

None this turn. Two status_board P2 rows are recommended in the draft headers:
Co-Exist Photo Picker migration, and Chambers ASC review issue. Both stay as
recommendations until the conductor next opens a turn to act on them, per
conductor-owns-coordination doctrine.
