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

# Optional: set app_store_url note
url_note = 'Bundle id au.ecodia.roam is currently in App Store review for v1.0 (build 25). The CarPlay-bearing v1.1 (build 27) is uploaded and processing on TestFlight. Submitting now to start the entitlement review in parallel with the public-availability gate.'
js_url = '''(()=>{
  const e = document.getElementById('app_store_url');
  if (!e) return {missing: 'app_store_url'};
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(e, URL_NOTE);
  e.dispatchEvent(new Event('input', {bubbles: true}));
  e.dispatchEvent(new Event('change', {bubbles: true}));
  return {len: e.value.length};
})()'''.replace('URL_NOTE', json.dumps(url_note))
print('url note:', call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js_url}).get('result',{}).get('value'))

# Full pre-submit state
js_state = '''(()=>({
  contact_name: document.getElementById('contact_name')?.value,
  contact_email: document.getElementById('contact_email')?.value,
  app_type: document.getElementById('app_type')?.value,
  product_len: document.getElementById('product')?.value.length,
  features_len: document.getElementById('features')?.value.length,
  app_store_url_len: document.getElementById('app_store_url')?.value.length,
  files: [...document.querySelectorAll('input[type=file]')].map(i => ({id: i.id, n: i.files?.length||0})),
  policy: document.querySelector('input[name=chk_policy_agree]')?.checked,
  submit_btn: !!document.getElementById('submit'),
  submit_btn_disabled: document.getElementById('submit')?.disabled
}))()'''
print('pre-submit:', json.dumps(call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js_state}).get('result',{}).get('value'), indent=2))
