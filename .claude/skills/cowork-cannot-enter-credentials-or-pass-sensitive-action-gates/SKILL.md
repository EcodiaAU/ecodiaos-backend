---
name: cowork-cannot-enter-credentials-or-pass-sensitive-action-gates
description: >
  Use when the turn involves cowork-cannot-enter-passwords, sensitive-action-reauth, admin-google-com, billing-page, password-prompt, duo-edge-case, cowork-claude-pre-stage, verify-step-tate-only, credentials-entry-blocked. Pattern: Cowork-Claude cannot enter credentials or pass sensitive-action re-auth gates.
---

# Cowork-Claude cannot enter credentials or pass sensitive-action re-auth gates

## The rule

Anthropic safety constraints prevent Cowork-Claude (Claude Desktop's agentic browser-driving feature on Corazon) from typing passwords, security codes, or any credential-shaped value into a UI form, EVEN under explicit user proxy authority. Most consumer SaaS dashboards also fire a sensitive-action re-auth gate (Google admin console, account password changes, billing pages, payment method changes) that requires re-entry of the user's password before the privileged action proceeds. Both classes of gate are absorbed by Tate, not by Cowork-Claude.

This means the duo split is:

- **Cowork-Claude can pre-stage:** open the right tab, navigate to the right page, click into the right form, surface a screenshot of the gate so Tate knows exactly what's needed.
- **Cowork-Claude cannot complete:** type the password, type the 2FA code, or click "Confirm" on a sensitive-action prompt where the next form needs a credential.
- **Tate completes the verify-step:** ~30s of typing, then hands back to Cowork-Claude (or to the conductor) to do the actual privileged action behind the gate.

## Concrete classes of gate that always kick back to Tate

1. **Google sensitive-action re-auth.** admin.google.com, accounts.google.com password changes, security settings changes, OAuth scope grants, MFA setup. Google fires a re-auth prompt asking for the account password before allowing entry to the admin console even when the session was already authenticated.
2. **Apple ID re-auth.** appstoreconnect.apple.com, developer.apple.com — same pattern: privileged actions trigger a fresh password prompt + 2FA code.
3. **Billing pages.** Stripe dashboard payment method changes, Anthropic console billing, GitHub billing, Vercel billing, Resend billing, any vendor "update credit card" flow.
4. **GitHub sudo mode.** github.com/settings/* fires a sudo prompt that asks for password or passkey before sensitive settings changes.
5. **Bitbucket / Atlassian sensitive-actions.** API token generation, OAuth app creation, account email change.
6. **Any "type your password to confirm" delete flow.** account deletion, repo deletion, project deletion across most SaaS.

## Protocol when this fires

1. Cowork-Claude pre-stages: navigates to the page, opens the form, screenshots the gate.
2. Cowork-Claude reports back to the conductor: "blocked at sensitive-action re-auth, page is X, screenshot saved, Tate needs ~30s to enter password when back."
3. Conductor records as `next_action_by=tate` on the relevant status_board row with the precise step Tate needs to complete.
4. When Tate is back: Tate types the credential, the gate clears, control returns to Cowork-Claude OR Tate completes the action himself (depending on which is faster).
5. Conductor archives the row when the privileged action behind the gate is verified done.

## Do

- Pre-stage as far as the gate. Get the workflow to the point where Tate's sole input is the credential.
- Screenshot the gate before reporting blocked, so Tate sees exactly what he's confirming.
- Record the precise next_action on status_board with the URL, the field needed, and what comes after.

## Do NOT

- Do not attempt to type the credential via input.* or any other primitive — the safety rule applies at the Cowork-Claude layer, not the surface tool.
- Do not assume "I have the password in kv_store" gives Cowork-Claude license to enter it. The constraint is on the agent's behavior, not the credential's presence.
- Do not loop "try the prompt, see if it goes through" — every attempt is a logged Anthropic safety violation.
- Do not classify a sensitive-action-blocked row as `next_action_by=ecodiaos` and then re-attempt; it stays `next_action_by=tate` until he physically types the credential.

## Origin

30 April 2026 ~10:38 AEST. Cowork-Claude (acting as Tate proxy while Tate is training) attempted to reset code@ecodia.au password at admin.google.com per the security incident remediation flow. Google fired a sensitive-action re-auth prompt requiring Tate's password before allowing entry to the admin console. Cowork-Claude correctly refused to type the password under Anthropic safety rules and reported the gate. Tate's verbatim observation: "Worth codifying as a duo edge-case: Google's sensitive-action gate (admin.google.com, accounts.google.com password changes, billing) plus credentials prompts in general always kick back to Tate. Cowork-Claude can pre-stage (open the right tab, navigate to the right page) but the verify-step is unavoidable."

Net: original `next_action_by=tate` classification on status_board row 2e08b39f stands, but for a different reason than originally narrated. Same outcome via a sharper rule.

## Cross-references

- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` — the parent doctrine for Cowork-Claude as primary substrate for web UI driving. This pattern is the bounded edge-case where the substrate cannot complete.
- `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md` — the inverse pattern: when Windows Hello / Windows passkey fires (NOT a SaaS sensitive-action gate), the conductor CAN inject the laptop unlock value via input.type. This is a different gate class.
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — the 5-point check before classifying anything Tate-blocked. Step 3 of that check is exactly the sensitive-action question: does the gate need Tate's identity? If yes, Tate-blocked is legitimate.
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — the parent macro doctrine that prefers logged-in GUI sessions over generated API keys. This pattern names the boundary case where even a logged-in session hits a re-auth gate.
