"""Capture full-page screenshots of resonaverde public pages at desktop + mobile."""
import requests, base64, json, time, os, sys

TOK = open('C:/Users/tjdTa/.ecodiaos/laptop-agent.token').read().strip()
URL = 'http://127.0.0.1:7456/api/tool'
ALIAS = 'eos-main-resonaverde'
OUT = 'D:/.code/EcodiaOS/backend/drafts/resonaverde-audit'
os.makedirs(OUT, exist_ok=True)

def call(tool, params):
    r = requests.post(URL, headers={'Authorization':'Bearer '+TOK,'Content-Type':'application/json'},
                      json={'tool':tool,'params':params})
    return r.json()

def viewport(w, h):
    return call('cdp.viewport', {'alias':ALIAS,'width':w,'height':h,'deviceScaleFactor':1,'mobile': w < 700})

def navigate(url):
    return call('cdp.navigate', {'alias':ALIAS,'url':url})

def shot(name, full=True):
    j = call('cdp.pageScreenshot', {'alias':ALIAS,'fullPage':full})
    img = j.get('result',{}).get('image') or j.get('image')
    if not img:
        print('NO IMAGE for', name, json.dumps(j)[:300]); return None
    path = os.path.join(OUT, name)
    open(path,'wb').write(base64.b64decode(img))
    print(f'  saved {name} ({len(base64.b64decode(img))//1024} KB)')
    return path

# Pages to audit
pages = [
    ('home',     'https://resonaverde.au/'),
    ('blog',     'https://resonaverde.au/blog'),
    ('resources','https://resonaverde.au/resources'),
    ('privacy',  'https://resonaverde.au/privacy-policy'),
    ('terms',    'https://resonaverde.au/terms'),
]

# DESKTOP 1440
print('=== DESKTOP 1440 ===')
viewport(1440, 900)
for slug, url in pages:
    print(f'-> {slug} ({url})')
    navigate(url)
    time.sleep(2.5)
    shot(f'desktop-{slug}.png', full=True)

# MOBILE 390 (iPhone 14)
print('=== MOBILE 390 ===')
viewport(390, 844)
for slug, url in pages:
    print(f'-> {slug}')
    navigate(url)
    time.sleep(2.5)
    shot(f'mobile-{slug}.png', full=True)

# TABLET 768
print('=== TABLET 768 ===')
viewport(768, 1024)
navigate(pages[0][1])
time.sleep(2.5)
shot('tablet-home.png', full=True)

# Reset to desktop for any follow-up
viewport(1440, 900)
print('done')
