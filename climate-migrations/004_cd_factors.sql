-- 004_cd_factors.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Emission factors, loaded per published National Greenhouse Accounts vintage.
-- NEVER edited in place: a new vintage = new rows, selected by effective dates.

create table public.cd_factors (
  id uuid primary key default gen_random_uuid(),
  factor_set text,
  vintage text,
  category text,
  unit text,
  value numeric,
  effective_from date,
  effective_to date,
  source_url text
);

revoke select, insert, update, delete on public.cd_factors from anon, authenticated;
-- Service-role only. Versioned factor tables read by the calc engine, intentionally invisible to PostgREST.
