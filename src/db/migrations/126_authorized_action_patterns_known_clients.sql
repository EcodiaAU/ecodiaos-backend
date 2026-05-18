-- 2026-05-18: Extend authorized_action_patterns with active-engagement
-- client domains so routine gmail.send to known clients does not require
-- per-message SMS-OTP from the tier-3 gate.
--
-- The §3.2 seed in migration 084 only covered ecodia.au / ecodia.com.au.
-- The Tier-3 SMS-OTP dispatch path from tier3GateService is intentionally
-- decoupled from Twilio for testability, and no caller currently forwards
-- the otp_code to Tate's phone. Until that dispatcher is wired (see
-- status_board "Wire tier-3 SMS-OTP dispatcher to sms.tate"), every send
-- to an external recipient returns pending_otp and gets stuck.
--
-- Adding active-engagement client domains gets routine sends through.
-- Per-client pattern names so each engagement is individually revocable.
--
-- Wildmountains is intentionally NOT included - engagement is verbally
-- locked but not contracted (status_board c45012dc) and the canonical
-- domain is contested (wildmountains.org.au held by Lizz Hills per
-- status_board 8c3199ea; wildmountains.com.au pending registration
-- decision). Add a row for WM when the engagement is contracted and the
-- domain is settled.
--
-- Idempotent via ON CONFLICT on pattern_name.

INSERT INTO authorized_action_patterns
  (pattern_name, action_type, matcher_json, approved_by, active)
VALUES
  (
    'client_coexist_comms',
    'gmail_send_external',
    '{"to_domain":{"$in":["coexistaus.org"]}}'::jsonb,
    'tate',
    TRUE
  ),
  (
    'client_resonaverde_comms',
    'gmail_send_external',
    '{"to_domain":{"$in":["resonaverde.au"]}}'::jsonb,
    'tate',
    TRUE
  )
ON CONFLICT (pattern_name) DO UPDATE
  SET matcher_json = EXCLUDED.matcher_json,
      action_type  = EXCLUDED.action_type,
      approved_by  = EXCLUDED.approved_by,
      active       = TRUE;
