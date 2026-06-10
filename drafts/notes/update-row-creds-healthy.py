import json, urllib.request
from pathlib import Path
env={}
for line in Path('D:/PRIVATE/ecodia-creds/supabase.env').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k,v=line.strip().split('=',1); env[k]=v.strip().strip('"').strip("'")
tok = env['SUPABASE_ACCESS_TOKEN']
sql = """
UPDATE status_board SET
  status = 'live_2026-05-27_creds_reseeded_refresher_online_zombie_evicted',
  next_action = 'CRED SUBSTRATE FULLY HEALTHY 2026-05-27. After a 3rd cred-clobber (I caused it via blind pm2 restart reloading the zombie refresh-clobber-watchdog from the dump), recovered + hardened: (1) all 3 accounts re-seeded fresh into D:/PRIVATE/ecodia-creds/ (tate 6h, money/code 8h runway, current_account verified). (2) zombie refresh-clobber-watchdog evicted from PM2 memory (was looping 1746 restarts on deleted file) + confirmed absent from dump. (3) legit cred-refresher.js started + pm2-saved (reboot-safe, 4 clean processes). (4) GUARDRAIL TRIAD shipped: pattern pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27.md + PreToolUse hook pm2_restart_guard.py (hard-blocks all pm2 mutations sans token, blocks clobber-watchdog recreation) + CLAUDE.md hard-stop + auto-memory. Remaining 24/7 build queue: wire failureEscalate + conductorClaims into call sites, unit/integration tests, 0th-class docs, reflex hook, self-management agent, corazonWatchdog VPS deploy, E2E smoke (now UNGATED - creds seeded).',
  last_touched = NOW()
WHERE id = '1227ffc0-694d-43e6-972b-fb78f3d65a58'
RETURNING id, status
"""
body=json.dumps({'query':sql}).encode()
req=urllib.request.Request('https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query', data=body, headers={'Authorization':f'Bearer {tok}','Content-Type':'application/json','User-Agent':'EcodiaOS/1.0'}, method='POST')
print(urllib.request.urlopen(req,timeout=15).read().decode())
