import json, urllib.request, urllib.error
from pathlib import Path

env = {}
for line in Path('D:/PRIVATE/ecodia-creds/supabase.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s: continue
    k, v = s.split('=', 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
tok = env['SUPABASE_ACCESS_TOKEN']
REF = 'nxmtfzofemtrlezlyhcj'


def run(sql, label='?'):
    body = json.dumps({'query': sql}).encode()
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{REF}/database/query',
        data=body,
        headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json', 'User-Agent': 'EcodiaOS/1.0'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read().decode()
            print(label, 'OK', r.status, data[:400])
    except urllib.error.HTTPError as e:
        print(label, 'ERR', e.code, e.read().decode()[:400])


# One P2 row tracking the 24/7 autonomy ship + open follow-ups.
sql = """
INSERT INTO status_board (entity_type, entity_ref, name, status, next_action, next_action_by, priority, context, last_touched)
VALUES (
  'infrastructure',
  '24x7-autonomy-architecture-2026-05-27',
  '24/7 autonomy architecture v1 - P0/P1/P2 shipped, follow-ups pending',
  'p0_p1_p2_shipped_2026-05-27_follow_ups_open',
  'Open follow-ups: (a) restart laptop-agent to pick up coord.close_my_tab + new brief (memory pressure blocked auto-restart this session). (b) seed code@/money@ cred files (Tate manual sign-in). (c) elevated PM2 supervision of laptop-agent (Tate elevated PS run). (d) deploy corazonWatchdog on VPS (git pull + pm2 reload). (e) per-caller adoption of failureEscalate.fire in existing tripwire surfaces. (f) per-caller adoption of conductorClaims.withClaim for email triage / status_board pickup / scheduled task dispatch. (g) End-to-end smoke once agent restarts. Doctrine: patterns/24x7-autonomy-architecture-invariants-2026-05-27.md. Spec: backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md.',
  'ecodiaos',
  2,
  '{"spec":"backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md","pattern":"patterns/24x7-autonomy-architecture-invariants-2026-05-27.md","migration":"138_conductor_claims.sql"}'::jsonb,
  NOW()
)
RETURNING id
"""
run(sql, '24x7-row')
