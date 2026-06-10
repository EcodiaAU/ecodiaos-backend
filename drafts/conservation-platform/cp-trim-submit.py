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

features = '''Roam differs from Apple Maps in ways that matter for remote AU driving. The CarPlay scene surfaces all of these on the in-dash display:

1. Offline-first. Apple Maps needs connectivity. Roam packages a full trip bundle (tiles, routing graph, elevation, POIs, hazards, fuel) before departure and runs end-to-end with no signal. CPMapTemplate and CPNavigationSession keep rendering and announcing while the phone has zero bars.

2. Australian-specific hazard overlays. Roam aggregates real-time hazard feeds from each state/territory transport authority (QLD TMR, Transport for NSW, VicTraffic, SA DIT, Main Roads WA, NT DIPL, Tas DSG), BOM flood gauges, NAFI bushfire perimeters, DEA satellite-derived road surface. Apple Maps does not surface these. CarPlay fires a CPNavigationAlert when the driver enters 8 km proximity to any hazard cell, severity-ranked.

3. Fuel-stop guidance for remote stretches. Roam runs a per-trip fuel range model using vehicle profile and elevation/speed profile. Identifies last-chance stations before remote stretches. CarPlay alerts at 40 km from a last-chance stop, or sooner if range cannot reach the next stop.

4. Fatigue management aligned to AU NHVR-style intervals, with knowledge of which rest areas on the route are actually usable.

5. Wildlife collision zones. Wildlife strike is a top-three cause of remote-AU damage. Roam ingests state wildlife-strike heatmap data plus time-of-day risk weighting (roos at dawn/dusk, cassowaries in the wet, camel/donkey in the central north). CarPlay alerts on enter-and-time-window match.

6. Satellite-verified road condition. DEA Sentinel-derived imagery flags surface degradation since last official survey (washouts, sandbar reformation, recent flood damage). Critical on unsealed routes in the wet.

Test plan: full coverage on Xcode CarPlay simulator (no entitlement needed) - scene connect, CPMapTemplate, CPSearchTemplate against Roam places backend, CPListTemplate for saved trips, CPNavigationSession with CPManeuver updates, CPNavigationAlert hazard + fuel warnings, scene disconnect handover. Real-vehicle testing on one factory-CarPlay vehicle and one aftermarket head unit before TestFlight ramp. Privacy: CarPlay scene accesses exactly the data the phone app already accesses.'''
print(f'new features len: {len(features)}')

js = '''(()=>{
  const e = document.getElementById('features');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(e, FTRS);
  e.dispatchEvent(new Event('input',{bubbles:true}));
  e.dispatchEvent(new Event('change',{bubbles:true}));
  return {len: e.value.length};
})()'''.replace('FTRS', json.dumps(features))
print('features trim:', call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js}).get('result',{}).get('value'))

# Also trim app_store_url just in case
url_short = 'Bundle id au.ecodia.roam currently in App Store review for v1.0. CarPlay-bearing v1.1 (build 27) uploaded and processing on TestFlight.'
js2 = '''(()=>{
  const e = document.getElementById('app_store_url');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(e, URL_VAL);
  e.dispatchEvent(new Event('input',{bubbles:true}));
  return {len: e.value.length};
})()'''.replace('URL_VAL', json.dumps(url_short))
print('url trim:', call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js2}).get('result',{}).get('value'))

# Re-attach files since the form may have reset them on submit attempt
import base64
b64s = [base64.b64encode(open(f'drafts/cp-shots/roam-cp-shot-{n}.jpg','rb').read()).decode('ascii') for n in (1,2,3)]
js_files = '''(()=>{
  const inputs=['screenshot_upload','screenshot_upload_1','screenshot_upload_2'];
  const b64s=[B0,B1,B2];
  return inputs.map((id,i)=>{
    const el=document.getElementById(id);
    if (el.files && el.files.length>0) return {id, kept: el.files[0].name, size: el.files[0].size};
    const bin=atob(b64s[i]); const arr=new Uint8Array(bin.length);
    for(let j=0;j<bin.length;j++)arr[j]=bin.charCodeAt(j);
    const f=new File([arr],`roam-cp-shot-${i+1}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
    const dt=new DataTransfer(); dt.items.add(f);
    el.files=dt.files;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return {id, reattached: el.files[0].name, size: el.files[0].size};
  });
})()'''
for i,b in enumerate(b64s):
    js_files = js_files.replace(f'B{i}', json.dumps(b))
print('files state:', json.dumps(call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js_files}, timeout=60).get('result',{}).get('value'), indent=2))

# Re-check policy
js_pol = "(()=>{const c=document.querySelector('input[name=chk_policy_agree]'); if(!c.checked){c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); c.dispatchEvent(new Event('click',{bubbles:true}));} return {checked: c.checked};})()"
print('policy:', call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js_pol}).get('result',{}).get('value'))

# Submit
print('submitting...')
r = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': "(()=>{document.getElementById('submit').click(); return {ok:true};})()"})
print(r.get('result',{}).get('value'))

for sec in (3, 6, 10, 16, 24):
    time.sleep(3 if sec==3 else (sec-3 if sec<10 else 4))
    s = call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': "(()=>({url:location.href, h1:document.querySelector('h1')?.innerText, errors:[...document.querySelectorAll('.form-error,.error,[role=alert],.errortext')].map(e=>e.innerText).filter(Boolean), body800: document.body.innerText.slice(0,800)}))()"}).get('result',{}).get('value',{})
    print(f't+{sec}s: url={s.get("url","?")[:90]} | h1={s.get("h1","?")[:70]}')
    if s.get('errors'):
        print(f'  errs: {s["errors"]}')
    if 'success' in s.get('url','').lower() or 'thank' in s.get('url','').lower() or 'submitted' in s.get('body800','').lower() or 'received' in s.get('body800','').lower():
        print('---BODY---'); print(s.get('body800','')); break
