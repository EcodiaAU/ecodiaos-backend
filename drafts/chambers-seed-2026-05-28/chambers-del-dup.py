"""Delete the duplicate iPad screenshot (06-member-profile-dues was a stale-frame dup of 03-officer-dues-admin)."""
import time, json, os, urllib.request, urllib.error
import jwt as pyjwt
KEY_ID = 'R8P6K38X47'; ISSUER = '4b45186b-49e4-4a25-8a63-afd28cf12d3f'
P8 = os.path.expanduser('~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8')
DUP = '893ee193-dc14-4d6a-8508-b1bf92a3434e'  # 06-member-profile-dues.png (iPad), dup of 03

def tok():
    k = open(P8).read()
    return pyjwt.encode({'iss': ISSUER, 'iat': int(time.time()), 'exp': int(time.time()) + 1200, 'aud': 'appstoreconnect-v1'}, k, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})

def api(p, m='GET', b=None):
    r = urllib.request.Request('https://api.appstoreconnect.apple.com' + p, method=m)
    r.add_header('Authorization', 'Bearer ' + tok()); r.add_header('Content-Type', 'application/json')
    d = json.dumps(b).encode() if b is not None else None
    try:
        x = urllib.request.urlopen(r, data=d, timeout=30); c = x.getcode()
        return c, (json.loads(x.read().decode()) if c != 204 else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')

rc, j = api('/v1/appScreenshots/%s' % DUP, 'DELETE')
print('delete dup screenshot:', rc, 'OK' if rc < 300 else json.dumps(j)[:300])
