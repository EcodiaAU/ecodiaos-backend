import json, urllib.request, time

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'

def call(tool, params, timeout=30):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, headers={'Authorization': f'Bearer {TOK}', 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

# Verify carplay tab still has filled state
r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': '({url: location.href, product_len: document.getElementById("product")?.value.length, features_len: document.getElementById("features")?.value.length, policy: document.querySelector("input[name=chk_policy_agree]")?.checked, app_type: document.getElementById("app_type")?.value, files: [...document.querySelectorAll("input[type=file]")].map(i => ({id: i.id, hasFile: i.files?.length||0}))})'})
print('pre-upload state:', json.dumps(r.get('result',{}).get('value',{}), indent=2))

# Each file input needs a Node ID for DOM.setFileInputFiles. Use DOM.querySelector via cdp.send
# Get nodeIds for each upload input
input_ids = ['screenshot_upload', 'screenshot_upload_1', 'screenshot_upload_2']
files = [
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-1.jpg',
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-2.jpg',
    r'C:\Users\tjdTa\Pictures\roam-carplay-shots\roam-cp-shot-3.jpg',
]

# Get the document root nodeId
root = call('cdp.send', {'target': {'alias': 'carplay'}, 'method': 'DOM.getDocument', 'params': {'depth': -1, 'pierce': True}})
root_id = root.get('result',{}).get('result',{}).get('root',{}).get('nodeId')
print('root nodeId:', root_id)

for input_id, fpath in zip(input_ids, files):
    # Find the input node
    q = call('cdp.send', {'target': {'alias': 'carplay'}, 'method': 'DOM.querySelector', 'params': {'nodeId': root_id, 'selector': f'#{input_id}'}})
    n = q.get('result',{}).get('result',{}).get('nodeId')
    if not n:
        print(f'  {input_id} nodeId NOT FOUND: {q}')
        continue
    # Set file
    sr = call('cdp.send', {'target': {'alias': 'carplay'}, 'method': 'DOM.setFileInputFiles', 'params': {'files': [fpath], 'nodeId': n}})
    print(f'  {input_id} <- {fpath}: {sr.get("result", sr)}')

# Verify
time.sleep(1)
r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': '(()=>{return [...document.querySelectorAll("input[type=file]")].map(i => ({id: i.id, count: i.files?.length||0, name: i.files?.[0]?.name||null, size: i.files?.[0]?.size||0}));})()'})
print('post-upload state:', json.dumps(r.get('result',{}).get('value',{}), indent=2))
