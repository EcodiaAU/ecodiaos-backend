---
triggers: android, keystore, jks, play console, fastlane, android-signing, coexist-android, roam-android, android-release, aab, bundletool, upload-key, .jks, keystore_b64, keystore_password, COEXIST_KEYSTORE_PASSWORD, COEXIST_KEY_PASSWORD, gradlew bundleRelease, signingConfigs
class: programmatic-required
owner: ecodiaos
---

# creds.android.{slug}

Per-slug Android upload keystore + signing config bundle. Required for `gradle signingConfigs` block at build time and `apksigner` post-build. Lifetime-of-app credential - Android upload keys do NOT auto-rotate; if lost, recovery is via Play App Signing's key upgrade flow (slow, Play support intervention).

## Status — PARTIAL (1 May 2026)

Keystore **bytes** backed up for both slugs via fork_momjmkd0_a850d1. Passwords + keytool verification still pending.

| Slug | keystore_b64 | sha256 verified | key_alias | passwords | verified_via_keytool |
|---|---|---|---|---|---|
| coexist | yes (3704 chars, decodes to 2778 bytes) | b2b58549...cbea13 | `coexist` | NO | NO (no JDK on VPS) |
| roam | yes (3696 chars, decodes to 2772 bytes) | 31785950...72cc4 | `roam` (parsed from PKCS12 BMPString) | NO | NO (no JDK on VPS) |

## Schema (per slug)

```
creds.android.{slug} = {
  keystore_b64,                 # base64-encoded .jks/.keystore file contents
  keystore_filename,            # original filename, e.g. 'coexist-release.jks'
  keystore_sha256,              # hex SHA-256 of the binary keystore (drift detection)
  keystore_size_bytes,          # original file size
  keystore_password,            # store password (NULL until passwords ship)
  key_password,                 # key password, often == store password (NULL until ship)
  key_alias,                    # e.g. 'coexist', 'roam'
  key_alias_source,             # provenance note (build.gradle vs PKCS12 dump vs keytool)
  source_file_paths,            # array of paths used during backup
  verified_via_keytool,         # boolean - true once `keytool -list -v` succeeded with stored password
  verified_via_keytool_reason,  # explanation if false
  passwords_pending,            # boolean
  passwords_pending_reason,     # explanation
  application_id,               # Android applicationId from build.gradle
  version_code,
  version_name,
  build_gradle_signing_status,  # NOTE for roam - signingConfigs not yet wired
  backed_up_at,
  backed_up_by                  # actor stamp (fork id)
}
```

## Source

- `coexist`: `~/workspaces/coexist/android/app/coexist-release.jks` (also committed to git per `git log --oneline -- android/app/coexist-release.jks` → `f56d01b fjudfh`).
- `roam`: `~/workspaces/roam-frontend/roam-release.keystore` (workspace root, NOT in `android/app/` yet — release wiring incomplete).

Passwords were probed from:
- `~/workspaces/{slug}/.env*` (only `coexist/.env.example`, no values)
- `~/workspaces/{slug}/android/gradle.properties` (no signing entries)
- `~/workspaces/{slug}/android/keystore.properties` (does not exist)
- `~/workspaces/{slug}/android/app/build.gradle` (env-variable lookups only, no values)
- `~/workspaces/{slug}/.github/workflows/*.yml` (no Android signing CI)
- `~/.gradle/gradle.properties` (does not exist on VPS)
- `~/.android/` (does not exist on VPS)
- `kv_store WHERE key ILIKE '%android%' OR '%keystore%' OR '%signing%'` (no rows)

Result: passwords are NOT on the VPS filesystem. They live only in Tate's build environment / 1Password / Android Studio config on his laptop.

## Used by

- `~/ecodiaos/scripts/release.sh:605-615` (Android signing branch via `require_cred 'creds.android.$SLUG.keystore_b64'`)
- `~/ecodiaos/clients/app-release-flow-android.md:51-55, 115-120`
- `~/ecodiaos/clients/app-release-flow-new-app.md:183`
- `~/ecodiaos/clients/release-candidate-analysis-2026-04-29.md:79, 221`
- `~/workspaces/coexist/android/app/build.gradle:19-26` (signingConfigs.release reads `COEXIST_KEYSTORE_PASSWORD`/`COEXIST_KEY_PASSWORD` env or project property)

## Consumer surface (rotation propagation map)

If a password ever rotates, every surface below must be updated **in the same operation** per `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`:

1. `kv_store.creds.android.{slug}` (canonical)
2. `~/workspaces/{slug}/android/app/build.gradle` env-var names (no value, just confirm names match)
3. Tate's local 1Password vault entry
4. Tate's local Android Studio "Keystore" memory (if cached)
5. Any future CI signing pipeline (none today)
6. Play Console — upload key SHA-1 fingerprint registered with Google. Rotating the keystore itself triggers Play App Signing key upgrade flow (NOT a routine rotation).

## Replaceable by macro?

The signing step itself is **not** macro-replaceable — `gradle signingConfigs` and `apksigner` need the keystore file present at build time. So programmatic creds are required for unattended Android builds.

The Play Console **upload** step IS macro-replaceable (drag-drop AAB in the dashboard via Tate's Chrome on Corazon), so `creds.google_play_service_account_json` stays demoted to fallback under the GUI-macro doctrine.

## Build wiring drift

Roam's `~/workspaces/roam-frontend/android/app/build.gradle` has **no `signingConfigs` block** and the keystore lives at workspace root rather than `android/app/`. Pre-release wiring needed:
- Move/copy `roam-release.keystore` to `~/workspaces/roam-frontend/android/app/`
- Add `signingConfigs.release` block reading `ROAM_KEYSTORE_PASSWORD` / `ROAM_KEY_PASSWORD` env (mirror coexist pattern)

Captured as separate status_board P3 row at backup time.

## Restoration if lost

The .jks file is the source of truth. With `keystore_b64` backed up here, restoration is:

```bash
SLUG=coexist
mkdir -p ~/workspaces/$SLUG/android/app
psql -c "SELECT value::jsonb->>'keystore_b64' FROM kv_store WHERE key='creds.android.$SLUG'" -t \
  | tr -d ' \n' \
  | base64 -d \
  > ~/workspaces/$SLUG/android/app/${SLUG}-release.jks
```

Verify SHA-256 matches `keystore_sha256` stored in the row.

If the kv_store row is also lost, recovery is via Play App Signing key upgrade flow (slow, requires Play support intervention).

## Closing the gap (passwords)

Three options when the window allows:

1. **GUI macro on Corazon (preferred per gui-macro-replaces-api doctrine).** Tate's local Android Studio has the passwords cached in the signing config memory. Drive Android Studio via `screenshot.*`+`input.*` to read them out, OR have Tate copy from 1Password to a one-shot kv_store update window.
2. **SMS Tate during evening on-grid window.** One short SMS asking for the triplet for both slugs. Last resort during the 72h off-grid window per brief.
3. **First Android release attempt fails with helpful error.** `scripts/release.sh` already emits `require_cred 'creds.android.$SLUG.keystore_password'` style errors; the gap surfaces naturally when an Android release is attempted, at which point Tate is presumably engaged.

Recommended: option 3 (organic surfacing), with option 1 as the proactive fallback if a release is queued.

## Failure mode while passwords pending

`scripts/release.sh` Android branch errors at preflight when `keystore_password` is NULL:
```
require_cred 'creds.android.$SLUG.keystore_password' "Need keystore + key passwords for $SLUG. Probe Tate's 1Password or local build env."
```

iOS branch unaffected. Web ship unaffected.

## Origin

Backup of keystore bytes performed 1 May 2026 by `fork_momjmkd0_a850d1` during 72h autonomous window 1-4 May 2026. status_board row `d51856c1-d0aa-4842-bc8e-40605ab7ee97` revved up by drift listener at 16:38 AEST. Tate off-grid; passwords escalation deferred per non-blocking-window rule.
