import json, urllib.request, base64, time, os

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'
OUT_DIR_BS = r'C:\Users\tjdTa\Pictures\roam-carplay-shots'
os.makedirs(OUT_DIR_BS.replace(chr(92), '/'), exist_ok=True)
os.makedirs('drafts/cp-shots', exist_ok=True)

def call(tool, params, timeout=60):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

# Re-attach
tabs = call('cdp.listTabs', {})['result']['tabs']
rt = next((t for t in tabs if 'localhost:3000' in t.get('url','')), None) or next((t for t in tabs if 'localhost' in t.get('url','')), None)
call('cdp.attach_tab', {'alias': 'roam', 'targetId': rt['targetId']})

call('cdp.viewport', {'target': {'alias': 'roam'}, 'width': 414, 'height': 896, 'deviceScaleFactor': 2, 'mobile': True})

def shoot(slug, idx):
    fname = f'roam-cp-shot-{idx}.jpg'
    fpath = OUT_DIR_BS + chr(92) + fname
    try:
        call('cdp.navigate', {'target': {'alias': 'roam'}, 'url': f'http://localhost:3000{slug}'})
    except Exception as e:
        print(f'  nav err {slug}: {e}')
    # Give SPA + map enough time to render
    time.sleep(7)
    try:
        r = call('cdp.send', {'target': {'alias': 'roam'}, 'method': 'Page.captureScreenshot', 'params': {'format': 'jpeg', 'quality': 88}})
        img = r.get('result',{}).get('result',{}).get('data')
    except Exception as e:
        print(f'  capture err {slug}: {e}')
        return None
    if not img:
        print(f'  no img {slug}: {r}')
        return None
    open(f'drafts/cp-shots/{fname}', 'wb').write(base64.b64decode(img))
    try:
        rfs = call('filesystem.writeFile', {'path': fpath, 'content': img, 'encoding': 'base64'})
        print(f'  wrote {fpath}: {rfs.get("result")}')
        return fpath
    except Exception as e:
        print(f'  write err {fpath}: {e}')
        return None

saved = []
for i, p in enumerate(['/trip', '/guide', '/'], 1):
    print(f'--- shot {i}: {p} ---')
    o = shoot(p, i)
    if o:
        saved.append(o)
print(f'saved: {saved}')
