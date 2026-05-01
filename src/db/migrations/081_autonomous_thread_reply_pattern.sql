-- §3.2 seed — authorize autonomous thread replies to known senders.
--
-- Context: the autonomous triage path in gmailService.triagePendingEmails()
-- calls sendReplyToThread to auto-respond when the classifier is high
-- confidence. Previously these replies bypassed the composite Tier-3 gate
-- entirely because there's no human session at the call site.
--
-- This pattern narrows auto-issue to the minimum defensible surface:
--   - `is_thread_reply` must be TRUE — caller is always replying to someone
--     who already emailed us (recipient is trivially known).
--   - `autonomous` must be TRUE — explicitly tags this as the cron path so
--     a compromised session can't pass it without being autonomous-tagged.
--   - `body_length` must be <= 2000 chars — kills the "write a 5K-word
--     commitment email" exfiltration vector. Longer replies fall through
--     to manual SMS-OTP.
--
-- Commitment detector still runs BEFORE pattern match in sendEmailGated.
-- High-risk content (prices, deadlines, legal language, fault admissions)
-- forces manual Tier-3 regardless of pattern match via requiresManualTier3.
--
-- Idempotent via ON CONFLICT. Reverting: UPDATE ... SET active = FALSE.

INSERT INTO authorized_action_patterns
  (pattern_name, action_type, matcher_json, approved_by, active)
VALUES
  (
    'autonomous_thread_reply',
    'gmail_send_external',
    '{"is_thread_reply":true,"autonomous":true,"body_length":{"$lte":2000}}'::jsonb,
    'tate',
    TRUE
  )
ON CONFLICT (pattern_name) DO UPDATE
  SET matcher_json = EXCLUDED.matcher_json,
      action_type  = EXCLUDED.action_type,
      approved_by  = EXCLUDED.approved_by,
      active       = TRUE;
