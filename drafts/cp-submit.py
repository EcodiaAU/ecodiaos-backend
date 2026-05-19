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

print('pre-submit URL:', call('cdp.url', {'target': {'alias': 'carplay'}}).get('result',{}))

# Click submit
print('clicking submit...')
r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': "(()=>{const b=document.getElementById('submit'); b.click(); return {clicked: b.id, type: b.type, value: b.value};})()"})
print('click result:', r.get('result',{}).get('value'))

# Wait for any redirect / response
for sec in (3, 6, 9, 12, 18):
    time.sleep(3)
    u = call('cdp.url', {'target': {'alias': 'carplay'}}).get('result',{})
    s = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': "(()=>({h1:document.querySelector('h1')?.innerText, title:document.title, errors:[...document.querySelectorAll('.form-error,.error,[role=alert],.errortext')].map(e=>e.innerText).filter(Boolean), success:[...document.querySelectorAll('.success-message,.confirmation,.thank-you')].map(e=>e.innerText).filter(Boolean), body_start: document.body.innerText.slice(0,400)}))()"}).get('result',{}).get('value',{})
    print(f't+{sec}s: url={u.get("url","?")[:90]} | title={s.get("title","?")[:60]} | h1={s.get("h1","?")[:60]}')
    if s.get('errors'):
        print(f'  errors: {s["errors"]}')
    if s.get('success'):
        print(f'  success: {s["success"]}')
    if 'thank' in (s.get('h1','') or '').lower() or 'success' in (s.get('h1','') or '').lower() or 'received' in (s.get('h1','') or '').lower():
        print('  SUCCESS-LIKE H1, full body:'); print(s.get('body_start'))
        break
