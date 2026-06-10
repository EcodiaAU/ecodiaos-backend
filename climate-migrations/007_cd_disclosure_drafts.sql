-- 007_cd_disclosure_drafts.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Clause-mapped draft statements. Grounding is enforced at the schema layer, not by
-- reviewer discipline: a row that is not a named gap MUST cite evidence-register rows.

create table public.cd_disclosure_drafts (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  clause_ref text,
  draft_text text,
  evidence_citations uuid[],
  status text check (status in ('drafted', 'gap', 'entity_review', 'final')),
  version int,
  created_at timestamptz default now(),
  -- The grounding CHECK: every draft that asserts anything cites evidence, or it is a named gap.
  -- NOTE: the spec wrote `array_length(evidence_citations, 1) > 0` verbatim, but
  -- array_length over NULL or '{}' returns NULL, and a NULL CHECK passes, which would
  -- admit citation-less drafted rows. coalesce makes the gate actually bind.
  check (status = 'gap' or coalesce(array_length(evidence_citations, 1), 0) > 0)
);

revoke select, insert, update, delete on public.cd_disclosure_drafts from anon, authenticated;
-- Service-role only. Draft climate statements pre-delivery, intentionally invisible to PostgREST.
