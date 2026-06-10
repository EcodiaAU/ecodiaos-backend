import json, urllib.request, base64

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

# Load JPGs as base64
b64s = []
for n in (1, 2, 3):
    p = f'drafts/cp-shots/roam-cp-shot-{n}.jpg'
    b = open(p, 'rb').read()
    b64s.append(base64.b64encode(b).decode('ascii'))
    print(f'shot{n}: {len(b)} bytes -> {len(b64s[-1])} b64 chars')

# Build JS that creates File objects via DataTransfer and assigns to each input
js = '''(()=>{
  const inputs = ['screenshot_upload','screenshot_upload_1','screenshot_upload_2'];
  const b64s = [B64_0, B64_1, B64_2];
  const results = [];
  for (let i = 0; i < 3; i++) {
    const bin = atob(b64s[i]);
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const file = new File([arr], `roam-cp-shot-${i+1}.jpg`, {type: 'image/jpeg', lastModified: Date.now()});
    const dt = new DataTransfer();
    dt.items.add(file);
    const el = document.getElementById(inputs[i]);
    if (!el) { results.push({input: inputs[i], err: 'not found'}); continue; }
    el.files = dt.files;
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('input', {bubbles: true}));
    results.push({input: inputs[i], count: el.files.length, name: el.files[0]?.name, size: el.files[0]?.size});
  }
  return results;
})()'''
for i, b in enumerate(b64s):
    js = js.replace(f'B64_{i}', json.dumps(b))

r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js}, timeout=60)
print('upload:', json.dumps(r.get('result',{}).get('value', r), indent=2))
