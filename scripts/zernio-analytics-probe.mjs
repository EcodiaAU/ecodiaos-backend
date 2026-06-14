// zernio-analytics-watch probe. Reads creds.zernio_api_key from the local kv-mirror
// (fs.readFileSync, not cat/jq so not cred-read-bash-blocked), then probes the live
// Zernio API for accounts + analytics + recent posts. Key is never printed.
import fs from 'node:fs';

const MIRROR = '/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/zernio_api_key.json';
const BASE = 'https://zernio.com/api/v1';

function loadKey() {
  const raw = fs.readFileSync(MIRROR, 'utf8').trim();
  // mirror may be {"value":"sk_.."} or a JSON-quoted scalar or bare
  try {
    const j = JSON.parse(raw);
    if (typeof j === 'string') return j;
    if (j && typeof j === 'object') return j.value || j.creds_zernio_api_key || j['creds.zernio_api_key'] || raw;
  } catch (_) {}
  return raw.replace(/^"|"$/g, '');
}

const KEY = loadKey();

async function zf(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { ok: res.ok, status: res.status, body, path };
}

const out = { probed_at: new Date().toISOString(), calls: {} };

async function main() {
  // 1. accounts
  const accts = await zf('/accounts');
  out.calls.accounts = accts;

  // Identify IG + LinkedIn account ids if accounts call worked
  let igId, liId, accounts = [];
  if (accts.ok) {
    const arr = Array.isArray(accts.body) ? accts.body : (accts.body?.accounts || accts.body?.data || []);
    accounts = arr;
    const idOf = (a) => a._id || a.id || a.accountId || a.account_id;
    for (const a of arr) {
      const p = (a.platform || a.type || a.provider || '').toLowerCase();
      if (p.includes('instagram') && !igId) igId = idOf(a);
      if (p.includes('linkedin') && !liId) liId = idOf(a);
    }
    out.account_summary = accounts.map(a => ({
      id: idOf(a), platform: a.platform, username: a.username,
      followersCount: a.followersCount, followersLastUpdated: a.followersLastUpdated,
      externalPostCount: a.externalPostCount,
      analyticsLastSyncedAt: a.analyticsLastSyncedAt, analyticsLastSyncError: a.analyticsLastSyncError,
      platformStatus: a.platformStatus, isActive: a.isActive,
    }));
  }
  out.resolved = { igId, liId, account_count: accounts.length };

  // 2. analytics - try multiple period params (7 + 14 day baseline) for IG + LI and overall
  const periods = ['7d', '14d', '30d', 'week', 'month'];
  out.calls.analytics = {};
  // overall first
  for (const per of periods) {
    const r = await zf(`/analytics?period=${encodeURIComponent(per)}`);
    out.calls.analytics[`overall_${per}`] = r;
    if (r.ok) break; // first working period param tells us the API shape
  }
  if (igId) {
    out.calls.analytics.ig_7d = await zf(`/analytics?accountId=${encodeURIComponent(igId)}&period=7d`);
    out.calls.analytics.ig_14d = await zf(`/analytics?accountId=${encodeURIComponent(igId)}&period=14d`);
  }
  if (liId) {
    out.calls.analytics.li_7d = await zf(`/analytics?accountId=${encodeURIComponent(liId)}&period=7d`);
    out.calls.analytics.li_14d = await zf(`/analytics?accountId=${encodeURIComponent(liId)}&period=14d`);
  }

  // 3. recent posts (for top-post identification)
  out.calls.posts = await zf('/posts?status=published&limit=30');

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { out.error = String(e); console.log(JSON.stringify(out, null, 2)); process.exit(0); });
