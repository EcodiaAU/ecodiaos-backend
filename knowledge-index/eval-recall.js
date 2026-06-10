// Retrieval-quality eval: replays today's forensic "pattern-existed-but-not-surfaced"
// failures as natural-language action-time queries and asserts the pattern that
// SHOULD have fired ranks top-K. This is the discriminating probe for the whole
// retrieval system: if these miss, the index is theatre. Run: node eval-recall.js
const { lookupHybrid } = require("./lookup");

// [query a model would actually make at action-time, substring of the doc that must surface, K]
const CASES = [
  ["I ran a SQL test and got 0 failures, is that a real pass", "verify", 5],
  ["confirm an app bug is actually fixed before claiming done", "verify-deployed-state", 5],
  ["the screenshot looks logged in but is it really authenticated", "verify-deployed-state", 5],
  ["a D: drive path on this mac", "mac-canonical-homes", 8],
  ["drive the ios simulator without stealing focus", "focusless", 5],
  ["get the supabase org PAT", "supabase-access-via-org-pat", 5],
  ["never blind restart pm2", "pm2-restart", 5],
  ["em dash banned", "em-dash", 3],
  ["dispatch a parallel worker", "dispatch-worker", 8],
  ["status board hygiene at session start", "status-board-hygiene", 8],
  ["how do I schedule a delayed follow up", "schedul", 8],
  ["client work scope discipline before pushing", "client", 8],
];

(async () => {
  let pass = 0;
  for (const [q, mustContain, k] of CASES) {
    const r = await lookupHybrid(q, { limit: Math.max(k, 5) });
    const paths = r.results.map((x) => x.path);
    const hitIdx = paths.findIndex((p) => p.toLowerCase().includes(mustContain.toLowerCase()));
    const ok = hitIdx >= 0 && hitIdx < k;
    if (ok) pass++;
    const mark = ok ? "PASS" : "MISS";
    const rank = hitIdx >= 0 ? `rank ${hitIdx + 1}` : "absent";
    console.log(`[${mark}] (${r.mode}) "${q}"`);
    console.log(`        want ~${mustContain} within top-${k}: ${rank}`);
    if (!ok) console.log(`        top: ${paths.slice(0, 5).map((p) => p.split("/").pop()).join(" | ")}`);
  }
  console.log(`\nrecall: ${pass}/${CASES.length} passed`);
  process.exit(pass === CASES.length ? 0 : 1);
})();
