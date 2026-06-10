"""Capture admin baseline screenshots from prod (already logged in)."""
import requests, base64, os, time
TOK = open('C:/Users/tjdTa/.ecodiaos/laptop-agent.token').read().strip()
URL = 'http://127.0.0.1:7456/api/tool'
ALIAS = 'eos-main-resonaverde'
OUT = 'D:/.code/EcodiaOS/backend/drafts/resonaverde-audit'

def call(t, p):
    return requests.post(URL,
        headers={'Authorization':'Bearer '+TOK,'Content-Type':'application/json'},
        json={'tool':t,'params':p}).json()

def viewport(w, h):
    return call('cdp.viewport', {'alias':ALIAS,'width':w,'height':h,'deviceScaleFactor':1,'mobile': w < 700})

def navigate(url):
    return call('cdp.navigate', {'alias':ALIAS,'url':url})

def shot(name, full=True):
    j = call('cdp.pageScreenshot', {'alias':ALIAS,'fullPage':full})
    img = j.get('result',{}).get('image') or j.get('image')
    if not img: print('NO IMAGE', name); return
    open(os.path.join(OUT, name),'wb').write(base64.b64decode(img))
    print(f'  {name} ({len(base64.b64decode(img))//1024} KB)')

pages = [
    ('write',       'https://resonaverde.au/admin/write'),
    ('copy',        'https://resonaverde.au/admin/copy'),
    ('resources',   'https://resonaverde.au/admin/resources'),
    ('subscribers', 'https://resonaverde.au/admin/subscribers'),
    ('login',       'https://resonaverde.au/login'),
]

for label, vp in [('desktop',(1440,900)), ('mobile',(390,844))]:
    print(f'=== {label.upper()} {vp[0]} ===')
    viewport(*vp)
    for slug, url in pages:
        print(f'-> {slug}')
        navigate(url); time.sleep(4)
        shot(f'admin-baseline-{label}-{slug}.png', full=True)

viewport(1440, 900)
print('done')
