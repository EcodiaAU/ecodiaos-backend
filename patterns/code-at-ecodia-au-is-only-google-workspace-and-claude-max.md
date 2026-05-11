---
triggers: code-at-ecodia-au, code-account-scope, code-third-vendor, code-as-separate-identity, login-as-code-at-non-google-non-anthropic, code-at-vercel, code-at-stripe, code-at-apple, code-at-bitbucket, code-at-github-as-separate-account, code-as-tate-shadow, code-at-supabase, code-at-resend, code-at-canva, code-at-xero, code-at-zernio, code-at-revenuecat, code-at-cloudflare, code-at-aws, code-at-do, vendor-account-architecture, apple-id-code-at
---

# code@ecodia.au exists at exactly three vendors - Google + Anthropic + Apple - never anywhere else as a separate identity

## The rule

`code@ecodia.au` is a real identity (full inbox, password, 2FA, recovery) at exactly three vendors:

1. **Google Workspace** - the Gmail account, the user the conductor sends mail from / receives mail at, the surface the gmail MCP tools attach to.
2. **Anthropic Claude Max** - the dedicated subscription that runs the Factory CLI process, separate from the tate@-Max subscription that runs the conductor's main session.
3. **Apple** - one Apple ID: membership in the Ecodia Pty Ltd Apple Developer team (`team_id 86PUY7393S`, kv_store `creds.apple`). Contact to Tate goes via Twilio SMS (iMessage removed Tate-directed 11 May 2026).

EVERY OTHER VENDOR resolves to ONE account, logged in as Tate. Specifically: GitHub/Bitbucket/Vercel/Stripe/AWS/Cloudflare/DO/Supabase/Neo4j/Resend/Canva/Xero/RevenueCat/Zernio. The conductor reaches those via Tate's logged-in session through Corazon (the laptop-agent peer paradigm) or via vendor API tokens stored in `kv_store.creds.*`.

## Do

- Use the gmail MCP tools at `code@ecodia.au` for outbound + inbound mail when EcodiaOS is the sender/recipient identity.
- Spawn Factory CLI sessions on the dedicated `code@`-Anthropic-Max account (the `claude --account` flag or env equivalent already wires this).
- For ANY other vendor, drive Tate's logged-in browser session via Corazon's `input.*` + `screenshot.*` peer-paradigm tools, or call the vendor's API with the token from `kv_store.creds.*`. The conductor never authenticates as code@ at those vendors.

## Do not

- Do NOT create a `code@`-account at GitHub, Bitbucket, Vercel, Stripe, AWS, Cloudflare, DigitalOcean, Supabase, Neo4j, Resend, Canva, Xero, RevenueCat, Zernio, or any other non-Google/non-Anthropic/non-Apple vendor. If a workflow seems to need it, the workflow is wrong.
- Do NOT confuse the Apple Developer team ownership (Ecodia Pty Ltd, team_id 86PUY7393S, the legal vehicle the apps publish under) with the Apple ID identity (code@ecodia.au, the human-style account that owns membership in that team). The team is the entity; the Apple ID is the user.

## Protocol when adding a new vendor surface

1. Default: Tate's logged-in session via Corazon, or vendor API token.
2. If you genuinely need a separate machine identity (e.g. server-to-server cron, no human in the loop, no API token available), surface to Tate before creating the account. The bar is high.
3. If approved: create the account at the vendor, store the password in Tate's password manager (NOT kv_store), store the API/access keys in `kv_store.creds.<vendor>`, update `~/CLAUDE.md` line 204 + this file's three-place count + the triggers list.
4. New vendor surfaces are doctrine-shifting events; they need durable record (status_board P2 + Neo4j Decision) explaining why this vendor crossed the bar.

## Origin

- Pre-2026-05-04: doctrine was "exactly two places" (Google Workspace + Anthropic). Set during the Factory wiring period when the dedicated Anthropic Max account became the second `code@` surface.
- 4 May 2026 18:46 AEST: Tate verbatim "YOu've alread ygot a code@ apple id..." while the conductor was scoping a dedicated EcodiaOS iMessage Apple ID. Surfaced that the existing Apple Developer team membership is held by an Apple ID at code@ - so iMessage activation just needs Tate to sign Messages.app on SY094 into that existing Apple ID, not create a new one. Doctrine updated to three-place count. Cross-ref Episode tracking the iMessage primary-channel ship (commit + Episode TBD via fork_moqyjzox_763fdb).

## Cross-references

- `~/CLAUDE.md` line 204 - the canonical three-vendor sentence.
- `~/ecodiaos/patterns/sms-segment-economics.md` - WHY iMessage primary matters (Twilio SMS cost compounding during incident loops).
- `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` - sibling cost-discipline rule on the SMS surface itself.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - the peer-paradigm path that handles all OTHER vendors when code@ doesn't exist there.
- `kv_store.creds.apple` - Apple Developer team metadata.
- `kv_store.creds.macincloud` - SY094 SSH config for driving Messages.app.
