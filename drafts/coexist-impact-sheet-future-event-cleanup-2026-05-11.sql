-- Co-Exist Impact Sheet: future-event row cleanup proposal
-- Authored: 2026-05-11 by fork_mp0mfqk0_0baa8f-worker-1
-- Purpose: identify rows in the master impact sheet that correspond to events
--          dated in the future (i.e. event has not yet happened) and should NOT
--          appear in a post-event impact sheet.
--
-- Run against Co-Exist Supabase project. Output is to be cross-referenced
-- against the master SharePoint Excel sheet rows by event_id.
--
-- The master sheet lives at:
-- https://ecodiacode.sharepoint.com/.../Co-Exist Impact Tracker.xlsx
-- (see ~/ecodiaos/docs/secrets/coexist-excel-file.md)
--
-- Column name verified: `date_start` confirmed in supabase/migrations/
-- (20260331130000_event_ticketing.sql, 20260401010000_event_impact_attendees.sql)

SELECT
  e.id                                                          AS event_id,
  e.title                                                       AS event_name,
  e.date_start                                                  AS event_date,
  COALESCE(e.collective_id::text, 'unknown')                    AS collective_id,
  COALESCE(c.name, 'unknown')                                   AS collective_name,
  'future-dated: remove from master sheet because event has not happened yet'
                                                                AS removal_reason
FROM events e
LEFT JOIN collectives c ON c.id = e.collective_id
WHERE e.date_start > NOW()
  AND e.status NOT IN ('cancelled', 'draft')
  AND e.created_by IS NOT NULL  -- exclude synthetic Forms-origin events (created_by IS NULL);
                                -- those were never pushed to the sheet by the to-excel path
  AND EXISTS (
    -- Only flag events whose collective has forms_migrated_at set AND whose date_start
    -- is on or after forms_migrated_at. These are the only events the to-excel APPEND
    -- path was eligible to push. Events from non-migrated collectives were always gated
    -- out by the migration gate, so they can't be on the sheet via the app path.
    SELECT 1
    FROM collectives c2
    WHERE c2.id = e.collective_id
      AND c2.forms_migrated_at IS NOT NULL
      AND e.date_start >= c2.forms_migrated_at
  )
ORDER BY e.date_start ASC;

-- Manual followup steps for Tate + Charlie:
-- 1. Run this query against the Co-Exist prod Supabase via the SQL editor
--    (https://supabase.com/dashboard -> Co-Exist project -> SQL Editor).
-- 2. Open the master impact sheet in SharePoint Excel.
-- 3. For each returned row, search the sheet for the event_name (col B "Event Title").
--    If the sheet has an ID column (col A), confirm by event_id match.
--    Delete the matching row.
-- 4. After cleanup, no row in the master sheet should have an event_date later
--    than today's date (assuming the date column is populated as a date/serial number).
--
-- Automated alternative (if a Microsoft Graph reverse-sync removal pass is built):
-- Feed the list of event_ids from this query into the deletion endpoint.
-- That would require a separate fork to implement the Graph API row-delete call
-- scoped to matching event IDs (analogous to deleteFromExcel in index.ts).
--
-- NOTE: This script is a PROPOSAL only. It does not execute any writes.
-- The master sheet is SharePoint Excel, not Supabase — no Supabase DELETE is needed.
-- The query output is purely diagnostic: it identifies what to remove from the sheet.
