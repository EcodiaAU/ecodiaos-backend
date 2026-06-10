-- 011_cd_coverage_view_v2.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Fixes the two W6-audit defects in the original cd_coverage (010):
--
--   1. Pending evidence counted as coverage. Per the materiality-confirmation amendment
--      (002, wf_017d6d7e-830), rows with confirmation_status = 'pending_confirmation' must
--      not feed calc runs or drafts, so they must not read as coverage either; otherwise
--      the view shows green while drafting is blocked. 'auto' rows (below the materiality
--      threshold) and 'confirmed' rows count; 'pending_confirmation' rows do not.
--
--   2. Superseded evidence still counted. The register is append-only: a correction
--      appends a new row whose supersedes_id points at the corrected row. The corrected
--      row is dead history and must not cover its period; when the correction changed
--      document_type, facility or period, the old row was producing phantom coverage.
--      superseded = any evidence row whose id appears in another row's supersedes_id.
--
-- Column contract is preserved for the W6 renderer (coverageReport.js): engagement_id,
-- expected_document_id, facility, document_type, cadence, period_start, period_end,
-- due_by, evidence_id, covered. One column is APPENDED (CREATE OR REPLACE VIEW only
-- permits appending): covered_including_pending carries the old permissive semantics
-- (any non-superseded evidence regardless of confirmation_status) so monitoring can
-- distinguish "nothing arrived" (false/false) from "arrived but unconfirmed"
-- (covered=false, covered_including_pending=true).
--
-- evidence_id now names the strict cover (confirmed/auto + non-superseded); it is null
-- when only pending evidence exists, keeping covered = (evidence_id is not null).

create or replace view public.cd_coverage as
select
  ed.engagement_id,
  ed.id as expected_document_id,
  ed.facility,
  ed.document_type,
  ed.cadence,
  p.period_start,
  least(p.period_end, e.reporting_period_end) as period_end,
  (least(p.period_end, e.reporting_period_end) + make_interval(days => coalesce(ed.grace_days, 14)))::date as due_by,
  ev.evidence_id,
  (ev.evidence_id is not null) as covered,
  (ev_any.evidence_id is not null) as covered_including_pending
from public.cd_expected_documents ed
join public.cd_engagements e
  on e.id = ed.engagement_id
cross join lateral (
  select
    gs::date as period_start,
    (gs + s.step - interval '1 day')::date as period_end
  from (
    select case ed.cadence
      when 'monthly' then interval '1 month'
      when 'quarterly' then interval '3 months'
      else interval '1 year'
    end as step
  ) s
  cross join lateral generate_series(
    e.reporting_period_start::timestamptz,
    e.reporting_period_end::timestamptz,
    s.step
  ) gs
) p
-- Strict cover: confirmed (or auto, below-threshold) evidence that no later row supersedes.
left join lateral (
  select ei.id as evidence_id
  from public.cd_evidence_items ei
  where ei.engagement_id = ed.engagement_id
    and ei.document_type = ed.document_type
    and ei.facility is not distinct from ed.facility
    and ei.period_start <= p.period_end
    and ei.period_end >= p.period_start
    and ei.confirmation_status is distinct from 'pending_confirmation'
    and not exists (
      select 1
      from public.cd_evidence_items sup
      where sup.supersedes_id = ei.id
    )
  order by ei.seq desc
  limit 1
) ev on true
-- Permissive cover (old 010 semantics minus superseded rows): anything non-superseded
-- arrived for the period, confirmation pending or not. Superseded rows stay excluded
-- here too: dead history is not "arrived", it is replaced.
left join lateral (
  select ei.id as evidence_id
  from public.cd_evidence_items ei
  where ei.engagement_id = ed.engagement_id
    and ei.document_type = ed.document_type
    and ei.facility is not distinct from ed.facility
    and ei.period_start <= p.period_end
    and ei.period_end >= p.period_start
    and not exists (
      select 1
      from public.cd_evidence_items sup
      where sup.supersedes_id = ei.id
    )
  order by ei.seq desc
  limit 1
) ev_any on true;

revoke select on public.cd_coverage from anon, authenticated;
-- Service-role only. Internal coverage projection read by the chase cron, intentionally invisible to PostgREST.
