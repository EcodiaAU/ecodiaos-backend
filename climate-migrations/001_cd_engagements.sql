-- 001_cd_engagements.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, applied at provisioning day.
-- NEVER apply to the EcodiaOS substrate project (nxmtfzofemtrlezlyhcj); client evidence
-- does not share a database with our own organs.

create table public.cd_engagements (
  id uuid primary key default gen_random_uuid(),
  entity_name text,
  abn text,
  reporting_period_start date,
  reporting_period_end date,
  group_classification text,
  contacts jsonb,
  scope_boundary jsonb,
  status text check (status in ('setup', 'retainer', 'paused', 'closed')),
  -- Red-team amendment (2026-06-10, wf_017d6d7e-830): materiality-weighted confirmation.
  -- Evidence items whose value exceeds this threshold require firm-side or entity-side
  -- confirmation BEFORE commit (see cd_evidence_items.confirmation_status).
  materiality_threshold numeric,
  created_at timestamptz default now()
);

revoke select, insert, update, delete on public.cd_engagements from anon, authenticated;
-- Service-role only. Client engagement state; no client portal in v1, intentionally invisible to PostgREST.
