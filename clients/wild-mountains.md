# Wild Mountains

**Status:** prospect (active scoping - WM intensive 11-14 May 2026)
**Entity:** conservation charity (company limited by guarantee)
**Website:** wildmountains.org.au (Squarespace, Lizz Hills admin)
**Location:** ~2h from Sunshine Coast

---

## Key Contacts

- **Kurt Jones** - incoming chair June 2026 (current Co-Exist co-founder + Ecodia primary patron)
- **Angelica Choppin** - incoming board member June 2026 (Ecodia Resonaverde client + standing arrangement)
- Current chair (name TBD from intensive) - stepping down June 2026

---

## Mobile App

- **Canonical iOS bundle identifier:** `org.wildmountains.app`
- Confirmed by Tate at 12:46 AEST 12 May 2026
- ASC (App Store Connect) app record matched to `org.wildmountains.app` as of 12 May 2026
- Prior collision resolved by creating a new ASC app record under this bundle ID
- All future Xcode signing, Capacitor config, and ASC references use `org.wildmountains.app`
- Neo4j Decision: "Wild Mountains canonical bundle id is org.wildmountains.app - 12 May 2026" (id 2092)
- Repo: EcodiaTate/wildmountains-frontend

**Previous bundle IDs (superseded):**
- `au.wildmountains.ecodia` - used in commit 0ec63b5, TestFlight upload 12 May 2026 (stale)
- `au.wildmountains.app` - earlier Capacitor scaffold reference

---

## Platform Architecture

- Two-brand requirement confirmed 12:26 AEST 12 May 2026 (Tate verbatim: "we need two brands on the site or even two sites for each brand")
- Three architectural paths in play - decision deferred to Tate + Kurt at WM intensive
- Current scaffold (commit 83198e1) is throwaway post-intensive (wrong content shape, generic stub)
- CE-fork-based architecture proposed as base

See Neo4j Decision: "WM v3 single-codebase architecture superseded by two-brand requirement 2026-05-12"

---

## Commercial

- **Model:** IP-retention licence (Ecodia Labs retains, WM gets perpetual non-transferable scoped licence)
- **Scope:** multi-vertical platform - internship, volunteer, venue hire, events, membership, citizen science
- **Estimate:** ~$35-55k build over 6 months + $600-1200/mo recurring licence post-delivery
- **Status:** scoping at WM intensive 11-14 May 2026

---

## Board Seat Decision

Tate **declined** Wild Mountains board seat 11 May 2026.
- Ecodia positioning: infrastructure provider, not board member
- Conflict-of-interest surfaces avoided (Co-Exist + WM under same patron Kurt)
- Cross-ref: `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`
- Neo4j Decision: "Wild Mountains board seat declined - infrastructure-not-seats positioning thesis - 11 May 2026" (id 131)

---

## Domain

- `wildmountains.org.au` - live Squarespace site under Lizz Hills admin (P2 row 8c3199ea)
- `wildmountains.com.au` - registration pending Tate authorisation (Ecodia-controlled canonical)

---

## Status Board Rows

| Row ID | Name |
|--------|------|
| 1cda056c | Wild Mountains software platform - 6-month build |
| 1df9d2ac | Wild Mountains digital substrate bootstrap |
| f53dfcc8 | Wild Mountains - Domain Selection |
| d58fe33e | Wild Mountains - APNs Auth Key |

---

## History

- 11 May 2026: Board seat declined; strategic direction authored; platform scoping initiated
- 12 May 2026: WM intensive begins; two-brand architecture flagged; bundle ID `org.wildmountains.app` confirmed canonical
- TestFlight upload under old bundle ID `au.wildmountains.ecodia` (delivery UUID f5aef402) - stale, needs swap surgery
