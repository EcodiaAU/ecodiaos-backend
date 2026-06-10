# fork_mosmrrvi_edbb96 — ecodia.au /legal /api/docs/* fix

Ship date: 5 May 2026 ~22:57 AEST
Tate verbatim: "Just saw that the docs on the legal page of ecodia.au are going to /api/docs/* but those arent being served. SOmehting to clean up for our site."

## What shipped (Option A — Vercel rewrite)

**Commit:** `716f2c9` on `EcodiaTate/EcodiaSite@main`
**Push:** `ead8e76..716f2c9 main -> main`
**Files changed:** 1 (`vercel.json` created, 8 lines)

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

## Why Option A

- Backend at `api.admin.ecodia.au` already serves `/api/docs/files/*.pdf` via `documents.js` `express.static('public/docs')`
- Legal-structure page (`src/app/(marketing)/legal-structure/page.tsx`) had 5 hrefs as relative `/api/docs/files/*.pdf`
- Founding page (`src/app/(marketing)/founding/page.tsx`) was already absolute `https://api.admin.ecodia.au/api/docs/files/*.html` — working
- Vercel rewrite preserves clean URLs (no ugly cross-origin in browser bar), keeps single source of truth (no asset duplication), no drift risk on doc updates
- No existing `vercel.json` so creation was clean (no merge with existing config)

## Production verification (5 May 2026 12:57 AEST UTC / 22:57 AEST)

Vercel deploy ready ~40 seconds after push. All 5 legal-structure links curl-tested:

| Link | Status | Content-Type | Size |
|---|---|---|---|
| `https://ecodia.au/api/docs/files/ecodia-dao-operating-agreement.pdf` | **200** | application/pdf | 70004 |
| `https://ecodia.au/api/docs/files/ecodia-dao-living-constitution.pdf` | **200** | application/pdf | 65796 |
| `https://ecodia.au/api/docs/files/ecodia-dao-initial-resolutions.pdf` | **200** | application/pdf | 52971 |
| `https://ecodia.au/api/docs/files/ecodia-ip-license-agreement-2026-04-08.pdf` | **200** | application/pdf | 56146 |
| `https://ecodia.au/api/docs/files/llc-amendment.pdf` | **404** | text/html | 172 |

**4 of 5 legal-page links now resolve in production.** The 5th (LLC Amendment) is a separate backend issue — see below.

## Related finding (separate P3 status_board row)

`llc-amendment.pdf` 404s on the **backend itself** at `api.admin.ecodia.au/api/docs/files/llc-amendment.pdf`, not just the marketing site. Source-of-truth file exists at `/home/tate/ecodiaos/dao/llc-amendment.pdf` but the documents.js route serves only from `~/ecodiaos/public/docs/`. The `dao/` subdirectory is not exposed.

**Out of scope for this fork** — brief explicitly: "Do not touch ecodiaos-backend (Wave A + B are working there)."

P3 status_board row created: `'llc-amendment.pdf 404 on api.admin.ecodia.au backend - file not in public/docs/'`. Fix is single file copy or single express.static line edit, can be done after Wave A/B forks complete.

## status_board updates

- Archived: row `f13db2d1-af3f-446f-adf9-ab43e3ce6720` ("ecodia.au /legal page docs 404 - /api/docs/* not served by ecodia-site"), status `fixed_via_vercel_rewrite_commit_716f2c9`
- Created: P3 row 'llc-amendment.pdf 404 on api.admin.ecodia.au backend - file not in public/docs/'

## Sibling-fork hygiene (per stash-and-clean doctrine)

On entry, working tree had uncommitted changes to `src/app/(marketing)/page.tsx` from a sibling thread (offers feature drop). Stashed before fix to keep my commit isolated:
`fork_mosmrrvi_edbb96 stash sibling offers work pre-legal-fix`

After commit + push, stash popped clean. Sibling offers work restored to working tree (uncommitted) for whoever owns it.

## Doctrine surfaced + applied

- visual-test-before-push-when-tate-not-around — Mode A (curl verification on local + production)
- sdk-forks-must-commit-deliverables-not-leave-untracked — vercel.json committed before push
- stash-and-clean-when-finding-sibling-fork-unsafe-state — sibling offers work stashed/restored cleanly
- deploy-verify-or-the-fork-didnt-finish — polled until Vercel READY, curl-verified each URL
- client-code-scope-discipline — fixed THIS bug only, captured backend fix as P3
- fork-by-default-stay-thin-on-main — I AM the fork, all (b)/(c) on-main work

## What main needs to know

Done end-to-end. ecodia.au /legal-structure page now has 4 working PDF links and 1 still-broken LLC Amendment link pending a backend file copy (P3 row tracking it). Tate asleep, no comms sent. Deploy verified live in production.
