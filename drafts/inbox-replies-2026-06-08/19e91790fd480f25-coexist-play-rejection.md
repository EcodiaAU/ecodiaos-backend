---
thread_id: 19e91790fd480f25
to: (no reply - this is the rejection notice; action is in Play Console + code fix)
voice_register: conductor (internal note to Tate)
status: action_recommended_no_outbound_reply
---

# Co-Exist Google Play rejection: READ_MEDIA_IMAGES/READ_MEDIA_VIDEO

## What happened
Google Play rejected Co-Exist version code 33 on 4 Jun 2026. The app declares
READ_MEDIA_IMAGES / READ_MEDIA_VIDEO but only needs one-time or infrequent
access to media files. Per Photo and Video Permissions policy, those permissions
are reserved for apps with persistent media access as a core use case.

On 5 Jun 2026 (13:30 PDT) the same team sent a follow-up offering personalized
policy specialist guidance via the Play Console request form.

## Recommended fix
Switch to the Android system photo picker (no permission required) and drop both
permissions from the manifest across production and testing tracks. This is the
remediation Google explicitly names in the second paragraph of the rejection.

Code touch points (Capacitor):
- `coexist/android/app/src/main/AndroidManifest.xml` - remove `READ_MEDIA_IMAGES`
  and `READ_MEDIA_VIDEO` uses-permission lines.
- Replace any `@capacitor/camera` `pickImages` / `pickLimitedLibraryPhotos` calls
  that rely on broad access with the photo-picker variant. Check the Co-Exist
  event-registration and profile flows where media upload exists.
- Rebuild AAB, bump version code to 34, upload to Play Console internal track,
  send for review.

No email reply needed. The action is the Android Photo Picker migration plus
re-submission. Do not engage the policy specialist form unless the re-submission
gets rejected again on the same ground.

## Suggested status_board entry
P2, entity_type=project, name="Co-Exist Android - Photo Picker migration",
status="rejected on READ_MEDIA permissions, fix is Android Photo Picker",
next_action="strip READ_MEDIA_IMAGES/VIDEO from manifest, swap to photo picker,
rebuild AAB, resubmit", next_action_by="ecodiaos".
