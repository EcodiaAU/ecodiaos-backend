-- 139_staged_xero_sync_columns.sql
-- Adds tracking columns so XeroReconcileService can record which
-- staged_transactions have been pushed to Xero as BankTransactions,
-- and the Xero-side ID for idempotency + future re-sync detection.

ALTER TABLE staged_transactions
  ADD COLUMN IF NOT EXISTS xero_bank_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS xero_sync_error TEXT;

CREATE INDEX IF NOT EXISTS staged_transactions_xero_synced_at_idx
  ON staged_transactions (xero_synced_at) WHERE xero_synced_at IS NULL;
