"""Discover the App Privacy (appDataUsages) reference structure so we can POST truthful entries."""
import time, json, os, urllib.request, urllib.error
import jwt as pyjwt
KEY_ID='R8P6K38X47'; ISSUER='4b45186b-49e4-4a25-8a63-afd28cf12d3f'
P8=os.path.expanduser('~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8')
APP='6770804509'
def tok():
    return pyjwt.encode({'iss':ISSUER,'iat':int(time.time()),'exp':int(time.time())+1200,'aud':'appstoreconnect-v1'}, open(P8).read(), algorithm='ES256', headers={'kid':KEY_ID,'typ':'JWT'})
def a(p):
    r=urllib.request.Request('https://api.appstoreconnect.apple.com'+p); r.add_header('Authorization','Bearer '+tok())
    try:
        x=urllib.request.urlopen(r,timeout=30); return x.getcode(), json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode() or '{}')
for ep in ['/v1/appDataUsageCategories?limit=200','/v1/appDataUsagePurposes?limit=200','/v1/appDataUsageDataProtections?limit=200','/v1/appDataUsageGroupings?limit=200']:
    rc,j=a(ep)
    name=ep.split('/')[2].split('?')[0]
    print('=== %s rc=%s ===' % (name, rc))
    for d in j.get('data', []):
        at=d.get('attributes',{})
        label=at.get('deletionFrequency') or at.get('referenceName') or at.get('purpose') or at.get('protection') or at.get('category') or json.dumps(at)[:60]
        print('  id=%s  %s' % (d.get('id'), label))
    if rc>=300: print('  ', json.dumps(j)[:200])
rc,j=a('/v1/apps/%s/appDataUsagesPublishState'%APP)
print('=== publishState rc=%s %s' % (rc, json.dumps(j.get('data',{}).get('attributes',{}))[:200]))
