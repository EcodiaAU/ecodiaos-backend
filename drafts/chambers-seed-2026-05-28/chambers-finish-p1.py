"""Chambers App Store submission finish - Part 1: attach build 16 + discover remaining-gate shapes.
Deterministic step (build attach) + read-only discovery (age rating, price, submit readiness)
so Part 2 sets age/price/privacy/submit with correct API shapes rather than guessed ones."""
import time, json, os, urllib.request, urllib.error
import jwt as pyjwt

KEY_ID = 'R8P6K38X47'
ISSUER = '4b45186b-49e4-4a25-8a63-afd28cf12d3f'
P8     = os.path.expanduser('~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8')
APP    = '6770804509'
ASV    = 'c8a10cc0-1ca7-4471-80e5-6be651ffe137'
B16    = '71f99f2b-79cd-4bba-9917-ee6efa731c86'

def tok():
    k = open(P8).read()
    return pyjwt.encode(
        {'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 1200, 'aud': 'appstoreconnect-v1'},
        k, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})

def api(p, m='GET', b=None):
    r = urllib.request.Request('https://api.appstoreconnect.apple.com' + p, method=m)
    r.add_header('Authorization', 'Bearer ' + tok())
    r.add_header('Content-Type', 'application/json')
    d = json.dumps(b).encode() if b is not None else None
    try:
        x = urllib.request.urlopen(r, data=d, timeout=30)
        c = x.getcode()
        return c, (json.loads(x.read().decode()) if c != 204 else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')

print('=== 1. ATTACH BUILD 16 ===')
rc, j = api('/v1/appStoreVersions/%s/relationships/build' % ASV, 'PATCH', {'data': {'type': 'builds', 'id': B16}})
print('  attach rc=%s %s' % (rc, 'OK' if rc < 300 else json.dumps(j)[:400]))
rc, j = api('/v1/appStoreVersions/%s?include=build' % ASV)
print('  now attached:', [(b['id'], b['attributes'].get('version')) for b in j.get('included', []) if b['type'] == 'builds'])

print('=== 2. AGE RATING DECLARATION (discover id + current) ===')
rc, j = api('/v1/appStoreVersions/%s/ageRatingDeclaration' % ASV)
ard = j.get('data') or {}
print('  rc=%s id=%s' % (rc, ard.get('id')))
print('  attrs=', json.dumps(ard.get('attributes', {}))[:600])

print('=== 3. SUBMIT READINESS (existing review submissions for app) ===')
rc, j = api('/v1/reviewSubmissions?filter[app]=%s&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES' % APP)
print('  open review submissions rc=%s count=%s' % (rc, len(j.get('data', []))))
rc, j = api('/v1/appStoreVersions/%s/appStoreVersionSubmission' % ASV)
print('  version submission rc=%s data=%s' % (rc, (j.get('data') or {}).get('id')))

print('=== 4. PRICE SCHEDULE ===')
rc, j = api('/v1/apps/%s/appPriceSchedule?include=manualPrices,baseTerritory' % APP)
print('  rc=%s %s' % (rc, json.dumps(j)[:300]))

print('=== 5. APP DATA USAGES (privacy) current count + publish state ===')
rc, j = api('/v1/apps/%s/appDataUsages' % APP)
print('  data usages rc=%s count=%s' % (rc, len(j.get('data', []))))
rc, j = api('/v1/apps/%s/appDataUsagesPublishState' % APP)
print('  publish state rc=%s %s' % (rc, json.dumps(j.get('data', {}).get('attributes', {}))[:200]))
print('=== DONE P1 ===')
