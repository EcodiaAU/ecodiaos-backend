import json, urllib.request
from pathlib import Path
env={}
for line in Path('D:/PRIVATE/ecodia-creds/supabase.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k,v=line.strip().split('=',1); env[k]=v.strip().strip('"').strip("'")
tok = env['SUPABASE_ACCESS_TOKEN']
sql = """
SELECT rolname, rolsuper, rolcanlogin, rolconfig
FROM pg_roles
WHERE rolname IN ('postgres','authenticator','supabase_admin','supabase_read_only_user','anon','service_role')
ORDER BY rolname
"""
body=json.dumps({'query':sql}).encode()
req=urllib.request.Request('https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query', data=body, headers={'Authorization':f'Bearer {tok}','Content-Type':'application/json','User-Agent':'EcodiaOS/1.0'}, method='POST')
print(urllib.request.urlopen(req,timeout=15).read().decode())
