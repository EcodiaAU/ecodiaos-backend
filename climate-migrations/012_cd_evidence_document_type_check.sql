-- 012_cd_evidence_document_type_check.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- Zoo pass-1 defect 1 (climate-testing/zoo/results-pass1-2026-06-10.md): document_type was
-- validated nowhere, so vocabulary fragmentation downstream was certain (the repo's own
-- fixtures already drifted: electricity_invoice vs electricity_bill). This is the DB-side
-- twin of the closed DOCUMENT_TYPES vocabulary in src/services/climate/ingest/classify.js.
--
-- The allowed list is DOCUMENT_TYPES minus 'not_evidence': a confident refusal is a valid
-- CLASSIFICATION but never a register row; refusals must never reach cd_evidence_items
-- (the commit layers refuse is_evidence:false structurally; this CHECK is the last line).
-- null stays allowed: staged/unclassified rows may carry no document_type yet.
--
-- Added NOT VALID: cd_evidence_items is append-only (the 002 trigger rejects UPDATE and
-- DELETE for every role), so a pre-existing drifted row could never be rewritten to pass
-- validation; the constraint therefore enforces go-forward inserts only, and historical
-- drift is surfaced by cd_register_query consumers rather than blocking the migration.
-- Idempotent: the DO block guards on the constraint name.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cd_evidence_items_document_type_check'
      and conrelid = 'public.cd_evidence_items'::regclass
  ) then
    alter table public.cd_evidence_items
      add constraint cd_evidence_items_document_type_check
      check (
        document_type is null or document_type in (
          'electricity_invoice',
          'gas_invoice',
          'fuel_invoice',
          'fuel_card_statement',
          'refrigerant_service_record',
          'water_invoice',
          'waste_invoice',
          'travel_record',
          'supplier_invoice',
          'meter_reading',
          'workbook',
          'other_evidence'
        )
      ) not valid;
  end if;
end
$$;
