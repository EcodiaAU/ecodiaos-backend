-- ============================================================================
-- Co-Exist Master Impact Sheet Cleanup
-- Authored: 2026-05-11 by EcodiaOS fork fork_mp0jqlhw_9ae37c
-- Branch: 1.8.5-excel-sync-impact-gate
--
-- PURPOSE: Identify and remove "polluted" rows from the master impact sheet.
-- Polluted = app-created events that were pushed to the sheet BEFORE the
-- 1.8.5 impact-survey gate was deployed. These rows have blank cols 11-27
-- (no attendees, no survey answers) because the leader hadn't submitted
-- their impact form yet.
--
-- SHEET METADATA (not secret — stable identifiers for the OneDrive file):
--   drive_id   : b!jB_eUPJMbUWf3eip_Me-34G0StMYwYdHtdf4sTNow-uVV9nof_IvQprzswNpaD8y
--   item_id    : 01RJHFBL37QUUGOQUVL5DJ67A53VKNDAGE
--   sheet_name : Post Event Review
--   file_name  : Master Impact Data Sheet.xlsx
--
-- GATE: To-excel only pushes events whose collective has forms_migrated_at
-- set AND date_start >= forms_migrated_at AND date_start >= '2026-05-04'
-- (SYNC_CUTOFF_DATE). So polluted rows come from THAT exact population.
--
-- RLS NOTE: Run these queries in the Supabase SQL editor (service_role
-- context, bypasses RLS). Do NOT bundle any key/credential value here.
--
-- WORKFLOW:
--   1. Run SECTION 1 to see the polluted event list. Share with Charlie.
--   2. When Charlie confirms, uncomment and run SECTION 2 to remove from sheet.
--      SECTION 2 is a description of rows to delete via the Graph API —
--      there is no SQL DELETE for sheet rows. See instructions below.
--   3. Run SECTION 3 to verify the re-baseline: legitimate events that SHOULD
--      be on the sheet (impact survey submitted) are present in the DB.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — READ ONLY
-- Identify events that are ON the sheet (or were pushed) WITHOUT a submitted
-- impact survey. These are the "polluted" rows Charlie needs cleaned up.
--
-- An event is a cleanup candidate if it:
--   (a) belongs to a migrated collective (forms_migrated_at IS NOT NULL)
--   (b) date_start >= '2026-05-04' (SYNC_CUTOFF_DATE — the to-excel gate)
--   (c) date_start >= collective's forms_migrated_at
--   (d) is app-created (created_by IS NOT NULL — not a from-excel synthetic)
--   (e) has no event_impact row (no impact data submitted)
--   (f) status IN ('published', 'completed') — same gate as to-excel batch
--
-- These are the rows that the OLD code would have pushed (passes a,b,c,d,f)
-- but the NEW 1.8.5 gate would block (fails e).
-- ============================================================================

SELECT
  e.id                           AS event_uuid,
  e.title,
  e.date_start::date             AS event_date,
  c.name                         AS collective,
  c.forms_migrated_at::date      AS collective_migrated_at,
  e.status,
  e.created_at::date             AS event_created_date,
  CASE
    WHEN sr.event_id IS NOT NULL THEN 'has_survey_response'
    ELSE 'no_survey_response'
  END                            AS survey_status
FROM events e
JOIN collectives c ON c.id = e.collective_id
LEFT JOIN event_impact ei ON ei.event_id = e.id
LEFT JOIN LATERAL (
  SELECT event_id FROM survey_responses
  WHERE event_id = e.id
  LIMIT 1
) sr ON TRUE
WHERE
  c.forms_migrated_at IS NOT NULL
  AND e.date_start >= '2026-05-04'
  AND e.date_start >= c.forms_migrated_at
  AND e.created_by IS NOT NULL
  AND e.status IN ('published', 'completed')
  AND ei.id IS NULL          -- no impact data = polluted
ORDER BY c.name, e.date_start;

-- Quick count:
SELECT COUNT(*) AS polluted_event_count
FROM events e
JOIN collectives c ON c.id = e.collective_id
LEFT JOIN event_impact ei ON ei.event_id = e.id
WHERE
  c.forms_migrated_at IS NOT NULL
  AND e.date_start >= '2026-05-04'
  AND e.date_start >= c.forms_migrated_at
  AND e.created_by IS NOT NULL
  AND e.status IN ('published', 'completed')
  AND ei.id IS NULL;


-- ============================================================================
-- SECTION 2 — DESTRUCTIVE: review SECTION 1 first.
--
-- There is NO SQL DELETE for Excel sheet rows. Deletion happens via the
-- Microsoft Graph API. Use the admin tool or the manual Graph API call below.
--
-- For each event_uuid in SECTION 1:
--   1. GET the sheet row index: call the excel-sync Edge Function with
--      direction=from-excel to refresh the in-memory state, then inspect
--      the sheet via Graph usedRange to find the row number for that UUID.
--   2. DELETE the row via Graph:
--      POST https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}
--           /workbook/worksheets/Post%20Event%20Review
--           /range(address='A{row}:AB{row}')/delete
--      body: { "shift": "Up" }
--
-- Batch deletion approach (preferred for >3 rows):
--   a. Suspend pg_cron jobids 9 and 10:
--        SELECT cron.unschedule(9);
--        SELECT cron.unschedule(10);
--      OR use Supabase dashboard > Database > pg_cron > pause both jobs.
--   b. Delete all polluted UUID rows from the sheet via Graph API in one pass.
--      See the Co-Exist admin panel or ask Tate to run the sheet-cleanup
--      function in excel-sync (future: add a ?direction=cleanup-no-impact endpoint).
--   c. Verify the sheet row count dropped by the expected number.
--   d. Resume both cron jobs:
--        SELECT cron.schedule(9, ...);  -- see 20260413060000_pg_cron_excel_sync.sql
--        SELECT cron.schedule(10, ...); -- same file
--      OR resume via dashboard.
--
-- THESE ARE THE UUIDs TO DELETE FROM THE SHEET (from SECTION 1 above):
-- [paste the event_uuid column values here after reviewing SECTION 1]
-- ============================================================================


-- ============================================================================
-- SECTION 3 — RE-BASELINE VERIFICATION (read-only)
-- After the sheet cleanup, confirm that legitimate events (impact submitted)
-- are correctly in the DB and will be pushed to the sheet on the next
-- to-excel run (hourly cron, jobid 10).
--
-- An event SHOULD be on the sheet if it:
--   (a) belongs to a migrated collective (forms_migrated_at IS NOT NULL)
--   (b) date_start >= '2026-05-04' AND date_start >= forms_migrated_at
--   (c) is app-created (created_by IS NOT NULL)
--   (d) status IN ('published', 'completed')
--   (e) HAS an event_impact row (impact survey submitted — the new gate)
-- ============================================================================

SELECT
  e.id                           AS event_uuid,
  e.title,
  e.date_start::date             AS event_date,
  c.name                         AS collective,
  e.status,
  ei.attendees,
  ei.rubbish_kg,
  ei.trees_planted,
  ei.logged_at::date             AS impact_logged_date
FROM events e
JOIN collectives c ON c.id = e.collective_id
JOIN event_impact ei ON ei.event_id = e.id   -- INNER JOIN: only events with impact
WHERE
  c.forms_migrated_at IS NOT NULL
  AND e.date_start >= '2026-05-04'
  AND e.date_start >= c.forms_migrated_at
  AND e.created_by IS NOT NULL
  AND e.status IN ('published', 'completed')
ORDER BY c.name, e.date_start;

-- Count of legitimate events that will be on the sheet after next to-excel run:
SELECT COUNT(*) AS legitimate_events_with_impact
FROM events e
JOIN collectives c ON c.id = e.collective_id
JOIN event_impact ei ON ei.event_id = e.id
WHERE
  c.forms_migrated_at IS NOT NULL
  AND e.date_start >= '2026-05-04'
  AND e.date_start >= c.forms_migrated_at
  AND e.created_by IS NOT NULL
  AND e.status IN ('published', 'completed');

-- ============================================================================
-- END OF CLEANUP SCRIPT
-- Next step: Tate to run SECTION 1, share list with Charlie for confirmation,
-- then proceed with SECTION 2 sheet row deletions via Graph API, then verify
-- with SECTION 3 that legitimate events are queued for the next to-excel push.
-- Deploy command: supabase functions deploy excel-sync --project-ref tjutlbzekfouwsiaplbr
-- ============================================================================
