# Co-Exist excel-sync audit + 2026-05-18 alignment work

**Authored:** 2026-05-18 by EcodiaOS conductor
**Brief origin:** Tate verbatim 2026-05-18 - "i need you to do an extremely
thorough audit of the logic and edge cases for this so that we dont delete
data, always syncing entries the right ways, etc"
**Scope:** `D:/.code/coexist/supabase/functions/excel-sync/index.ts` +
all 7 impact-form surveys + sheet conventions across 43 May-2026 Forms rows
**Status:** Edge Function v37 live; 4 app-origin rows backfilled; ready to push.

---

## 1. The two flows

### 1.1 `to-excel` (Supabase -> Excel)

Triggered by:
- `pg_cron` job 10 (`excel-to-sync-hourly`, every hour)
- DB trigger on `event_impact` INSERT / UPDATE (per-event invocation)
- Manual: `POST /functions/v1/excel-sync?direction=to-excel[&event_id=<uuid>]`

Pipeline (`syncToExcel`):

1. `readExcelState` -> pull `usedRange` from the sheet, build:
   - `idToRowIndex`: every existing row's `(id -> excel row index, 1-based)`
   - `formsSignatures`: set of `(collective|date_iso|title_lc)` for Forms-only rows
   - `formsWeakIndex`: `(collective_lc|date_iso) -> existingFormsTitle` for weak match warnings
2. Determine `eventIds`:
   - Single-event mode: gate on `collective.forms_migrated_at IS NOT NULL` AND `event.date_start >= forms_migrated_at`
   - Batch mode: same gate, plus `status IN ('published','completed')`, plus `date_start >= 2026-05-04` cutoff
3. Pre-fetch `syntheticEventIds`: any event with `created_by IS NULL` OR UUID-v5 (positional check on char 14) - skipped entirely
4. For each candidate event:
   - Skip if synthetic
   - `fetchEventData` -> EventData (joins events + collectives + profiles + event_impact + event_registrations + latest survey_response)
   - `buildExcelRow` -> 28-col array
   - If `idToRowIndex.has(event.id)` -> UPDATE that row (no impact-data gate; existing rows always receive updates)
   - Else APPEND, conditional on:
     - APPEND GATE 1 (`hasImpactData`): event_impact row exists
     - APPEND GATE 2 (`hasHappened`): `date_start <= now()`
     - DEDUP STRICT: `formsSignatures.has(sig)` -> skip with reason
     - DEDUP WEAK: surface warning if `(collective, date)` matches Forms but title differs
5. Batch-PATCH all appends to `A{startRow}:AB{endRow}`; loop UPDATEs row-by-row to `A{rowIdx}:AB{rowIdx}`

### 1.2 `from-excel` (Excel -> Supabase)

Triggered by:
- `pg_cron` job 9 (`excel-from-sync`, every 30 minutes)
- Manual: `POST /functions/v1/excel-sync?direction=from-excel`

Pipeline (`syncFromExcel`):

1. Pull `usedRange`
2. Load collective name -> id + `forms_migrated_at` maps
3. Resolve `systemUserId` (first admin/super_admin profile)
4. Per row (skipping header):
   - UUID id: upsert `event_impact` from cols 11/15/16; mark seen
   - Integer id (Forms): resolve collective (with alias map fallback), parse date, skip if post-cutover migrated collective, find matching app event (3-tier matcher: close-date/wide-date Jaccard + token-overlap), existence guard on `(collective, date+/-2d, exact title)`; fallback to deterministic synthetic UUID v5 INSERT
   - Other id: skip as legacy
5. **Tail reconciliation phase** (the data-loss surface):
   - HEALTH GUARD: bail entirely if no `to-excel` run in last 2h
   - Candidates: events in `status IN ('published','completed')`, `date_start >= 2026-05-04` and `< runStartedAt`
   - Pre-load `matureImpactEventIds`: events with `event_impact.logged_at < runStartedAt - 6h`
   - For each candidate not in seenEventIds: skip if not migrated, predate cutover, synthetic, or impact not yet mature; otherwise UPDATE status='cancelled' + stamp `cancelled_via_sheet_sync_at`

---

## 2. 2026-05-18 changes (this commit window)

### 2.1 Sheet mapping doctrine (`buildExcelRow`)

| Col | Field | Old behaviour | New behaviour | Rationale |
|---|---|---|---|---|
| 6 | Primary Organiser | hardcoded `"Co-Exist"` | `partner_name` when `is_external_collaboration=true`, else `"Co-Exist"` | Forms convention shows col 6 varies (Landcare Group / OzFish / JCU Zoology Club). Event-level toggle drives it. |
| 7 | Other Group Attended | `answers.q1 \|\| ""` | `partner_name` (internal+partner) OR `q1` OR `"No, just Co-Exist!"` | Forms convention: never blank; default text "No, just Co-Exist!" matches Form pre-fill. |
| 8 | Which Landcare | `answers.q2 \|\| ""` | `freeText(q2)` (blank when NA/No/none/nil) | Forms convention: 38/43 blank, never "No". Strips leader-typed "No". |
| 9 | Which OzFish | `answers.q3 \|\| ""` | `freeText(q3)` | Forms convention: 42/43 blank. |
| 15 | Rubbish (kg) | `answers.q4 \|\| rubbish_kg \|\| ""` | `numberOrBlank(q4, rubbish_kg)` - returns number or blank, NEVER non-numeric string | Prevents leaked "12kg"/"approx 30" strings into number col. |
| 16 | Trees | as above for q5/trees_planted | same fix | same |
| 17 | Collect | `yesNo(q6)` | `yesNo(q6)` (unchanged, optional) | Forms convention: 37/43 blank. |
| 18 | What & How Much | `q7 \|\| ""` | `freeText(q7)` | optional |
| 19 | Hike/track | `q8 \|\| ""` | `freeText(q8)` | optional |
| 20 | Any Issues | `q9 \|\| ""` | `freeText(q9) \|\| "No"` | Forms convention: 0/43 blank; either "No" or text. |
| 21 | First Aid | `yesNo(q10)` | `yesNo(q10, "No")` | Forms convention: 0/43 blank; defaults "No". |
| 22 | Highlights | `q11 \|\| ""` | `freeText(q11) \|\| "No"` | Forms convention: 1/43 blank. |
| 23 | OneDrive | `yesNo(q12)` | `yesNo(q12, "No")` | Forms convention: 0/43 blank. |
| 24 | Google Vids | `yesNo(q13)` | `yesNo(q13, "No")` | Forms convention: 0/43 blank. |
| 25 | Grant Project | `q14 \|\| ""` | `freeText(q14) \|\| "No"` | Forms convention: 0/43 blank; either "No" or project name. |
| 27 | Insta wrap-up | `yesNo(q15)` | `yesNo(q15, "No")` | Forms convention: 0/43 blank. |

`isNoAnswer` accepts "" / "na" / "n/a" / "-" / "none" / "no" / "nil" / "nope".

### 2.2 Collective migration gate

- 14 non-Test collectives flipped from `forms_migrated_at IS NULL` to `2026-05-01` (Tate verbatim: "all of victoria, Perth, Tamworth, etc should be flipped actually. I dont think anyone is going to still be on forms after may").
- `collectives.forms_migrated_at` now has a DEFAULT of `(CURRENT_DATE)::timestamptz` so new collectives auto-migrate.

### 2.3 Survey UX (DB metadata + UI)

- All 7 impact-form surveys: question metadata rewritten. q1-q8 = optional (truly blank when N/A); q9, q11, q14 = required free_text with `default_value="No"`; q10, q12, q13, q15 = required yes_no with no default (must consciously pick).
- `SurveyQuestionRenderer`: "Optional" pill on non-required questions; yes/no tap-same-to-deselect.
- `log-impact.tsx`: seeds `surveyAnswers` from `question.default_value` for fresh forms (does NOT clobber existing or pre-loaded answer).
- `SurveyQuestion` type gained `default_value?: unknown` property.

### 2.4 Backfill done

4 app-origin events on the sheet (rows 270, 272, 283, 286) re-synced with v37 mapping. All cols now match Forms convention.

---

## 3. Edge-case + data-loss audit

### 3.1 Migration gate flip - tail reconciliation cancellation risk

**Risk:** A migrated-collective DB event at `status=published/completed` with `event_impact.logged_at > 6h ago`, NOT on the sheet, is **CANCELLED** by reconciliation. Mass-flipping 14 collectives expands the candidate pool.

**Probe (2026-05-18 08:51 UTC):** 10 total events, 1 at risk (Norman Creek - already on sheet, not actually at risk). Cleared.

**Standing mitigations in code:**
- IMPACT-DATA GATE: only mature impact (>6h old) triggers cancellation
- HEALTH GUARD: bail if no to-excel run in last 2h (Graph API outage protection)
- SYNTHETIC-EVENT GATE: synthetic events (UUID v5 or `created_by IS NULL`) never cancelled
- FUTURE-EVENT GATE: `date_start < runStartedAt` only
- MIGRATED-COLLECTIVE GATE: non-migrated collectives' events are Forms-canonical, never cancelled

**Watch:** any future impact submission from a newly-migrated collective could be at risk if a to-excel cron fails for >7h (impact matures past 6h grace AND HEALTH GUARD lifts). Multi-hour Graph API outage is the only realistic path. Doctrine: `~/ecodiaos/patterns/excel-sync-collectives-migration.md`.

### 3.2 Forms leaders post-flip (legacy Forms still receiving submissions)

**Risk:** A leader continues to use the Microsoft Form (Forms add-on still writes to sheet). The Form row hits the migrated-collective post-cutover skip in `syncFromExcel`. Data lands on the sheet but never reaches the app DB.

**Decision:** Tate explicit ("no one will still be on forms after may"). Acceptable. Logged as INFO in `excel_sync_runs.summary.errors`.

**Watch:** If `INFO ... collective is post-cutover migrated; skipped from-excel` appears repeatedly for the same collective, that collective needs a chat with its leader to switch to the app.

### 3.3 Manual sheet edits to app rows (non-numeric cols)

**Risk:** Admin manually edits col 22 Highlights on an app row in the sheet. The next to-excel cron UPDATE branch overwrites with the app's value. Sheet edit lost.

**Pre-existing behaviour:** the `from-excel` UUID path only pulls cols 11/15/16 (Attendees/Rubbish/Trees) into `event_impact`. Other cols are app-canonical.

**Mitigation:** None currently. Sheet edits to non-numeric cols ARE lost on next UPDATE. Documented as expected behaviour.

**Future improvement:** widen `from-excel` UUID path to pull all answer cols and upsert into a new `survey_responses_admin_edit` flag. Out of scope tonight.

### 3.4 Synthetic events accidentally pushed back

**Risk:** A Forms-origin event (UUID v5 synthetic) gets included in `to-excel` push, creating a (collective-alias-confused) duplicate row.

**Mitigation:** Two-signal dual check at top of `syncToExcel` loop:
- `created_by IS NULL` (legacy synthetics)
- `isSyntheticFormsUuid(id)` (UUID v5 char-14 check)

If either fires -> skip. Audit 2026-05-11 confirmed both signals required.

### 3.5 Strict dedup signature collision

**Risk:** App event has `(collective, date, lc(title))` matching an existing Forms row -> APPEND skipped.

**Behaviour:** Correct - the Forms row is authoritative for the event; admin must reconcile manually (move the Forms row to a different ID or delete).

### 3.6 Weak dedup warnings (same collective+date, different title)

**Behaviour:** Warning surfaced in `weakDedupWarnings`, NOT auto-skipped. False-positive cost of auto-skip (genuinely two events same day) > false-negative cost of admin reconciliation.

### 3.7 Numeric column string leak

**Risk:** Leader types "12kg" in q4. Old code did `(q4 as string) ?? ''` -> wrote "12kg" string into number col 15.

**Fix:** `numberOrBlank` returns the fallback (event_impact.rubbish_kg or '') for unparseable strings. Sheet sums and sorts preserved.

### 3.8 `default_value` not pre-filled for ATTENDEE survey

**Note:** `log-impact.tsx` is the LEADER survey (drives sheet). `post-event-survey.tsx` is the ATTENDEE survey ("how was it?", uses different question set, doesn't write to sheet). The default_value pre-fill is wired in log-impact.tsx only - that's the surface that matters. The attendee survey doesn't yet seed defaults but its questions don't have any.

### 3.9 Required yes_no with no default

**Behaviour:** Leader cannot submit without explicitly picking Yes or No. Matches Form's forced-choice. If they tap-same-to-deselect after picking, can't submit until they pick again. Acceptable friction.

### 3.10 Survey response upsert race

**Risk:** Two leaders submit impact survey for same event simultaneously. Survey responses upsert keyed on `(survey_id, event_id, user_id)`; each leader has their own row. To-excel reads `order(submitted_at desc) limit 1` -> latest wins. If leader A submits at T then leader B submits at T+10s, sheet shows B's answers.

**Mitigation:** Log Impact UI is gated to `isAssistLeader || isStaff`; collective typically has 1-2 leaders. Race is uncommon. Accepted.

### 3.11 Event status flipped to 'draft' or 'cancelled' after sync

**Risk:** App row on sheet, leader cancels the event -> status='cancelled'. To-excel batch mode filters by `status IN (published, completed)` so the cancelled event is no longer pushed. Next from-excel reconciliation: status was 'completed' before cancellation; now 'cancelled' -> not in candidate set (status filter). The sheet row STAYS.

**Behaviour:** Stale row on sheet. Pre-existing.

**Mitigation:** Out of scope. Could add a `deleteFromExcel` trigger on status='cancelled' transition. Defer.

### 3.12 Non-Australia/Brisbane timezone events

**Risk:** Event created with `date_start` in UTC; sheet stores Excel serial number using local Date math. AEST events offset by 10h.

**Pre-existing behaviour:** `dateToExcelSerial` uses local Date math; runs on Supabase Edge which is UTC. Off-by-one date when event is in early-AEST morning.

**Mitigation:** Pre-existing; not regressed by this PR.

### 3.13 Excel `usedRange` includes empty trailing rows

**Risk:** If a row has been blanked but not deleted, `usedRange.values` includes empty rows. The `idToRowIndex` build skips rows with empty id, so unaffected.

### 3.14 Graph API rate limits / failures

**Risk:** Graph API returns 429 or 503. `graphRequest` throws; the parent catches and appends to errors. Run completes partially.

**Mitigation:** Caller (cron) re-runs next cycle. HEALTH GUARD prevents reconciliation from running if to-excel hasn't succeeded in 2h.

### 3.15 Survey question metadata drift

**Risk:** New survey questions added via admin UI without `is_impact_form=true` or with new IDs the Edge Function doesn't know about.

**Behaviour:** New question ids in `answers` are ignored by the 28-col mapping. Doesn't break sync; just doesn't surface on sheet.

**Mitigation:** Admin docs should warn about adding survey questions that need a sheet column. Out of scope tonight.

### 3.16 Brisbane Norman Creek already on sheet (Hannah's row)

**Status:** Row 286 verified post-v37 deploy. Cols 6/7/8/9 + 20/21/22/23/24/25/27 all align with Forms convention. ✓

---

## 4. Test plan (executed)

| # | Test | Result |
|---|---|---|
| 1 | Brisbane forms_migrated_at flipped + DEFAULT applied | ✓ Verified via PATCH return + `information_schema` query |
| 2 | Edge Function v37 deployed | ✓ Management API confirms v37 sha=8244d90a |
| 3 | Norman Creek row 286 mapped correctly (col 7 = q1 verbatim, col 8 = q2 verbatim, col 9 = '' from NA, col 20 = actual issue, col 22 = actual highlight, col 25 = "No") | ✓ Graph API read confirms |
| 4 | Lilydale 17 May row 283 (Caitlyn typed q2="No" for Landcare) | ✓ Col 8 now blank after isNoAnswer extension |
| 5 | All 4 app-origin sheet rows backfilled | ✓ Manual sync UPDATE=1 for each |
| 6 | TypeScript type-check (front-end) | ✓ Exit 0; no new errors in modified files (pre-existing database.types drift) |
| 7 | Reconciliation cancellation risk probe (newly-migrated collectives) | ✓ 1 at-risk event (Norman Creek), already on sheet |

---

## 5. Files changed

```
coexist/supabase/functions/excel-sync/index.ts                              (+220 -22)
coexist/supabase/migrations/20260518090000_flip_remaining_collectives_to_migrated.sql   (new)
coexist/supabase/migrations/20260518100000_impact_form_questions_leave_blank_ux.sql     (new)
coexist/supabase/migrations/20260518110000_collectives_forms_migrated_default.sql       (new)
coexist/src/components/survey-questions.tsx                                 (small)
coexist/src/components/survey-questions-utils.ts                            (small)
coexist/src/pages/events/log-impact.tsx                                     (small)
coexist/ios/App/App.xcodeproj/project.pbxproj                               (version bump 1.8.10/39)
```

---

## 6. Watch list for tomorrow

1. **`excel_sync_runs.summary.errors` for INFO post-cutover-migrated skips** - if a Forms leader for an "expected-migrated" collective is still using Forms, they need a nudge.
2. **`weakDedupWarnings`** count growth - leader title drift on real events.
3. **`cancelledViaSheetAbsence`** count - first reconciliation cycle after the migration flip should be 0; anything non-zero needs investigation.
4. **`to_excel_error_count`** spikes - Graph API transient failures.
5. **`survey_responses` rows where `answers->>'q1'` matches a partner_name pattern** - those should ideally use the create-event "External Collab" toggle instead of typing into q1.

Doctrine references:
- `~/ecodiaos/patterns/excel-sync-collectives-migration.md`
- `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md`
- `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md`
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`
