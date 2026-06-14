// Analyse the zernio probe output: window posts by publishedAt, compute per-account
// week metrics + 14d baseline, run anomaly detection, emit a clean report + snapshot.
import fs from 'node:fs';

const probe = JSON.parse(fs.readFileSync('/tmp/zernio-probe.json', 'utf8'));
const NOW = new Date(probe.probed_at).getTime();
const DAY = 86400000;

function postsFor(call) {
  const b = probe.calls.analytics?.[call]?.body;
  return (b && Array.isArray(b.posts)) ? b.posts : [];
}

// Pull the platform-level analytics row matching the account for a post
function platRow(post, platform) {
  const p = (post.platforms || []).find(x => (x.platform || '').toLowerCase() === platform);
  return p?.analytics || post.analytics || {};
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function std(xs) { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }

function analyseAccount(label, platform, call) {
  const all = postsFor(call).map(p => {
    const a = platRow(p, platform);
    return {
      id: p._id,
      content: (p.content || '').replace(/\s+/g, ' ').slice(0, 120),
      publishedAt: p.publishedAt,
      ageDays: (NOW - new Date(p.publishedAt).getTime()) / DAY,
      impressions: a.impressions || 0,
      reach: a.reach || 0,
      likes: a.likes || 0,
      comments: a.comments || 0,
      shares: a.shares || 0,
      saves: a.saves || 0,
      clicks: a.clicks || 0,
      engagementRate: a.engagementRate || 0,
    };
  }).filter(p => p.publishedAt);

  const week = all.filter(p => p.ageDays <= 7);
  const baseline = all.filter(p => p.ageDays > 7 && p.ageDays <= 21); // 14d window before this week

  const weekImpr = week.map(p => p.impressions);
  const baseImpr = baseline.map(p => p.impressions);
  const baseMean = mean(baseImpr), baseStd = std(baseImpr);
  const anomalyThreshold = baseMean + 2 * baseStd;

  // top post this week by impressions
  const top = [...week].sort((a, b) => b.impressions - a.impressions)[0] || null;

  // anomalies: week posts whose impressions exceed baseline mean + 2*std (and baseline existed)
  const anomalies = baseline.length >= 3
    ? week.filter(p => p.impressions > anomalyThreshold && p.impressions > 0)
        .map(p => ({ ...p, x_over_baseline_mean: baseMean ? +(p.impressions / baseMean).toFixed(2) : null }))
    : [];

  return {
    label, platform,
    week_post_count: week.length,
    week_total_impressions: weekImpr.reduce((a, b) => a + b, 0),
    week_total_reach: week.reduce((a, b) => a + b.reach, 0),
    week_total_clicks: week.reduce((a, b) => a + b.clicks, 0),
    week_total_engagements: week.reduce((a, b) => a + b.likes + b.comments + b.shares + b.saves, 0),
    week_mean_engagement_rate: +mean(week.map(p => p.engagementRate)).toFixed(2),
    baseline_post_count: baseline.length,
    baseline_mean_impressions: +baseMean.toFixed(1),
    baseline_std_impressions: +baseStd.toFixed(1),
    anomaly_threshold_impressions: +anomalyThreshold.toFixed(1),
    top_post: top ? { content: top.content, impressions: top.impressions, engagementRate: top.engagementRate, clicks: top.clicks, publishedAt: top.publishedAt } : null,
    anomalies,
  };
}

const acctSummary = probe.account_summary || [];
const followers = {};
for (const a of acctSummary) followers[a.platform] = { followersCount: a.followersCount, asOf: a.followersLastUpdated };

const report = {
  generated_at: probe.probed_at,
  weekday_utc: new Date(probe.probed_at).getUTCDay(), // 0=Sun
  followers,
  instagram: analyseAccount('Instagram @ecodia.au', 'instagram', 'ig_14d'),
  linkedin: analyseAccount('LinkedIn Ecodia', 'linkedin', 'li_14d'),
};

// Snapshot for kv_store (follower-delta baseline for next fire)
const snapshot = {
  date: probe.probed_at.slice(0, 10),
  probed_at: probe.probed_at,
  followers: {
    instagram: followers.instagram?.followersCount ?? null,
    linkedin: followers.linkedin?.followersCount ?? null,
    facebook: followers.facebook?.followersCount ?? null,
  },
  week_impressions: {
    instagram: report.instagram.week_total_impressions,
    linkedin: report.linkedin.week_total_impressions,
  },
};

fs.writeFileSync('/tmp/zernio-report.json', JSON.stringify(report, null, 2));
fs.writeFileSync('/tmp/zernio-snapshot.json', JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('\n=== SNAPSHOT ===\n' + JSON.stringify(snapshot));
