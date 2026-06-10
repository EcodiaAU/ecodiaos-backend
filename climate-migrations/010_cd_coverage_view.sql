-- 010_cd_coverage_view.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- cd_coverage: expected documents joined against committed evidence, one row per
-- expected document per cadence period across the engagement's reporting period.
-- The chase cron reads THIS view; coverage is never recomputed in prompt.
-- covered = at least one committed evidence row of the right type/facility overlaps
-- the period. due_by = period end + grace_days; a missing month is a named gap.

create view public.cd_coverage as
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
  (ev.evidence_id is not null) as covered
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
left join lateral (
  select ei.id as evidence_id
  from public.cd_evidence_items ei
  where ei.engagement_id = ed.engagement_id
    and ei.document_type = ed.document_type
    and ei.facility is not distinct from ed.facility
    and ei.period_start <= p.period_end
    and ei.period_end >= p.period_start
  order by ei.seq desc
  limit 1
) ev on true;

revoke select on public.cd_coverage from anon, authenticated;
-- Service-role only. Internal coverage projection read by the chase cron, intentionally invisible to PostgREST.
