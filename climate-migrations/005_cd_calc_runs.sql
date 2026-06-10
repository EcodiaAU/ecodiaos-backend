-- 005_cd_calc_runs.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Deterministic calculation lineage: every disclosed figure resolves to a calc run that
-- records its inputs hash, factor vintage, calculator git SHA and the evidence it consumed.
-- Old runs are immutable; a factor-vintage bump produces NEW rows with superseded_by set
-- on the old ones.

create table public.cd_calc_runs (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  calculator text,
  code_sha text,
  factor_vintage text,
  inputs_hash text,
  evidence_ids uuid[],
  output_tco2e numeric,
  output_breakdown jsonb,
  run_at timestamptz default now(),
  superseded_by uuid references public.cd_calc_runs(id)
);

revoke select, insert, update, delete on public.cd_calc_runs from anon, authenticated;
-- Service-role only. Calc-run lineage behind disclosed figures, intentionally invisible to PostgREST.
