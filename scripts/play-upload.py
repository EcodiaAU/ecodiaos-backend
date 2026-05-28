#!/usr/bin/env python3
"""Upload a signed AAB to Google Play Console via the Android Publisher API.

Usage:
    python play-upload.py <package_id> <aab_path> [--track internal|alpha|beta|production]

Examples:
    python play-upload.py au.ecodia.chambers \\
        D:/.code/chambers-frontend-uxfix/android/app/build/outputs/bundle/release/app-release.aab \\
        --track internal

Auth:
    Reads the service-account JSON key from D:/PRIVATE/ecodia-creds/play/play-uploader-key.json
    (override with --key-path). The SA must be invited into Play Console under
    Users and permissions with Release Manager (Admin) on the target app, OR
    via the App access tab on the SA itself in Play Console > Setup > API access.

Flow:
    1. edits.insert            -> open an edit transaction
    2. edits.bundles.upload    -> upload the .aab
    3. edits.tracks.update     -> add the new versionCode to the chosen track
    4. edits.commit            -> commit + publish the edit
"""

import argparse
import sys
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account


DEFAULT_KEY_PATH = Path("D:/PRIVATE/ecodia-creds/play/play-uploader-key.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]
VALID_TRACKS = {"internal", "alpha", "beta", "production"}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "package_id", help="Android applicationId, e.g. au.ecodia.chambers"
    )
    parser.add_argument("aab_path", help="Path to the signed .aab")
    parser.add_argument("--track", default="internal", choices=sorted(VALID_TRACKS))
    parser.add_argument("--key-path", default=str(DEFAULT_KEY_PATH))
    parser.add_argument(
        "--release-name",
        default=None,
        help="Optional release name shown in Play Console",
    )
    parser.add_argument(
        "--release-notes", default=None, help="Optional release notes (en-AU)"
    )
    args = parser.parse_args()

    aab = Path(args.aab_path).resolve()
    key = Path(args.key_path).resolve()

    if not aab.is_file():
        print(f"AAB not found: {aab}", file=sys.stderr)
        return 2
    if not key.is_file():
        print(f"Service account key not found: {key}", file=sys.stderr)
        print(
            "Drop the play-uploader JSON at D:/PRIVATE/ecodia-creds/play/play-uploader-key.json or pass --key-path.",
            file=sys.stderr,
        )
        return 2

    creds = service_account.Credentials.from_service_account_file(
        str(key), scopes=SCOPES
    )
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    print(f"[1] edits.insert package={args.package_id}")
    edit = edits.insert(packageName=args.package_id, body={}).execute()
    edit_id = edit["id"]
    print(f"    edit_id={edit_id}")

    print(f"[2] edits.bundles.upload {aab.name} ({aab.stat().st_size} bytes)")
    media = MediaFileUpload(
        str(aab), mimetype="application/octet-stream", resumable=True
    )
    bundle = (
        edits.bundles()
        .upload(
            packageName=args.package_id,
            editId=edit_id,
            media_body=media,
        )
        .execute()
    )
    version_code = bundle["versionCode"]
    print(f"    versionCode={version_code} sha1={bundle.get('sha1')}")

    print(f"[3] edits.tracks.update track={args.track} versionCode={version_code}")
    release = {
        "status": "completed",
        "versionCodes": [str(version_code)],
    }
    if args.release_name:
        release["name"] = args.release_name
    if args.release_notes:
        release["releaseNotes"] = [{"language": "en-AU", "text": args.release_notes}]

    track_resp = (
        edits.tracks()
        .update(
            packageName=args.package_id,
            editId=edit_id,
            track=args.track,
            body={"track": args.track, "releases": [release]},
        )
        .execute()
    )
    print(f"    track updated: {track_resp.get('track')}")

    print(f"[4] edits.commit edit_id={edit_id}")
    commit_resp = edits.commit(packageName=args.package_id, editId=edit_id).execute()
    print(f"    committed=edit_id={commit_resp.get('id')}")

    print(
        f"DONE. Build is now in Play Console track={args.track} versionCode={version_code}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
