import os, sys, json, urllib.request, urllib.error
from pathlib import Path


def load_env(p):
    out = {}
    for line in Path(p).read_text(encoding='utf-8').splitlines():
        s = line.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k, v = s.split('=', 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


env = load_env('D:/PRIVATE/ecodia-creds/supabase.env')
tok = env.get('SUPABASE_ACCESS_TOKEN')
if not tok:
    sys.exit('PAT missing in D:/PRIVATE/ecodia-creds/supabase.env')

# nxmtfzofemtrlezlyhcj = EcodiaOS / ecodia-api project ref
PROJECT_REF = 'nxmtfzofemtrlezlyhcj'

sql = Path('D:/.code/EcodiaOS/backend/src/db/migrations/138_conductor_claims.sql').read_text(encoding='utf-8')

body = json.dumps({'query': sql}).encode('utf-8')
req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
    data=body,
    headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'User-Agent': 'EcodiaOS-Migration/1.0'},
    method='POST',
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print('STATUS', r.status)
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print('HTTPError', e.code)
    print(e.read().decode())
