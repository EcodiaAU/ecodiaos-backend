# Co-Exist 1.8.6 TestFlight Processing Verify - 2026-05-13 18:34 AEST
fork_mp3t18go_63a2d1

## ASC API Result

- App: Co-Exist (correct ID: 6760897574, NOT 6496065697 as in brief - brief had wrong ID)
- Queried: 2026-05-13 ~18:34 AEST via ASC API v1/builds

### Build 6 (GoogleService-Info.plist fix)
- Delivery UUID: 383130e4-52f1-4d40-9632-656eb7b79207
- cfBundleVersion: 6
- processingState: **VALID**
- Uploaded: 2026-05-12 23:00 PDT (2026-05-13 16:00 AEST)
- Expired: false

### Build 5 (white-screen fix)
- Delivery UUID: fc0417f1-faae-475b-8234-6f7e66de00b1
- cfBundleVersion: 1
- processingState: **VALID**
- Uploaded: 2026-05-12 19:36 PDT (2026-05-13 12:36 AEST)
- Expired: false

## Status Board Action

Updated row 107bf5f0-d715-4a4b-a853-c1b046bb8f8e ("Co-Exist iOS 1.8.6(6) - crash-on-open fix"):
- status: VALID - both 1.8.6 builds processed and ready for TestFlight
- next_action_by: tate
- priority: 3

## Reschedule Decision

Both builds VALID - no reschedule needed. Cron can retire for this watch cycle.

## Note

The brief specified app ID 6496065697 which returns 0 builds (wrong ID). Correct Co-Exist app ID is 6760897574 (bundle: org.coexistaus.app). This should be corrected in any future ASC briefs.
