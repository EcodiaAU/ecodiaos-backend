import json, urllib.request, base64, time, os

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'
OUT_DIR_BS = r'C:\Users\tjdTa\Pictures\roam-carplay-shots'

def call(tool, params, timeout=60):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

# try /new which should be the new-trip planner
for slug in ['/new', '/account', '/trips']:
    try:
        call('cdp.navigate', {'target': {'alias': 'roam'}, 'url': f'http://localhost:3000{slug}'})
    except Exception as e:
        print(f'nav {slug} err: {e}')
        continue
    time.sleep(7)
    try:
        r = call('cdp.send', {'target': {'alias': 'roam'}, 'method': 'Page.captureScreenshot', 'params': {'format': 'jpeg', 'quality': 88}})
        img = r.get('result',{}).get('result',{}).get('data')
    except Exception as e:
        print(f'capture {slug} err: {e}')
        continue
    sz = len(base64.b64decode(img)) if img else 0
    print(f'{slug}: {sz} bytes')
    if sz > 18000:
        # Save as shot-1
        fpath = OUT_DIR_BS + chr(92) + 'roam-cp-shot-1.jpg'
        open('drafts/cp-shots/roam-cp-shot-1.jpg', 'wb').write(base64.b64decode(img))
        rfs = call('filesystem.writeFile', {'path': fpath, 'content': img, 'encoding': 'base64'})
        print(f'  WROTE shot-1 from {slug}: {rfs.get("result")}')
        break
