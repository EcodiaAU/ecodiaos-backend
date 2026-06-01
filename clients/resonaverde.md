---
triggers: resonaverde, angelica, angelica-choppin, resonaverde.au, hello@resonaverde.au, Resonaverde-au, dxtglcfyqvhmmnopshhp, resonaverde-standing, resonaverde-referral
---

# Resonaverde - canonical infra manifest

> The single source of truth for Resonaverde's repo, hosting, and substrate.
> Read this BEFORE touching any Resonaverde surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Resonaverde - Angelica Choppin's consulting practice site
(Next.js + admin CMS). Standing-arrangement client. Commercial role: Angelica is
Ecodia's salesperson into NFP/SMB orbit. Mates-rate pricing.

**Immutable identifiers:**
- Repo owner: `Resonaverde-au` (Angelica's GitHub org, NOT EcodiaTate)
- Domain: `resonaverde.au`
- Contact: hello@resonaverde.au

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `Resonaverde-au/resonaverde` (Next.js App Router + React + TS) | Vercel project **`resonaverde`** (framework `nextjs`, prod branch `main`, auto-deploy) | **`resonaverde.au`** + `resonaverde-taupe.vercel.app` | LIVE |
| Admin CMS | same repo, `/admin/write` route (authenticated) | same Vercel project | `resonaverde.au/admin/write` | LIVE - primary self-service surface for blog + newsletter |
| Resources | same repo, `/resources` route | same Vercel project | `resonaverde.au/resources` | LIVE (added 11 May 2026, gated lead-magnet downloads) |
| Blog | same repo, `/blog` + `/blog/[slug]` | same Vercel project | `resonaverde.au/blog` | LIVE |

**Local Corazon path:** `D:/.code/resonaverde/` (main clone, branch `main`).

**Repo transfer note:** the `Resonaverde-au` GitHub org is Angelica's. PR creation
against feature branches is blocked until Angelica completes GitHub repo transfer
to `EcodiaTate` org (status_board row 69312460). Until then, merge feature branches
via direct push or via Angelica's GitHub UI.

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`dxtglcfyqvhmmnopshhp`** (name `Resonaverde`, region `ap-southeast-2`). |
| Web env (Vercel) | `NEXT_PUBLIC_SUPABASE_URL=https://dxtglcfyqvhmmnopshhp.supabase.co`, anon key. Resend for email; Supabase storage for blog images + lead-magnet files. |
| DNS | Cloudflare DNS pointed at Vercel for `resonaverde.au`. |
| Email | Resend (newsletter blast + transactional). |
| Pricing | Mates-rate / standing arrangement (not full rate card). |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Standing arrangement is the ONLY active no-Tate-brief carve-out.** Per `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md`. Reply + deploy autonomously for in-scope work (bug fixes, copy, small features, advisory). Brief Tate first for: money commitments >$50/mo recurring, contract changes, IP assignment changes, anything requiring Tate's signatory, work >40h without scoping confirmation.
- **Only channel is email reply to Angelica's thread.** No proactive outbound on iMessage, SMS, phone, LinkedIn, Slack without Tate go-ahead. All iMessage references were purged 11 May 2026.
- **Admin CMS is load-bearing.** Smoke-test admin panel login + one-write round-trip after any backend change. The admin is Resonaverde's primary self-service surface.
- **Alias verification reflex.** After every deploy, probe `vercel_list_deployments` on `Resonaverde-au/resonaverde` and compare SHA before filing "alias stale" rows. 9 May 2026 had a false "alias stale" status_board row that a fork probe disproved.
- **Mates-rate does not mean scope-free.** Work exceeding ~40h without scoping confirmation requires brief-first. Name the scope explicitly in the reply confirming each task.
- **Repo transfer pending.** Until Angelica transfers the GitHub repo to `EcodiaTate`, PR creation is blocked. Merge via direct push.
- **Angelica's WM board seat creates CoI.** Covered by the in-flight v3 referral agreement exclusion clause (own-boards CoI). Cross-ref `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md`.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`resonaverde` project). Production alias auto-promotes (verified 9 May 2026 fork probe).
- **No iOS/Android.** Web-only product.

## Standing arrangement scope

Effective 11 May 2026 16:30 AEST (Tate verbatim).

**In-scope (no Tate brief needed):**
- Web builds, bug fixes, UX improvements
- Copy edits, content updates
- Small feature additions on existing site/admin
- Technical advisory within Ecodia's competence

**Requires Tate brief-first:**
- Money commitments over $50/month recurring
- Contract changes to the referral agreement
- IP assignment changes
- Anything requiring Tate's signatory identity
- Work exceeding ~40 hours without scoping confirmation

## Referral agreement

- **v2** sent 20 Apr 2026. No signed copy received.
- **v3 in-flight:** two-way structure update + date correction + exclusion clause (own-boards CoI per `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md`).
- **Framework:** commission on referred clients introduced by Angelica. Does NOT apply to Resonaverde itself (that relationship is direct).
- **CoI context:** Angelica joining Wild Mountains board June 2026 alongside Kurt Jones (incoming chair). Exclusion clause protects her director credibility on any WM procurement involving Ecodia.

## Delivery history

### 12 May 2026 - Glassmorphism + animations rebuild (Workers 2 + 3)
Two feature branches, both Vercel preview READY:
- `feat/resonaverde-rebuild-public-2026-05-12` -> commit `da50f19` (8 files, +373/-109; layered glassmorphism + ambient gradient + grain texture overlay on HomePage; PageBackground component + motionVariants library; framer-motion added). Preview: `https://resonaverde-cyqeybv23-ecodia.vercel.app`.
- `feat/resonaverde-rebuild-admin-2026-05-12` -> commit `3e7c747` (4 files, +207/-50; admin emerald gradient sidebar, mobile tab bar, login + resources + unsubscribe glass cards). Preview: `https://resonaverde-kna3a292d-ecodia.vercel.app`.
- Recon: `~/ecodiaos/drafts/resonaverde-rebuild-design-direction-2026-05-12.md`.
- Merge order doesn't matter; branches touch non-overlapping files. PRs blocked until GitHub transfer.

### 12 May 2026 - Wave 2 FE polish (deployed, dpl_J1UgD9SHLSopMt1Jfi9kPvT32cd4)
Three categories shipped: mobile-responsiveness wave 2 (42ae75a), laptop card width (a3bccb3), admin suite modernisation (560f3f9).

### 11 May 2026 - 4 features shipped same-session (standing arrangement first use)
Auto-send bug fix, file-delete bug fix, draft + scheduled blog publishing, lead-magnet `/resources` page.

### 9 May 2026 - Site polish (commit a81b716)
Padding + clamp() responsive scaling + heading overflowWrap. Deploy dpl_ChuokkT9AhY3vAaf7TQNSCih96GJ.

## Relationship context

- **Kurt Jones** - Co-Exist founder, Wild Mountains incoming chair (June 2026). Patron orbit overlap.
- **Wild Mountains** - Angelica joining board June 2026. WM is a future software prospect; referral CoI handled by exclusion clause.
- **Ecodia positioning:** infrastructure provider across this orbit, NOT board members. Cross-ref `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`.

## Cross-refs
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md`
- `~/ecodiaos/patterns/angelica-as-salesperson-not-board-prospect.md`
- `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md`
- `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`
- `~/ecodiaos/patterns/delivery-velocity-same-turn-not-24-48hr.md`
- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` (parent rule; standing arrangement is the only active carve-out)
