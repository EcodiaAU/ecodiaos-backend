import json, urllib.request, time, base64

TOK = 'fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f'
URL = 'http://100.114.219.69:7456/api/tool'


def call(tool, params, timeout=60):
    body = json.dumps({'tool': tool, 'params': params}).encode('utf-8')
    req = urllib.request.Request(
        URL, data=body,
        headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'http_error': e.code, 'body': e.read().decode('utf-8', 'replace')[:500]}


features = (
    'Roam differs from Apple Maps in ways that matter for remote AU driving. The CarPlay scene surfaces these on the in-dash display:\n\n'
    '1. Offline-first. Apple Maps needs connectivity. Roam packages a full trip bundle (tiles, routing graph, elevation, POIs, hazards, fuel) before departure and runs end-to-end with no signal. CPMapTemplate and CPNavigationSession keep rendering and announcing while the phone has zero bars.\n\n'
    '2. Australian-specific hazard overlays. Roam aggregates real-time feeds from each state and territory transport authority (QLD TMR, Transport for NSW, VicTraffic, SA DIT, Main Roads WA, NT DIPL, Tas DSG), BOM flood gauges, NAFI bushfire perimeters, DEA satellite-derived road surface. Apple Maps does not surface these. CarPlay fires a CPNavigationAlert when the driver enters 8 km of any hazard cell.\n\n'
    '3. Fuel-stop guidance. Per-trip fuel range model using vehicle profile, elevation, and speed. Identifies last-chance stations before remote stretches. CarPlay alerts at 40 km from a last-chance stop, or sooner if range cannot reach the next stop.\n\n'
    '4. Fatigue management at AU NHVR intervals, with rest-area data.\n\n'
    '5. Wildlife collision zones. Strike is top-three for remote-AU damage. State heatmap data plus time-of-day risk (roos at dawn/dusk, cassowaries in the wet, camel/donkey in the central north). CarPlay alerts on enter-and-time match.\n\n'
    '6. Satellite-verified road condition. DEA Sentinel flags surface degradation since last survey (washouts, sandbar reformation, flood damage).\n\n'
    'Test plan: full coverage on Xcode CarPlay simulator (no entitlement needed) - scene connect, CPMapTemplate, CPSearchTemplate, CPListTemplate, CPNavigationSession with CPManeuver updates, CPNavigationAlert for hazards and fuel, scene disconnect. Real-vehicle testing on one factory and one aftermarket CarPlay before TestFlight ramp.\n\n'
    'Privacy: CarPlay accesses the same data as the phone app. No additional categories.'
)
print('features len:', len(features))
assert len(features) < 2000

product = (
    'Roam is a turn-by-turn navigation app purpose-built for Australian outback and remote-area driving. It is not a general-purpose maps app; navigation is the product.\n\n'
    'The app is built for one sharply-defined use case: long-distance driving across stretches of Australia with no cellular coverage for hours at a time. The Stuart Highway, the Tanami, the Gibb River Road, the Birdsville Track, the Oodnadatta, the Strzelecki, large parts of the Pilbara, Cape York above Coen, much of western and northern Tasmania.\n\n'
    'Roam packages a full trip bundle (tiles, routing graph, elevation, POIs, hazard snapshots, fuel inventory) on the phone before departure, then runs the route end-to-end with no connectivity. CarPlay mirrors this offline-first behaviour on the in-dash display - the route, hazards, and fuel-range guidance continue to render and announce while the phone has zero bars.\n\n'
    'Target audience: grey nomads (around 250,000 active caravan rigs in Australia), 4WD enthusiasts (around 1.2 million 4WD vehicles registered for off-highway use), recreational road-trippers off the highway grid, and station and outback property owners. Total addressable market is small in global terms but completely under-served by existing CarPlay-enabled navigation apps optimised for urban and inter-urban driving in countries with continuous cellular coverage.\n\n'
    'The phone app ships under bundle id au.ecodia.roam (v1.0 in App Store review). The CarPlay scene is built on the v1.1 codebase (TestFlight build 27 uploaded and processing).'
)
print('product len:', len(product))
assert len(product) < 2000


def set_textarea(tid, val):
    js = (
        '(function(){var e=document.getElementById(' + json.dumps(tid) + ');'
        'var s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value").set;'
        's.call(e,' + json.dumps(val) + ');'
        'e.dispatchEvent(new Event("input",{bubbles:true}));'
        'e.dispatchEvent(new Event("change",{bubbles:true}));'
        'return {id:e.id,len:e.value.length};})()'
    )
    return call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js}).get('result', {}).get('value')


print('product set:', set_textarea('product', product))
print('features set:', set_textarea('features', features))
print('url set:', set_textarea(
    'app_store_url',
    'au.ecodia.roam currently in App Store review for v1.0. CarPlay-bearing v1.1 (build 27) uploaded to TestFlight.'
))

b64s = [base64.b64encode(open('drafts/cp-shots/roam-cp-shot-' + str(n) + '.jpg', 'rb').read()).decode('ascii') for n in (1, 2, 3)]

for idx, (input_id, b) in enumerate(zip(['screenshot_upload', 'screenshot_upload_1', 'screenshot_upload_2'], b64s), start=1):
    js = (
        '(function(){'
        'var el=document.getElementById(' + json.dumps(input_id) + ');'
        'var b=' + json.dumps(b) + ';'
        'var bin=atob(b);'
        'var arr=new Uint8Array(bin.length);'
        'for(var j=0;j<bin.length;j++)arr[j]=bin.charCodeAt(j);'
        'var f=new File([arr],"roam-cp-shot-' + str(idx) + '.jpg",{type:"image/jpeg",lastModified:Date.now()});'
        'var dt=new DataTransfer(); dt.items.add(f);'
        'el.files=dt.files;'
        'el.dispatchEvent(new Event("change",{bubbles:true}));'
        'return {id:el.id, name:el.files[0] && el.files[0].name, size:el.files[0] && el.files[0].size};'
        '})()'
    )
    print('attach ' + input_id + ':',
          call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': js}, timeout=60).get('result', {}).get('value'))

print('policy:',
      call('cdp.runJs', {'target': {'alias': 'carplay'},
                         'js': "(function(){var c=document.querySelector('input[name=chk_policy_agree]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));return {checked:c.checked};})()"
                         }).get('result', {}).get('value'))

s = call('cdp.runJs', {'target': {'alias': 'carplay'},
                       'js': "(function(){return {p:document.getElementById('product').value.length, f:document.getElementById('features').value.length, u:document.getElementById('app_store_url').value.length, pol:document.querySelector('input[name=chk_policy_agree]').checked, files:[].slice.call(document.querySelectorAll('input[type=file]')).map(function(i){return {id:i.id, n:i.files.length};})};})()"
                       }).get('result', {}).get('value')
print('PRE-SUBMIT:', json.dumps(s, indent=2))

print('SUBMITTING...')
call('cdp.runJs', {'target': {'alias': 'carplay'}, 'js': "document.getElementById('submit').click()"})

for sec in (4, 8, 14, 22, 32, 45):
    time.sleep(4 if sec == 4 else (sec - 4 if sec < 14 else 4))
    s2 = call('cdp.runJs', {'target': {'alias': 'carplay'},
                            'js': "(function(){return {url:location.href, h1:document.querySelector('h1') && document.querySelector('h1').innerText, errors:[].slice.call(document.querySelectorAll('.form-error,.error,[role=alert],.errortext,.form-message,.notification')).map(function(e){return e.innerText;}).filter(Boolean), body: document.body.innerText.slice(0,800)};})()"
                            }).get('result', {}).get('value', {})
    print('t+' + str(sec) + 's: url=' + (s2.get('url', '?')[:90]) + ' h1=' + (s2.get('h1', '?')[:70] if s2.get('h1') else ''))
    if s2.get('errors'):
        print('  ERRORS:', s2['errors'])
    body = s2.get('body', '') or ''
    if 'received' in body.lower() or 'success' in s2.get('url', '').lower():
        print('---SUCCESS BODY---')
        print(body)
        break
