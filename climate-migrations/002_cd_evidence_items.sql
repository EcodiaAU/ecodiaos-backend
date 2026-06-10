-- 002_cd_evidence_items.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W1).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- The evidence register: the product's spine. An append-only hash chain per engagement.
-- row_hash = sha256 over the canonical JSON of the content columns plus prev_hash
-- (canonicalisation lives in backend/src/services/climate/evidenceChain.js).
-- Corrections NEVER update rows; they append a superseding row pointing at what they supersede.

create table public.cd_evidence_items (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid references public.cd_engagements(id),
  seq bigint,
  doc_sha256 text,
  storage_path text,
  source_channel text check (source_channel in ('email', 'workbook', 'api', 'manual')),
  document_type text,
  facility text,
  period_start date,
  period_end date,
  scope_category text,
  classifier_version text,
  classification_confidence numeric,
  payload jsonb,
  supersedes_id uuid references public.cd_evidence_items(id),
  prev_hash text,
  row_hash text,
  -- Red-team amendment (2026-06-10, wf_017d6d7e-830): materiality-weighted confirmation.
  -- Items above cd_engagements.materiality_threshold commit as 'pending_confirmation' and
  -- need firm-side or entity-side confirmation before they feed calc runs or drafts.
  confirmation_status text check (confirmation_status in ('auto', 'pending_confirmation', 'confirmed')) default 'auto',
  captured_at timestamptz,
  committed_at timestamptz default now(),
  unique (engagement_id, seq)
);

-- Append-only enforcement: UPDATE and DELETE are rejected at the trigger layer,
-- for every role including service_role. Corrections append superseding rows.
create function public.cd_evidence_items_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cd_evidence_items is append-only: % rejected. Corrections append a superseding row (supersedes_id), never rewrite history.', tg_op;
end;
$$;

create trigger cd_evidence_items_append_only
  before update or delete on public.cd_evidence_items
  for each row
  execute function public.cd_evidence_items_append_only();

revoke select, insert, update, delete on public.cd_evidence_items from anon, authenticated;
-- Service-role only. Client evidence register; append-only hash chain, intentionally invisible to PostgREST.
