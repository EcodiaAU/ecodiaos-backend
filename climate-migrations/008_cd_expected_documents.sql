-- 008_cd_expected_documents.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- The expected-documents checklist per facility: what should arrive and how often.
-- The cd_coverage view (010) joins this against committed evidence per period; the chase
-- cron reads the view, never recomputes coverage in prompt.

create table public.cd_expected_documents (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  facility text,
  document_type text,
  cadence text check (cadence in ('monthly', 'quarterly', 'annual')),
  grace_days int default 14
);

revoke select, insert, update, delete on public.cd_expected_documents from anon, authenticated;
-- Service-role only. Evidence-cadence expectations for the chase cron, intentionally invisible to PostgREST.
