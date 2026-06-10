-- 006_cd_clause_register.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- AASB S2 decomposed into one row per disclosure requirement (W4 seeds the content),
-- including the Corporations Act overlays that bind drafting (s 296D scenario minimums).

create table public.cd_clause_register (
  id uuid primary key default gen_random_uuid(),
  standard text default 'AASB_S2',
  standard_version text,
  clause_ref text,
  requirement_summary text,
  evidence_types text[],
  applicability_notes text,
  unique (standard, standard_version, clause_ref)
);

revoke select, insert, update, delete on public.cd_clause_register from anon, authenticated;
-- Service-role only. Standards decomposition consumed by drafting workers, intentionally invisible to PostgREST.
