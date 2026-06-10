import json, urllib.request, base64, time, os, sys

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'
OUT_DIR_BS = r'C:\Users\tjdTa\Pictures\roam-carplay-shots'
OUT_DIR_FW = OUT_DIR_BS.replace(chr(92), '/')
os.makedirs(OUT_DIR_FW, exist_ok=True)
os.makedirs('drafts/cp-shots', exist_ok=True)


def call(tool, params, timeout=45):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(
        URL, data=body,
        headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'},
        method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def shoot_and_save(path_suffix, file_n):
    fname = f'roam-cp-shot-{file_n}.jpg'
    fpath = OUT_DIR_BS + chr(92) + fname
    try:
        call('cdp.navigate', {'target': {'alias': 'roam'},
                              'url': f'http://localhost:3000{path_suffix}'})
    except Exception as e:
        print(f'  nav {path_suffix} err: {e}')
    time.sleep(3)
    try:
        r = call('cdp.send', {'target': {'alias': 'roam'},
                              'method': 'Page.captureScreenshot',
                              'params': {'format': 'jpeg', 'quality': 85}})
        img_b64 = r.get('result', {}).get('result', {}).get('data')
    except Exception as e:
        print(f'  capture {path_suffix} err: {e}')
        return None
    if not img_b64:
        print(f'  no img for {path_suffix}: {r}')
        return None
    open(f'drafts/cp-shots/{fname}', 'wb').write(base64.b64decode(img_b64))
    try:
        rfs = call('filesystem.writeFile',
                   {'path': fpath, 'content': img_b64, 'encoding': 'base64'})
        print(f'  wrote {fpath}: {rfs.get("result", rfs)}')
        return fpath
    except Exception as e:
        print(f'  write {fpath} err: {e}')
        return None


call('cdp.viewport', {'target': {'alias': 'roam'},
                      'width': 414, 'height': 896,
                      'deviceScaleFactor': 2, 'mobile': True})
print('viewport set, capturing...')

saved = []
for i, p in enumerate(['/trip', '/guide', '/sos'], 1):
    print(f'--- shot {i}: {p} ---')
    out = shoot_and_save(p, i)
    if out:
        saved.append(out)

print(f'saved {len(saved)} files: {saved}')
