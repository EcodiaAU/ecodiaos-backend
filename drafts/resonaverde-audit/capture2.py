"""Capture iteration 2 screenshots (post-rewrite) at all viewports + pages."""
import requests, base64, os, time

TOK = open('C:/Users/tjdTa/.ecodiaos/laptop-agent.token').read().strip()
URL = 'http://127.0.0.1:7456/api/tool'
ALIAS = 'eos-main-resonaverde'
OUT = 'D:/.code/EcodiaOS/backend/drafts/resonaverde-audit'

def call(tool, params):
    return requests.post(URL,
        headers={'Authorization':'Bearer '+TOK,'Content-Type':'application/json'},
        json={'tool':tool,'params':params}).json()

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
    ('home',     'http://localhost:3000/'),
    ('blog',     'http://localhost:3000/blog'),
    ('resources','http://localhost:3000/resources'),
    ('privacy',  'http://localhost:3000/privacy-policy'),
    ('terms',    'http://localhost:3000/terms'),
]

print('=== DESKTOP 1440 ===')
viewport(1440, 900)
for slug, url in pages:
    print(f'-> {slug}')
    navigate(url); time.sleep(3.5)
    shot(f'v2-desktop-{slug}.png', full=True)

print('=== MOBILE 390 ===')
viewport(390, 844)
for slug, url in pages:
    print(f'-> {slug}')
    navigate(url); time.sleep(3.5)
    shot(f'v2-mobile-{slug}.png', full=True)

print('=== TABLET 768 ===')
viewport(768, 1024)
navigate(pages[0][1]); time.sleep(3.5)
shot('v2-tablet-home.png', full=True)
navigate(pages[1][1]); time.sleep(3.5)
shot('v2-tablet-blog.png', full=True)

viewport(1440, 900)
print('done')
