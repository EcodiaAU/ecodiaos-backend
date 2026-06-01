# Ecodia Site - canonical infra manifest

> The single source of truth for ecodia.au's repo, hosting, and substrate.
> Read this BEFORE touching the site. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** ecodia.au - the public Ecodia marketing site (also serves
`app.ecodia.au` and 301s `code.ecodia.au` to root). Next.js, SSG + dynamic routes.
Includes a `code@ecodia.au` contact pathway in the footer.

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `EcodiaTate/EcodiaSite` (Next.js) | Vercel project **`ecodia-site`** (framework `nextjs`, prod branch `main`, auto-deploy) | **`ecodia.au`** (canonical) + `app.ecodia.au` (alias, same content) + `code.ecodia.au` (301 -> `ecodia.au`) | LIVE |

**Local Corazon path:** `D:/.code/ecodia-site/frontend/` (the actual repo).
Parent `D:/.code/ecodia-site/` is a wrapper folder with `frontend/`, `supabase/`,
`docs/`, `drafts/`, `_archive/`. The git repo lives at `frontend/`.

## Substrate

| What | Value |
|---|---|
| **Supabase** | No production Supabase wired into the live site at present (verify before adding). `D:/.code/ecodia-site/supabase/` exists locally - reserved for future. |
| Vercel project | `ecodia-site` (id `prj_OdL8p1Yh2XmaUXWkEdKM1Bmdi1fa`). |
| Domains | `ecodia.au` (root) + `app.ecodia.au` + `code.ecodia.au` (301). All three verified `prod`. |
| Test login | n/a - public site. |

## Gotchas / dead ends (paid for in time - do not relearn)

- **The doctrine line "Three lines of EB Garamond italic on white. No CMS. Static." is STALE.** Verified 2026-06-01: the live `ecodia.au` is a full Next.js site with rich `<head>` metadata (title "Ecodia · The world we build next", description naming chambers/glovebox/conservation collectives, OG images, alternate hreflang, robots index aggressively, theme-color, sitemap canonical). Framework on the Vercel project is `nextjs`, not static. Any doc still calling this an EB-Garamond-three-liner is pre-rebrand and must be updated.
- **`app.ecodia.au` is an alias to the marketing site, NOT an app shell.** Serves the same content as root. If you need an actual app surface on `app.ecodia.au`, you have to either repurpose the alias (it currently points at ecodia-site) or move it onto a different Vercel project. The previous separation (marketing vs app) was collapsed by the rebrand.
- **`code.ecodia.au` is a 301 to `ecodia.au`** (Vercel server response `Location: https://ecodia.au/`). It is NOT a developer console. If you want a code-facing landing surface there, you have to add a new path or re-do the redirect.
- **Repo path on Corazon is nested.** Open `D:/.code/ecodia-site/frontend/` as the VS Code workspace, not the parent. Git ops at the parent will fail (no `.git` there).
- **`admin.ecodia.au` is NOT this site.** That domain is served by `ecodiaos-frontend` Vercel project (see ecodiaos-backend.md for the conductor surface notes). Don't confuse the two when changing DNS.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`ecodia-site` project). Commit author must be GitHub-recognised (same Vercel constraint as goodreach/coexist).
- **No mobile.** Web-only.
