#!/usr/bin/env python3
"""Probe ASC for Co-Exist app: current versions, builds, appStoreState. Run on VPS."""
import json, time, urllib.request, jwt as pyjwt

ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
KEY_ID = "R8P6K38X47"
P8_PATH = "/home/tate/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8"
BUNDLE_ID = "org.coexistaus.app"

with open(P8_PATH) as f:
    private_key = f.read()

now = int(time.time())
payload = {"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}
token = pyjwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})

def api(path):
    req = urllib.request.Request(f"https://api.appstoreconnect.apple.com/v1/{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

apps = api(f"apps?filter[bundleId]={BUNDLE_ID}")
if not apps.get("data"):
    print("APP NOT FOUND for", BUNDLE_ID)
    raise SystemExit(1)

app = apps["data"][0]
app_id = app["id"]
print(f"APP: {app['attributes']['name']} (id={app_id}, bundle={app['attributes']['bundleId']})")
print(f"     sku={app['attributes'].get('sku')}, primaryLocale={app['attributes'].get('primaryLocale')}")
print()

print("=== appStoreVersions (last 6) ===")
versions = api(f"apps/{app_id}/appStoreVersions?limit=6")
for v in versions.get("data", []):
    a = v["attributes"]
    print(f"  {a['versionString']:8s}  state={a['appStoreState']:30s}  platform={a['platform']}  created={a.get('createdDate','')[:10]}")

print()
print("=== prereleaseVersions (last 8) — TestFlight trains ===")
preversions = api(f"apps/{app_id}/preReleaseVersions?limit=8")
for pv in preversions.get("data", []):
    a = pv["attributes"]
    print(f"  {a['version']:8s}  platform={a['platform']}  id={pv['id']}")

print()
print("=== builds for current MARKETING_VERSION (1.8.24) ===")
builds_124 = api(f"builds?filter[app]={app_id}&filter[preReleaseVersion.version]=1.8.24&limit=10")
for b in builds_124.get("data", []):
    a = b["attributes"]
    print(f"  1.8.24 ({a['version']:4s})  state={a['processingState']:12s}  uploaded={a.get('uploadedDate','')[:19]}  expires={a.get('expirationDate','')[:10]}")

print()
print("=== builds for proposed MARKETING_VERSION (1.8.25) ===")
builds_125 = api(f"builds?filter[app]={app_id}&filter[preReleaseVersion.version]=1.8.25&limit=10")
if not builds_125.get("data"):
    print("  (no 1.8.25 builds yet — green light to ship as new train)")
else:
    for b in builds_125.get("data", []):
        a = b["attributes"]
        print(f"  1.8.25 ({a['version']:4s})  state={a['processingState']:12s}  uploaded={a.get('uploadedDate','')[:19]}")
