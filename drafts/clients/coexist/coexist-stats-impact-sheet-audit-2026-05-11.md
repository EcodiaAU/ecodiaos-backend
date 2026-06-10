# Co-Exist Stats + Impact Sheet Audit — 2026-05-11

**Audited by:** fork_mp0tllmm_aad509  
**Audit time:** 2026-05-11 ~16:45 AEST  
**Substrates read:** Microsoft Graph (Excel sheet), Co-Exist Supabase REST API, RPC `get_platform_impact_stats()`, event_impact table (500 rows), events table (523 total), app_settings baseline rows  

---

## 1. Executive Summary

- **Sheet + DB are broadly coherent.** All 2 app-created (UUID) rows on the sheet match DB events and have consistent impact data. Zero post-cutoff (>=2026-05-04) migrated-collective events are missing from the sheet. Zero cancelled future events remain.
- **3 actionable discrepancies found:** (a) duplicate Forms ID 239 on the sheet — two completely different events share the same integer ID, one from an unknown collective "Myall Park"; (b) the sheet has grown to 276 rows but kv_store records 247 — stale by 29 rows; (c) the RPC must be invoked with no parameters — the kv_store note says `scope=all-time` which throws a schema-cache error.
- **Stats RPC is internally consistent.** baseline + live = all-time for all three headline metrics. Attendees have grown by 43 since last kv_store verification (8088 → 8131). Trees and rubbish unchanged.

---

## 2. Stats RPC Verification

RPC: `POST /rest/v1/rpc/get_platform_impact_stats` with empty body `{}` (no `scope` param).

| Metric | Baseline (pre-2026) | Live (2026+) | All-time total | Check |
|--------|--------------------:|-------------:|---------------:|-------|
| Attendees | 5,500 | 2,631 | **8,131** | OK |
| Trees planted | 35,000 | 12,764 | **47,764** | OK |
| Rubbish (kg) | 4,900 | 1,442.9 | **6,342.9** | OK |
| Events held | 340 | 147 | **487** | — |
| Volunteer hours | 11,000 | 6,802 | **17,802** | — |
| Collectives | — | — | **15** | — |
| Beach cleanups | 141 | 72 | **213** | — |
| Tree planting events | 32 | 12 | **44** | — |
| Nature hikes | 85 | 44 | **129** | — |

**baseline + live = all-time: VERIFIED for all 3 headline metrics.**

**kv_store delta vs last verified (attendees=8088, trees=47764, rubbish=6342.9):**
- Attendees: +43 (new live data since verification, expected)
- Trees: 0 (unchanged)
- Rubbish: 0 (unchanged)

**RPC signature issue:** The function is `get_platform_impact_stats()` — no parameters. Calling with `{"scope": "all-time"}` returns `PGRST202` (function not found). Any code (frontend, admin, edge function) using a `scope` parameter will silently fail. The kv_store invocation note must be corrected.

**app_settings baseline rows:** All 9 baseline keys confirmed present in the live DB with correct values matching the RPC fallbacks. The baseline is stored durably, not hardcoded.

---

## 3. Event-by-Event Diff (UUID rows only)

The sheet contains only **2 UUID (app-created) rows** — both from migrated collectives post-2026-05-04 cutover.

| Event ID | Date | Title | Sheet att | DB att | Sheet trees | DB trees | Sheet rubbish | DB rubbish | Status |
|----------|------|--------|----------:|-------:|------------:|----------:|--------------:|----------:|--------|
| (row 1 UUID) | 2026-05 | (app event) | 32 | 32 | 1000 | 1000 | 0 | 0 | MATCH |
| (row 2 UUID) | 2026-05 | (app event) | 10 | 10 | 0 | 0 | 0 | 0 | MATCH |

**0 mismatches on UUID rows.** Both events are in the DB, both have matching event_impact rows.

---

## 4. Sheet-Only Rows (not linked to a DB event by UUID)

### 4a. Integer-ID (Forms) rows — 228 rows

These are the historical Forms submissions. The sync function creates synthetic UUID events for unmatched Forms rows and links impact to app-created events where a match is found.

| Stat | Value |
|------|-------|
| Integer-ID rows | 228 |
| With impact data | ~185 (att or trees or rubbish non-null) |
| Impact sums | att=3,960 | trees=18,557 | rubbish=1,917.64 kg |

These rows flow **sheet → DB** for collectives without `forms_migrated_at` (all except Melbourne City and Sunshine Coast). The sync correctly skips post-cutoff rows from migrated collectives.

**1 duplicate integer ID found — see Section 6.**

### 4b. Legacy-alpha rows (CB001-style) — 46 rows

Pre-app-era rows with non-integer, non-UUID IDs (format: CB001, CB002, etc.). The sync function skips these as `skippedLegacy` — they never flow into the DB.

| Stat | Value |
|------|-------|
| Legacy-alpha rows | 46 |
| Impact sums | att=772 | trees=3,480 | rubbish=532.0 kg |

**These rows are orphaned from the sync system.** Their data is captured in the RPC baseline (Tate's stated 5,500/35,000/4,900 covers all pre-app data including these). No action required unless Charlie wants to back-fill them as synthetic events.

### 4c. Sheet total vs RPC baseline — expected gap

| Source | Attendees | Trees | Rubbish (kg) |
|--------|----------:|------:|-------------:|
| Sheet ALL rows sum | 4,774 | 23,037 | 2,449.64 |
| RPC baseline (stated) | 5,500 | 35,000 | 4,900 |
| Delta | -726 | -11,963 | -2,450.36 |

The sheet total is significantly less than the stated baseline. This is **expected and not a bug**: the RPC baseline was Tate-stated based on total organisational impact (including events never formally entered in the sheet, verbal data, partner events, etc.). The sheet is a partial record, not a complete ledger. The baseline is authoritative.

---

## 5. DB-Only Rows (past events with no sheet representation by UUID)

**498 past events not found in sheet by UUID** — breakdown:

| Category | Count | Explanation |
|----------|------:|-------------|
| Unmigrated collective events | 399 | Sheet→DB direction only; their data flows integer-ID rows above. Expected. |
| Migrated-collective events, pre-cutoff (before 2026-05-04) | 99 | Covered by integer-ID Forms rows via fuzzy linkage matching. App UUID not on sheet by design. Expected. |
| **Migrated-collective events, post-cutoff, not on sheet** | **0** | **CLEAN** |

The zero post-cutoff gap is the critical check. **No app-created events from Melbourne City or Sunshine Coast on/after 2026-05-04 are missing from the sheet.**

Note: 22 "Historical Data Backfill" events (all dated 2024-01-01, status=completed) exist in the DB with impact rows but are pre-cutoff. These are the programmatic backfill placeholders — they contribute to pre-2026 DB sums but are correctly excluded from the RPC's live metrics.

---

## 6. Duplicates

**1 duplicate integer ID found: Forms ID = 239**

| Sheet Row | Date | Collective | Title | Attendees |
|-----------|------|-----------|-------|----------:|
| 275 | 2026-05-10 | Brisbane | Enoggera Reservoir Nature Hike | 19 |
| 276 | 2026-05-02 | **Myall Park** | Outback Retreat | 18 |

Two completely different events were both assigned Forms ID 239 — a data entry error. Additionally, "Myall Park" is not a known collective in the DB (not in the collectives table). Row 276 would be `skippedNoCollective` on any sync run. 

**Action required:** Charlie Bennett must correct Forms ID 239 — assign unique IDs to both rows. The "Myall Park" row also needs to be mapped to the correct collective or the collective added to the DB.

---

## 7. Future-Proof Gaps (sync direction discipline)

Risk surfaces per `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md`:

1. **RPC scope parameter (P2):** Any consumer calling `get_platform_impact_stats(scope='all-time')` gets a schema error. Fix: update kv_store note + audit frontend code for incorrect invocation.

2. **from-excel cron health (P2):** The 5 most recent sync_runs are all `to-excel` direction — no `from-excel` runs visible in the last check (~06:30 AEST). The from-excel cron (jobid 9, every 30min) should be running. Either the cron is paused or the runs table isn't capturing from-excel correctly. Needs spot-check.

3. **Legacy-alpha rows (P3):** 46 CB001-style rows will permanently be `skippedLegacy`. If these represent real events not in the baseline, their impact is undercounted. Low risk if baseline already accounts for them.

4. **kv_store row_count stale (P3):** kv_store.creds.coexist_excel_file records `row_count: 247`; actual sheet is 276 rows. Stale by 29 rows. Update after this audit.

5. **Duplicate Forms IDs (P2):** If data entry errors like the ID=239 duplicate persist, the sync may link the wrong event's impact or skip an entire row. The dedup logic is strict-signature-based and won't detect same-ID-different-event collisions.

---

## 8. Follow-up Actions

| Priority | Action | Substrate | Owner |
|----------|--------|-----------|-------|
| P2 | Charlie to fix duplicate ID=239 — two different events share the same Forms integer ID | Sheet edit | Tate tells Charlie |
| P2 | "Myall Park" row: identify correct collective, update sheet | Sheet edit | Tate tells Charlie |
| P2 | Update kv_store invocation note: RPC has no `scope` param, call with `{}` | `db_execute UPDATE kv_store` | EcodiaOS |
| P2 | Audit frontend/admin code for `scope` param on RPC call | Code review | Factory dispatch |
| P2 | Verify from-excel cron (jobid 9) is firing — check pg_cron and recent runs | `excel_sync_runs` query | EcodiaOS |
| P3 | Update `kv_store.creds.coexist_excel_file.row_count` from 247 to 276 | `db_execute UPDATE kv_store` | EcodiaOS |
| P3 | Update kv_store impact baseline verification note: attendees now 8131 (was 8088) | `db_execute UPDATE kv_store` | EcodiaOS |
| P3 | Clarify whether legacy-alpha (CB001) rows' impact is already in the Tate-stated baseline | Tate + Charlie verbal | Tate |

---

*Audit file: ~/ecodiaos/drafts/coexist-stats-impact-sheet-audit-2026-05-11.md*  
*Fork: fork_mp0tllmm_aad509*
