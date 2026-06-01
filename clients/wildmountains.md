# Wild Mountains - canonical infra manifest

> The single source of truth for Wild Mountains' repos, hosting, and substrate.
> Read this BEFORE touching any Wild Mountains surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Wild Mountains - conservation charity (company limited by guarantee).
Ecodia delivers a multi-vertical platform (internship, volunteer, venue hire, events,
membership, citizen science) under an IP-retention licence. Status: prospect, scoping
arc from WM intensive 11-14 May 2026. Kurt Jones chairs from June 2026; Angelica
Choppin joins the board.

**Immutable identifiers (never change these):**
- iOS bundle id / Android package: `org.wildmountains.app` (confirmed 12 May 2026 - Neo4j Decision 2092)
- Apple Team ID: `86PUY7393S`

**Superseded bundle ids (do NOT use):**
- `au.wildmountains.ecodia` - earlier TestFlight (12 May 2026, commit 0ec63b5), stale
- `au.wildmountains.app` - earliest Capacitor scaffold reference

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `EcodiaTate/wildmountains-frontend` (Next.js) | Vercel project **`wildmountains`** (framework `nextjs`, prod branch `main`, auto-deploy) | **`wildmountains.vercel.app`** | LIVE shell - scaffold from commit 83198e1 is throwaway post-intensive (wrong content shape, generic stub) |
| **Backend** | `EcodiaTate/wildmountains-backend` (private) | (TBD - Vercel API routes or separate service) | n/a | Repo exists; deploy target not pinned |
| Mobile | (scaffolded but bundle-id arc unresolved) | TestFlight | `org.wildmountains.app` | TestFlight upload under old bundle `au.wildmountains.ecodia` (delivery UUID f5aef402) is stale - swap surgery owed |
| Marketing site | (NOT our build) | Squarespace under Lizz Hills | `wildmountains.org.au` | LIVE, separate from our deploy |

**Local Corazon path:** `D:/.code/wildmountains/` - **MISSING on this machine as of 2026-06-01.**
`dev-process-registry` flags `optional_on_machine: true`. Clone when first feature work lands.

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`efrytpwdrxfaehtqfpkq`** (name `wildmountains-prod`, region `ap-southeast-2`). |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. ASC app record matched to `org.wildmountains.app` as of 12 May 2026 (prior collision resolved by creating a new ASC app record under this bundle id). |
| Test login | (per `clients/wildmountains.md` future entry once first feature ships). |
| Domain | `wildmountains.org.au` is the existing Squarespace marketing site under Lizz Hills admin (status_board row 8c3199ea). `wildmountains.com.au` is pending registration (Ecodia-controlled canonical). |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Bundle ID swap owed.** TestFlight upload under `au.wildmountains.ecodia` (UUID f5aef402) is the stale one. Canonical is `org.wildmountains.app`. Next ship MUST use the canonical bundle.
- **Current scaffold (commit 83198e1) is throwaway.** Generic stub from pre-intensive. Two-brand requirement confirmed 12:26 AEST 12 May 2026 (Tate verbatim: "we need two brands on the site or even two sites for each brand"). Architecture decision deferred to Tate + Kurt - WM v3 single-codebase architecture was superseded by two-brand requirement (Neo4j Decision).
- **Repo not cloned on every machine** (`optional_on_machine: true` in dev-process-registry). Clone before doing any non-trivial work.
- **Board seat declined 11 May 2026.** Ecodia positioning: infrastructure provider, not board member. Avoid CoI surfaces with Co-Exist + WM under same patron Kurt. Cross-ref `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`. Neo4j Decision 131.
- **Angelica's WM board seat = referral-agreement CoI.** Handled by exclusion clause in Resonaverde referral agreement v3 (own-boards CoI clause). Cross-ref `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md`.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`wildmountains` project). Commit author must be GitHub-recognised (same Vercel constraint as goodreach).
- **Backend:** target TBD. Likely Supabase Edge Functions + Next.js API routes inside the frontend repo; confirm at first deploy.
- **iOS/Android:** ship recipes not yet authored - inherit from coexist Capacitor shape when bundle-id swap surgery is complete.

## Commercial

- **Model:** IP-retention licence (Ecodia Labs retains, WM gets perpetual non-transferable scoped licence).
- **Scope:** multi-vertical platform (internship, volunteer, venue hire, events, membership, citizen science).
- **Estimate:** ~$35-55k build over 6 months + $600-1200/mo recurring licence post-delivery.

## Status board rows

| Row ID | Name |
|---|---|
| 1cda056c | Wild Mountains software platform - 6-month build |
| 1df9d2ac | Wild Mountains digital substrate bootstrap |
| f53dfcc8 | Wild Mountains - Domain Selection |
| d58fe33e | Wild Mountains - APNs Auth Key |

## History

- 11 May 2026: Board seat declined; strategic direction authored; platform scoping initiated.
- 12 May 2026: WM intensive begins; two-brand architecture flagged; bundle id `org.wildmountains.app` confirmed canonical (Neo4j Decision 2092).
- Stale TestFlight upload (delivery UUID f5aef402) under old bundle `au.wildmountains.ecodia` - swap surgery owed before next ship.
