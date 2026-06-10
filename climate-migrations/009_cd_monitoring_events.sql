-- 009_cd_monitoring_events.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Continuous-monitoring feed. Fires that find nothing still write integrity_ok, so
-- silence is detectable (health-canary-must-alert-not-silently-accumulate).

create table public.cd_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  event_type text check (event_type in ('factor_update', 'coverage_gap', 'drift', 'threshold_breach', 'integrity_ok', 'integrity_fail', 'classifier_sample')),
  detail jsonb,
  detected_at timestamptz default now(),
  resolved_at timestamptz
);

revoke select, insert, update, delete on public.cd_monitoring_events from anon, authenticated;
-- Service-role only. Retainer monitoring feed, intentionally invisible to PostgREST.
