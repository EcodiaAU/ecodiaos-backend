#!/usr/bin/env python3
"""Poll ASC API for Glovebox build 1.1(37) until VALID or timeout."""
import jwt
import time
import urllib.request
import urllib.parse
import json
import sys

KEY_ID = "R8P6K38X47"
ISSUER_ID = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
P8_PATH = "/Users/user276189/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8"
BUNDLE_ID = "au.ecodia.roam"
MARKETING_VERSION = "1.1"
BUILD_VERSION = "37"
POLL_MAX_SECS = 600  # 10 min
POLL_INTERVAL = 30


def gen_jwt():
    with open(P8_PATH, "r") as f:
        key = f.read()
    payload = {
        "iss": ISSUER_ID,
        "iat": int(time.time()),
        "exp": int(time.time()) + 1200,
        "aud": "appstoreconnect-v1",
    }
    return jwt.encode(payload, key, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def asc_get(path):
    token = gen_jwt()
    url = "https://api.appstoreconnect.apple.com" + path
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def find_app_id():
    """Look up ASC app id by bundle id."""
    qs = urllib.parse.urlencode({"filter[bundleId]": BUNDLE_ID})
    data = asc_get("/v1/apps?" + qs)
    for app in data.get("data", []):
        attrs = app.get("attributes", {})
        if attrs.get("bundleId") == BUNDLE_ID:
            return app["id"], attrs.get("name")
    return None, None


def find_build(app_id):
    qs = urllib.parse.urlencode({
        "filter[app]": app_id,
        "filter[preReleaseVersion.version]": MARKETING_VERSION,
        "filter[version]": BUILD_VERSION,
        "fields[builds]": "version,processingState,uploadedDate,expirationDate",
        "limit": "5",
    })
    return asc_get("/v1/builds?" + qs)


def main():
    app_id, app_name = find_app_id()
    if not app_id:
        print(f"FAIL: no ASC app matched bundle_id={BUNDLE_ID}")
        return 1
    print(f"ASC app: {app_name} (id={app_id})")

    start = time.time()
    last_state = None
    while time.time() - start < POLL_MAX_SECS:
        try:
            data = find_build(app_id)
            builds = data.get("data", [])
            if not builds:
                state = "NOT_FOUND_YET"
            else:
                # newest first per ASC API ordering
                build = builds[0]
                attrs = build.get("attributes", {})
                state = attrs.get("processingState", "UNKNOWN")
                uploaded = attrs.get("uploadedDate", "?")
                build_id = build.get("id", "?")
            elapsed = int(time.time() - start)
            if state != last_state:
                print(f"[+{elapsed:>3}s] {MARKETING_VERSION}({BUILD_VERSION}) -> {state}", flush=True)
                last_state = state
            if state == "VALID":
                print(f"\nVALID. build_id={build_id} uploaded={uploaded}")
                return 0
            if state in ("FAILED", "INVALID"):
                print(f"\nFAIL: build entered {state}")
                return 2
        except Exception as e:
            print(f"[+{int(time.time()-start)}s] poll error: {e}", flush=True)
        time.sleep(POLL_INTERVAL)
    print(f"TIMEOUT after {POLL_MAX_SECS}s waiting for VALID (last={last_state})")
    return 3


if __name__ == "__main__":
    sys.exit(main())
