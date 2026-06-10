---
thread_id: 19e8ee546f5ce8b2
to: (no reply - this is the Apple notice; action is in App Review page in ASC)
voice_register: conductor (internal note to Tate)
status: action_recommended_no_outbound_reply
submission_id: 1ececcd0-9528-489d-9718-7ee7e8ae4fe5
---

# Chambers iOS submission - Apple flagged an issue

## What happened
Apple's App Review flagged an issue with Chambers iOS submission on 3 Jun 2026
19:10 GMT. Submission ID 1ececcd0-9528-489d-9718-7ee7e8ae4fe5. The email body
does not list the specific issue, only that one exists; the detail lives in the
App Review page in App Store Connect.

This is the Chambers app, not Co-Exist or Glovebox.

## Recommended next step
Open App Store Connect via Corazon CDP, navigate to Chambers > App Review,
read the specific resolution centre message. Capture it into a status_board row
with the actual rejection ground so the fix can be scoped properly.

Two patterns govern this:
- `asc-stuck-rejected-version-resubmit-via-patch-rename-2026-05-19.md` if it is
  a stuck rejection on a metadata or attribute that needs a patch-rename to
  unstick.
- `chambers-apple-review-watch` cron in the active corpus is the polling
  substrate for Chambers-specific Apple review events; if it has not surfaced
  this yet, that is a separate gap.

No email reply needed. The reply lands as a resubmission once the actual issue
is read.

## Suggested status_board entry
P2, entity_type=project, name="Chambers iOS - Apple review issue 3 Jun 2026",
status="App Review flagged submission 1ececcd0, specifics in ASC resolution
centre", next_action="read ASC resolution centre via CDP, scope fix, resubmit",
next_action_by="ecodiaos".
