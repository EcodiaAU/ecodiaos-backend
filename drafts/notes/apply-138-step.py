import json, urllib.request, urllib.error
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
tok = env['SUPABASE_ACCESS_TOKEN']
PROJECT_REF = 'nxmtfzofemtrlezlyhcj'


def run(label, sql):
    body = json.dumps({'query': sql}).encode()
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
        data=body,
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'User-Agent': 'EcodiaOS-Migration/1.0'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(label, 'OK', r.status, r.read().decode()[:200])
    except urllib.error.HTTPError as e:
        print(label, 'ERR', e.code, e.read().decode()[:400])


# Probe what's there first.
run('probe', "SELECT column_name FROM information_schema.columns WHERE table_name = 'conductor_claims' ORDER BY ordinal_position")
