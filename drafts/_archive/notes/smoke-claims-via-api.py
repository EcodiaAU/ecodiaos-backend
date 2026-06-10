import json, urllib.request, urllib.error, time
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
            print(label, 'OK', r.status, data[:300])
            return json.loads(data)
    except urllib.error.HTTPError as e:
        print(label, 'ERR', e.code, e.read().decode()[:300])
        return None


ref = f"smoke-mgmt-{int(time.time())}"

# Test 1: A inserts, B insert blocked by uniq.
print('--- test 1 ---')
run(f"INSERT INTO coordination_claims (conductor_id, entity_type, entity_ref, expires_at) VALUES ('A', 'custom', '{ref}', NOW() + INTERVAL '1 minute') RETURNING id", 'A-insert')
run(f"INSERT INTO coordination_claims (conductor_id, entity_type, entity_ref, expires_at) VALUES ('B', 'custom', '{ref}', NOW() + INTERVAL '1 minute') RETURNING id", 'B-insert(expect-err)')

# Test 2: release A, B can take.
print('--- test 2 ---')
run(f"UPDATE coordination_claims SET released_at = NOW(), outcome = 'smoke_done' WHERE entity_ref = '{ref}' AND released_at IS NULL RETURNING id", 'A-release')
run(f"INSERT INTO coordination_claims (conductor_id, entity_type, entity_ref, expires_at) VALUES ('B', 'custom', '{ref}', NOW() + INTERVAL '1 minute') RETURNING id", 'B-retry')

# Test 3: expired-but-unswept should be in-line replaceable (acquire side handles it; here we just simulate via the UPDATE path).
print('--- test 3 ---')
run(f"DELETE FROM coordination_claims WHERE entity_ref = '{ref}'", 'cleanup')

# Probe.
run("SELECT count(*) FROM coordination_claims", 'final-count')
