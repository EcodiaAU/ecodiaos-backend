---
name: asc-stuck-rejected-version-resubmit-via-patch-rename
description: When an ASC appStoreVersion is in DEVELOPER_REJECTED state it occupies the slot for that platform. Apple refuses to delete subsequent versions ("only the first version of any platform can be deleted") AND refuses to create a new version "in the current state". The fix is to PATCH the stuck ASV in place, swapping versionString and the build relationship, which flips state back to PREPARE_FOR_SUBMISSION and reuses the same ASV id for the new release.
triggers: app-store-connect, appstoreversion, asv-stuck, developer-rejected, only-first-version-can-be-deleted, you-cannot-create-a-new-version, entity-state-invalid, asc-cancel-submission, ios-resubmit, ios-replace-rejected-version, withdraw-from-review, patch-asv-versionstring, asc-version-rename, asc-build-swap, asc-stuck-rejected
metadata:
  type: pattern
---

# Resubmit a stuck DEVELOPER_REJECTED ASV by PATCHing it in place

## The trap

You uploaded iOS build N for version A, submitted for review, then
realised you need to ship build N+M for version B. You try the obvious
path via the App Store Connect API:

1. `PATCH /reviewSubmissions/{old_sub} {canceled: true}` →
   409 `STATE_ERROR.ENTITY_STATE_INVALID` "Resource is not in cancellable state".
   Often because the ASV already flipped to DEVELOPER_REJECTED.

2. `DELETE /appStoreVersions/{old_asv}` →
   409 `STATE_ERROR` "Only the first version of any platform can be deleted."
   Apple keeps the audit trail; subsequent versions cannot disappear.

3. `POST /appStoreVersions` for version B →
   409 `ENTITY_ERROR.RELATIONSHIP.INVALID` "You cannot create a new
   version of the App in the current state." Source pointer is
   `/data/relationships/app`. The app is "occupied" by the stuck ASV.

Every API path is blocked. The ASC web UI lets you "remove from review"
and start a new version, but the API doesn't expose those state transitions
cleanly. That's a real Apple-side limitation, not a missing call.

## The fix

PATCH the stuck ASV directly. ASC lets you mutate `versionString` and
the `build` relationship while the state is DEVELOPER_REJECTED, and the
PATCH flips state back to PREPARE_FOR_SUBMISSION as a side effect:

```python
PATCH /v1/appStoreVersions/{stuck_asv_id}
{
  "data": {
    "type": "appStoreVersions",
    "id": stuck_asv_id,
    "attributes": {"versionString": "1.8.11"},
    "relationships": {
      "build": {"data": {"type": "builds", "id": new_build_id}}
    }
  }
}
```

Response: 200 with `appStoreState: "PREPARE_FOR_SUBMISSION"` and the
new versionString + linked build. The ASV id stays the same but it now
represents version B with build N+M.

From there, the normal submit flow works:

1. `PATCH /appStoreVersionLocalizations/{loc_id}` to set the new
   `whatsNew` on en-US (and any other locales returned by `GET
   /appStoreVersions/{asv}/appStoreVersionLocalizations`).
2. `POST /reviewSubmissions` to create a fresh submission shell.
3. `POST /reviewSubmissionItems` to attach the renamed ASV.
4. `PATCH /reviewSubmissions/{new_sub} {submitted: true}` →
   `state: "WAITING_FOR_REVIEW"`.

## What this DOESN'T do

- Doesn't change the historical audit trail. The original submission for
  version A still exists in Apple's records, just superseded.
- Doesn't bypass review. The renamed ASV goes through normal Apple
  review for the new binary.
- Doesn't free the slot if the ASV is in a non-PATCHable state
  (READY_FOR_SALE, IN_REVIEW, PROCESSING_FOR_APP_STORE). This trick
  only works for DEVELOPER_REJECTED / PREPARE_FOR_SUBMISSION /
  WAITING_FOR_REVIEW that you can cancel first.

## When to reach for this

- The previous version is stuck in DEVELOPER_REJECTED after you
  withdrew it.
- You've uploaded a newer build and want it under a new versionString
  but Apple won't let you create the new ASV.
- Calling `DELETE /appStoreVersions/{id}` returns "only first version
  can be deleted".

If the previous version is still WAITING_FOR_REVIEW and cancellable,
try the cancel + create-new path first. The PATCH-rename trick is
specifically for the dead-end where both cancel and create fail.

## Verification

```python
# After PATCH:
s, b = req("GET", f"/v1/appStoreVersions/{asv_id}")
a = (((b or {}).get("data") or {}).get("attributes") or {})
assert a.get('versionString') == new_version_string
assert a.get('appStoreState') == 'PREPARE_FOR_SUBMISSION'
```

If state didn't flip, the PATCH didn't take. Common cause: the build id
isn't fully processed yet (Apple takes 30-90s after upload). Wait,
re-check, retry.

## Origin

Tate verbatim 18:50 AEST 2026-05-19. Co-Exist 1.8.10(42) was sitting in
WAITING_FOR_REVIEW. Built 1.8.11(43) + 1.8.11(44) with v59 (event-detail
RLS fix), v60 (cached-data error guard), v61 (chat keyboard scroll).
Tried cancel → 409. Tried create → 409. Tried delete → 409. PATCH-rename
of the stuck 1.8.10 ASV → 200, state flipped to PREPARE_FOR_SUBMISSION,
versionString became 1.8.11, build 44 attached. Resubmit went through
clean: `state: WAITING_FOR_REVIEW`.

## Cross-refs

- [[verify-deployed-state-against-narrated-state]] - Apple state machine
  divergence: API docs said "cancellable" + "deletable", reality didn't
  match. Probe state before assuming the documented path works.
- [[route-around-block-means-fix-this-turn-not-log-for-later]] - three
  blocked API paths in a row is a "route around" signal, not a "try
  harder" signal.
- `~/ecodiaos/backend/clients/coexist/scripts/asc-cancel-and-resubmit.py`
  and `asc-rename-asv.py` - reference implementations.
