import json, urllib.request, time

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'

def call(tool, params, timeout=30):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode('utf-8', 'replace')[:500]}

input_ids = ['screenshot_upload', 'screenshot_upload_1', 'screenshot_upload_2']
files = [
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-1.jpg',
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-2.jpg',
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-3.jpg',
]

for input_id, fpath in zip(input_ids, files):
    # Runtime.evaluate to get remote object id
    e = call('cdp.send', {'target': {'alias': 'carplay'}, 'method': 'Runtime.evaluate', 'params': {'expression': f'document.getElementById("{input_id}")', 'returnByValue': False}})
    obj = e.get('result',{}).get('result',{}).get('result',{}).get('objectId')
    if not obj:
        print(f'  {input_id}: no objectId; resp={e}')
        continue
    # DOM.setFileInputFiles accepts objectId per CDP spec
    sr = call('cdp.send', {'target': {'alias': 'carplay'}, 'method': 'DOM.setFileInputFiles', 'params': {'files': [fpath], 'objectId': obj}})
    print(f'  {input_id} <- {fpath}: {sr.get("result", sr)}')

time.sleep(1)
r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': '(()=>[...document.querySelectorAll("input[type=file]")].map(i => ({id:i.id, name:i.files?.[0]?.name||null, size:i.files?.[0]?.size||0})))()'})
print('post-upload:', json.dumps(r.get('result',{}).get('value',{}), indent=2))
