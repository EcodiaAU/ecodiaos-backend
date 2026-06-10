"""Verify sticky header behaviour + mobile side-sheet X on prod."""
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

def shot(name, full=False):
    j = call('cdp.pageScreenshot', {'alias':ALIAS,'fullPage':full})
    img = j.get('result',{}).get('image') or j.get('image')
    if not img: print('NO IMAGE', name); return
    open(os.path.join(OUT, name),'wb').write(base64.b64decode(img))
    print(f'  {name} ({len(base64.b64decode(img))//1024} KB)')

def runJs(js):
    return call('cdp.runJs', {'alias':ALIAS,'js':js})

# DESKTOP sticky check
print('=== DESKTOP STICKY ===')
viewport(1440, 900)
navigate('https://resonaverde.au/')
time.sleep(3)
runJs('window.scrollTo(0, 1200)')
time.sleep(0.5)
shot('verify-desktop-scrolled.png', full=False)
print('  scrollY now:', runJs('window.scrollY')['result']['value'])

# MOBILE sticky check
print('=== MOBILE STICKY ===')
viewport(390, 844)
navigate('https://resonaverde.au/')
time.sleep(3)
runJs('window.scrollTo(0, 1200)')
time.sleep(0.5)
shot('verify-mobile-scrolled.png', full=False)
print('  scrollY now:', runJs('window.scrollY')['result']['value'])

# MOBILE side sheet open
print('=== MOBILE SIDE SHEET ===')
navigate('https://resonaverde.au/')
time.sleep(3)
# Click the hamburger button - use cdp.clickByTag
r = call('cdp.clickByTag', {'alias':ALIAS,'tag':'BUTTON','aria-label':'Open menu'})
print('  click result:', r.get('result',{}).get('ok'), '|', r.get('error','')[:80])
time.sleep(0.6)
shot('verify-mobile-sheet-open.png', full=False)

viewport(1440, 900)
print('done')
