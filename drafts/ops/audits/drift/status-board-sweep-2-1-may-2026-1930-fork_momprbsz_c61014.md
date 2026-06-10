# Status board sweep round 2 — 1 May 2026 19:30 AEST
**Fork:** fork_momprbsz_c61014
**Wall budget:** 30 min (used ~12 min)

## Headline
- **Active count BEFORE:** 127
- **Active count AFTER:** 88
- **Archived:** 39
- **Demoted:** 1
- **Skipped-but-considered:** ~25
- **Recommended for human review:** 3

## Top 3 archive reasons by frequency
1. **phantom-status** (next_action_by=ecodiaos but status awaits Tate decision/authorisation/UX/identifications/sign-off) — 7 rows
2. **pure-awareness research-identified opportunities** (no concrete next_action, belongs in Neo4j Outreach_Target nodes not status_board) — 6 rows
3. **wave-pending / spec-staged / approved-not-dispatched** (queued behind master plan integration or Tate-live) — 8 rows

---

## Archives (39)

### P5 (3)
| ID | Name | Reason |
|---|---|---|
| `b9bd8ea5` | Roam UI - P3-5 sign-in footer leaks app routes | Phantom: status "awaiting Tate UX decision" but next_action_by=ecodiaos |
| `f07034e2` | Roam UI - P3-2 hamburger / P3-3 mobile a11y batch | Deferred-batch-later, no concrete trigger |
| `8b1fe2b6` | Mobile sign-in - .env.example doc gap | P5 audit-finding 28-Apr, no follow-through 72h+ |

### P4 (9)
| ID | Name | Reason |
|---|---|---|
| `a875da97` | Heads of Noosa Brewing | Research-identified pure-awareness; move to Neo4j |
| `2a1378e9` | Aussie World (SC theme park) | Research-identified pure-awareness |
| `af203fb4` | os-forks-reaper cron | Live-and-reaping ongoing infra; status describes operational state not task |
| `42dcd640` | Roam UI - P3-1 /login mismatch | Phantom: awaits Tate UX, ecodiaos owner |
| `adaaea74` | Fork-output integrator capability spec | spec-complete, no dispatch path |
| `9cb1bf29` | Roam + Sidequests attribution placement | Superseded by 455b8498 (brand hygiene rollout) |
| `26e4cd51` | resonaverde push to Resonaverde-au org | flagged-org-permission, no path forward 27h |
| `6ced4346` | kv_store hygiene audit (37 candidates) | Phantom: ready for Tate authorisation, ecodiaos owner |
| `48c50f76` | Mobile sign-in - SSO test coverage gap | P4 audit-finding 28-Apr no follow-through 72h+ |

### P3 (26)
| ID | Name | Reason |
|---|---|---|
| `c09095a5` | Visit Sunshine Coast | Research-identified pure-awareness |
| `68202a3e` | Eumundi Markets | Research-identified pure-awareness |
| `bab60e24` | Maleny Botanic Gardens / Bird World | Research-identified pure-awareness |
| `0cf479ee` | Wildlife Warriors Worldwide (Trellis flagship) | Research-identified pure-awareness |
| `78b73aee` | Conservation rebrand (Conservatree wedge) | Thesis-stage pre-outreach, sub-thesis of larger play |
| `e17b6613` | Macros Phase 1 brief expansion | PIVOT 29 Apr — superseded by Cowork-first doctrine |
| `32b38dcd` | CLAUDE.md mechanical hooks split-out | audit_flagged_p3, 35h no dispatch |
| `93aeb971` | CLAUDE.md P3 polish + dedup pass | queued, 34h no dispatch |
| `f0c8e2c3` | Misclassified kv_store row creds.conventions | Minor drift 33h no path |
| `53b76a0a` | ROAM spatial_ref_sys RLS | PostGIS extension system table — known-acceptable |
| `0ee6860b` | Tate-away twice-weekly digest spec v1 | drafted 27h, no follow-through |
| `d8524291` | Chambers platform marketing site | Live at chambers-platform-site.vercel.app — shipped |
| `452b2122` | ROAM edges RLS disabled | Phantom: needs-tate-review, ecodiaos owner |
| `dd603107` | Woodfordia spatial_ref_sys RLS | PostGIS system table — known-acceptable |
| `1dc7cd20` | Co-Exist spatial_ref_sys RLS | PostGIS system table — known-acceptable |
| `edce1a56` | NextBuild fork-mode dispatch | queued-awaiting-tate-live = wave-pending |
| `ee4ae267` | Voice Engine (Twilio + OpenAI Realtime) | approved-not-yet-dispatched 27h |
| `a96a41c2` | Memory infra: bi-temporal + file-graph sync | audit-complete-prototype-scoped, awaiting-tate-live |
| `abd0386a` | decision-quality-drift-check minimum-age | patch_staged, dispatch-pending |
| `b97f443d` | Corazon-as-peer build-out | PIVOT 29 Apr — superseded by Cowork-first |
| `d5f90afc` | Public-site wedge-keywords check (brief-consistency) | spec-ready-awaiting-factory-dispatch |
| `d9fb459f` | Pattern node consolidation (100+ near-dupes) | sequenced-after-Aura-env-fix, blocked |
| `7b066ae7` | Marnie/NRM Regions cold-direct rewrite | Duplicate — subsumed by 6d23f488 + 651ae5a5 |
| `e3b24dfd` | Mobile sign-in GUI verification checklist | Blocked on 5ceee1cd (Mac SY094 agent offline) |
| `47c1cb4a` | VPS workspaces inactive cleanup ~4G | Phantom: Phase 3 deferred for Tate sign-off, ecodiaos owner |
| `6cbabaab` | Manual journal: 5 revenue rows on personal banks | Phantom: awaiting tate identifications, ecodiaos owner |

### Duplicate (1)
| ID | Name | Canonical | Reason |
|---|---|---|---|
| `c97817d8` | Chambers federation play - tenant 2+ commercial validation | `21f59cf6` (same name, more recent) | Hard duplicate; row's own context already noted "[duplicate row archived 2026-04-28]" but never actually archived |

---

## Demotions (1)
| ID | Name | Old | New | Reason |
|---|---|---|---|---|
| `49a83e83` | Visual-verify gate hardening — 3 follow-ups | P3 | P4 | 3 follow-ups identified 44h ago, no started work; down-rank until critical-path |

---

## Skipped-but-considered (top reasons)

**Tate rows (left alone per brief — Tate-typed will see on return):**
`1fb9e06d` tates-cakes attribution, `a7416130` Xero Bank Feeds Bank Australia parked, `79ab00d7` DAO EIN, `5ceee1cd` Mac SY094 laptop-agent offline, `12adbd6c` Silicon Coast LEAP FWD, `f4ba92a0` GitHub secret-scan false positive, `50aa195b` Firebase Apple SDK Oct 2026, `9219bbb1` Airwallex PayTo, `6c038c87` Quorum 005, `f5762594` Revenue tracking gap AUD 0, plus most P2/P1 outreach + decision rows.

**Real-active substantive engineering (kept):**
`65d2fd74` Co-Exist Auth Spam DKIM/SPF/DMARC, `5129c018` emailArrival listener investigation, `2816d9c7` Chrome CDP doctrine append (only 21h), `b6c89c08` Hook coverage gap (active drift work), `0a0f42b1` Silent-surface backlog, `15ad6038` Trigger narrowing corazon-cluster, `c02db808` Test coverage gap on hot-path, `47ab5d0d` kv_store drafts auto-archive policy, `916c43ee` invoicePaymentState producer dormant, `c9932b46` Phase F episode_resurface_event empty, `1297a7a8` kv_store cred-naming convention drift, `610b994c` Phantom kv_store creds.apple.asc_api, `78b17d52` Permission-seeking detection hook spec, `1232b19c` Ordit INV-2026-002 payment watch (real revenue), `4aee21a3` bk_gst_position UNDEFINED_VALUE bug, `3ee3529f` cred-mention-surface.sh false-positive, `7602001d` Fork worktree isolation contamination.

**Within 5h exclusion window (rows touched by Wave 1 / fresh state):**
`b50d462e`, `fe0fccad`, `26ff6d42`, `d51856c1`, `455b8498`, `8dd8c272`, `917b3330`, `e5d480d5`, `8e083d89`, `150bc01e`, `d0092340`, `9edb3a74`, `62f8c918`, `6cf10816`, `2906bbd0`, `021f2a83`, `21f59cf6`.

**Active Cowork SSH spec / 72h window meta:**
`841219da` Cowork SSH bridge spec drafted, `c73d89f5` Phase G Critique queue, `26771ec3` 72h autonomous window tracker (P1, never-touch).

---

## Recommended for human review (3)

1. **`c7eea2bd` Coexist CI gate — cleanup_fork_dispatched 29 Apr 21:24 AEST** — fork was dispatched 17h ago, status_board hasn't updated. Probe needed: did fork ship, did PR merge, is CI gate cleared? If yes → archive. If no → re-dispatch or escalate.

2. **`5611c57e` Quorum of One editions 003+004 staged drafts pile-up** — P2, tate row. Has subsumed-but-still-distinct rows (`fa3b9abf` Edition 004 review-passed, `6c038c87` Edition 005 drafted-pending). Consider merging into single canonical "Quorum publication queue" row or archiving the umbrella once 004 ships.

3. **Multiple "first-outreach prep drafted, awaiting Tate review" rows** (`6b9161e1` NSW LLS, `77891b32` Crystal Waters, `990306f4` HLW, `651ae5a5` NRM Regions AU Mat Hardy, `6d23f488` Marnie Lassen, `630a88fd` Conservation Volunteers Australia). All P2/P3 tate rows in identical "drafted, awaiting Tate go-ahead" state. Suggest consolidating into single "Outreach drafts queue — 6 named targets" canonical with sub-rows in context, OR demote stale ones (>14d) to a Tate-review queue meta-row.

---

## Constraints honoured
- ✅ Did NOT touch client codebases
- ✅ Did NOT pm2_restart
- ✅ Did NOT POST to /api/os-session/message
- ✅ Each UPDATE statement separate (no CASE-WHEN multi-row)
- ✅ Every archive has one-line defensible reason
- ✅ Did NOT touch P1 rows (`0cab32bd`, `26771ec3`, `35cfa082`)
- ✅ Did NOT touch rows touched within 5h of session start
- ✅ Did NOT touch the autonomous-window tracker `26771ec3`
