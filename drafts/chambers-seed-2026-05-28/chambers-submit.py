"""Chambers App Store submission - final submit via reviewSubmissions.
Find-or-create the app review submission, ensure version 1.0 is an item, submit, verify."""
import time, json, os, urllib.request, urllib.error
import jwt as pyjwt

KEY_ID = 'R8P6K38X47'
ISSUER = '4b45186b-49e4-4a25-8a63-afd28cf12d3f'
P8     = os.path.expanduser('~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8')
APP    = '6770804509'
ASV    = 'c8a10cc0-1ca7-4471-80e5-6be651ffe137'

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

# 1. find existing open review submission
rc, j = api('/v1/reviewSubmissions?filter[app]=%s&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES,WAITING_FOR_REVIEW,IN_REVIEW,COMPLETING' % APP)
subs = j.get('data', [])
print('[existing open submissions]', rc, [(s['id'], s['attributes'].get('state')) for s in subs])
sub_id = None
for s in subs:
    if s['attributes'].get('state') in ('READY_FOR_REVIEW', 'UNRESOLVED_ISSUES'):
        sub_id = s['id']; break
    if s['attributes'].get('state') in ('WAITING_FOR_REVIEW', 'IN_REVIEW'):
        print('[already submitted] state=%s id=%s' % (s['attributes'].get('state'), s['id'])); raise SystemExit(0)

# 2. create if none editable
if not sub_id:
    rc, j = api('/v1/reviewSubmissions', 'POST', {'data': {'type': 'reviewSubmissions', 'attributes': {'platform': 'IOS'}, 'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})
    print('[create submission]', rc, json.dumps(j)[:500])
    sub_id = (j.get('data') or {}).get('id')
if not sub_id:
    print('FAIL: no submission id'); raise SystemExit(2)
print('[submission id]', sub_id)

# 3. ensure the version is an item in the submission
rc, j = api('/v1/reviewSubmissions/%s/items' % sub_id)
items = j.get('data', [])
print('[existing items]', rc, len(items))
if not items:
    rc, j = api('/v1/reviewSubmissionItems', 'POST', {'data': {'type': 'reviewSubmissionItems', 'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sub_id}}, 'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': ASV}}}}})
    print('[add version item]', rc, json.dumps(j)[:500])

# 4. submit
rc, j = api('/v1/reviewSubmissions/%s' % sub_id, 'PATCH', {'data': {'type': 'reviewSubmissions', 'id': sub_id, 'attributes': {'submitted': True}}})
print('[SUBMIT]', rc, json.dumps(j)[:800])

# 5. verify
rc, j = api('/v1/reviewSubmissions/%s' % sub_id)
print('[final submission state]', rc, (j.get('data') or {}).get('attributes', {}).get('state'))
rc, j = api('/v1/appStoreVersions/%s' % ASV)
print('[version state]', rc, (j.get('data') or {}).get('attributes', {}).get('appStoreState'))
print('=== DONE SUBMIT ===')
