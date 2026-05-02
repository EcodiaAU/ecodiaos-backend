-- §3.2 seed — authorize internal Ecodia comms for auto-issue tokens.
--
-- The brief (project_security_hardening_may2026.md / step 3) calls for ONE
-- safe pattern seeded so routine mail between Ecodia inboxes (ecodia.au,
-- ecodia.com.au) does not require an SMS-OTP challenge every send. Every
-- external-recipient send still goes through the gate — this row just
-- skips the human-in-the-loop challenge for mail to our own domains.
--
-- Idempotent via ON CONFLICT. Reverting is a manual DELETE; we don't
-- ship auto-revoke because the pattern is trivially re-issued.

INSERT INTO authorized_action_patterns
  (pattern_name, action_type, matcher_json, approved_by, active)
VALUES
  (
    'internal_ecodia_comms',
    'gmail_send_external',
    '{"to_domain":{"$in":["ecodia.au","ecodia.com.au"]}}'::jsonb,
    'tate',
    TRUE
  )
ON CONFLICT (pattern_name) DO UPDATE
  SET matcher_json = EXCLUDED.matcher_json,
      action_type  = EXCLUDED.action_type,
      approved_by  = EXCLUDED.approved_by,
      active       = TRUE;
