-- 003_cd_anchors.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Chain-head anchors: daily digest into Neo4j, weekly digest optionally written to the
-- Polygon contract. An auditor verifies the evidence trail existed at the claimed time
-- and has not been rewritten since.

create table public.cd_anchors (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  chain_head_hash text,
  seq_from bigint,
  seq_to bigint,
  anchored_to text check (anchored_to in ('neo4j', 'polygon')),
  anchor_ref text,
  anchored_at timestamptz default now()
);

revoke select, insert, update, delete on public.cd_anchors from anon, authenticated;
-- Service-role only. Integrity anchors for the evidence chain, intentionally invisible to PostgREST.
