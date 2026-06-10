import json, urllib.request
from pathlib import Path
env={}
for line in Path('D:/PRIVATE/ecodia-creds/supabase.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k,v=line.strip().split('=',1); env[k]=v.strip().strip('"').strip("'")
tok = env['SUPABASE_ACCESS_TOKEN']
sql = """
UPDATE status_board SET
  status = 'live_2026-05-27_substrate_fully_active',
  next_action = 'Substrate is live: agent on new code (coord.close_my_tab loaded), DATABASE_URL on pooler port 5432 RW (port 6543 was routing read-only), scheduler firing, 3 workers spawned + processed since 06:00 UTC. Open follow-ups now narrower: (a) seed code@/money@ cred files for parallel-account dispatch. (b) wire failureEscalate.fire into existing tripwire surfaces. (c) wire conductorClaims.withClaim at email triage / status_board pickup / scheduled task dispatch call sites. (d) commit eos-laptop-agent .env port-5432 fix (separate repo). (e) deploy corazonWatchdog on VPS. Doctrine: patterns/24x7-autonomy-architecture-invariants-2026-05-27.md. Spec: backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md.',
  last_touched = NOW()
WHERE id = '1227ffc0-694d-43e6-972b-fb78f3d65a58'
RETURNING id, status
"""
body=json.dumps({'query':sql}).encode()
req=urllib.request.Request('https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query', data=body, headers={'Authorization':f'Bearer {tok}','Content-Type':'application/json','User-Agent':'EcodiaOS/1.0'}, method='POST')
print(urllib.request.urlopen(req,timeout=15).read().decode())
