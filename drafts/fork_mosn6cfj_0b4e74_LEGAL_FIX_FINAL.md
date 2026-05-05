# fork_mosn6cfj_0b4e74 — LEGAL FIX FINAL

**Verdict:** Fix already shipped by prior fork. My brief's premise ("ZERO commits, free to author fresh") was wrong. Verified live + working in production. No new commit authored.

## Brief premise vs reality

Brief said the prior 2 forks (fork_mosmrrvi_edbb96 + fork_mosn1zx3_c8ee20) bailed without commits. Wrong. Commit `716f2c9` by fork_mosmrrvi_edbb96 landed at 2026-05-05 12:56:31 UTC, before the brief was authored.

## Option shipped (by prior fork)

**Option A — Vercel rewrite.** Single-file fix, 8 lines added.

`vercel.json` (created):
```json
{
  "rewrites": [
    {
      "source": "/api/docs/:path*",
      "destination": "https://api.admin.ecodia.au/api/docs/:path*"
    }
  ]
}
```

The `/files/` segment is in the legal-structure page hrefs (e.g. `/api/docs/files/ecodia-dao-operating-agreement.pdf`), not in the rewrite rule. `:path*` passes everything after `/api/docs/` through, so the path correctly arrives at the backend as `/api/docs/files/<file>.pdf` — which is the verified-200 backend route.

**Files changed:** `vercel.json` (new file). Commit SHA: `716f2c9`.

## Pre-fix vs post-deploy curl results

Backend probe (proves backend route shape):
- `https://api.admin.ecodia.au/api/docs/<file>.pdf` → 404
- `https://api.admin.ecodia.au/api/docs/files/<file>.pdf` → 200 ✅ (this is what the rewrite passes through to)

Production verification through `https://ecodia.au/api/docs/files/<file>.pdf`:

| Document | Status |
|---|---|
| ecodia-dao-operating-agreement.pdf | HTTP/2 200 ✅ |
| ecodia-dao-living-constitution.pdf | HTTP/2 200 ✅ |
| ecodia-dao-initial-resolutions.pdf | HTTP/2 200 ✅ |
| ecodia-ip-license-agreement-2026-04-08.pdf | HTTP/2 200 ✅ |
| llc-amendment.pdf | HTTP/2 404 ❌ (backend file-placement issue, NOT a rewrite issue) |

llc-amendment.pdf 404s on the backend itself (`api.admin.ecodia.au/api/docs/files/llc-amendment.pdf` returns 404). File exists at `~/ecodiaos/dao/llc-amendment.pdf` but not in `~/ecodiaos/public/docs/`. Captured as separate P3 status_board row `821f953f-99cf-41bb-8ffb-b3c88b5b1737` with explicit next_action_by=ecodiaos. NOT touched per brief: "DO NOT: Touch ecodiaos-backend (Wave C will be working there in parallel)".

## Vercel deployment

Commit pushed to `origin/main` (EcodiaTate/EcodiaSite). Production curl returns 200 → Vercel auto-deployed via existing GitHub integration. No manual deploy trigger needed.

## status_board

- `f13db2d1-af3f-446f-adf9-ab43e3ce6720` ("ecodia.au /legal page docs 404 - /api/docs/* not served by ecodia-site") — already archived 2026-05-05 12:58:01 UTC by prior fork, status `fixed_via_vercel_rewrite_commit_716f2c9`. No update needed.
- `821f953f-99cf-41bb-8ffb-b3c88b5b1737` ("llc-amendment.pdf 404 on api.admin.ecodia.au backend - file not in public/docs/") — open P3, next_action_by=ecodiaos. Already captured by prior fork, no duplicate row needed.

## Other findings on the site

None observed during this fork. Did not scope-expand to scan further.

## Note for conductor

Brief's premise check failed: "ZERO commits on EcodiaSite repo since 22:52 AEST trigger" was false. The continuation-aware-fork-redispatch pattern was correctly applied here — discovered prior fork's deliverables before redoing — and prevented a duplicate commit. Worth checking how the brief was authored: likely `git log` was run against the wrong repo or wrong path (brief warned against `~/workspaces/ecodia-site` which doesn't exist; possibly the same lookup mistake produced a "no commits" reading).
