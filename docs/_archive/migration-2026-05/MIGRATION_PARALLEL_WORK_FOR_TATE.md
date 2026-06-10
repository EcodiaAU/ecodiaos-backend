# Parallel-work prompt — manual UI steps only Tate can do (2026-05-15 migration)

This is the work that local-EcodiaOS (Corazon Claude Code session) cannot do because it requires human-driven web UI on three different claude.ai accounts. Run this in parallel with the conductor migration sprint.

Time estimate: 60-90 min if you have all three browser sessions logged in already.

---

## Pre-check: confirm Routines are enabled on the plan

Before any of the per-account work, verify Routines are actually available:

1. Sign in to claude.ai on tate@ecodia.au.
2. Visit https://claude.ai/code/routines.
3. Confirm you see "New routine" button (not a paywall or "research preview waitlist" page).
4. Repeat on code@ecodia.au and money@ecodia.au.

If any account is missing access, tell local-me and I will route work to the accounts that have it.

If all three accounts have access, continue.

---

## Step 1: Register the ecodia MCP server as a Custom Connector on each account

Per Claude Code docs, Routines use **Connectors** (the claude.ai integration list at claude.ai/customize/connectors), NOT locally-added `claude mcp add` servers. So the ecodia MCP must be registered as a Custom Connector on each account that will host a Routine.

Bearer token to use (same one everywhere):
```
7bb65299407a6d0481e11ff3e1d0da04660e45e8dd087e953dd640a0e79436c1
```

URL:
```
https://api.admin.ecodia.au/api/mcp/ecodia
```

(The cowork alias at /api/mcp/cowork stays alive for 30 days, but use /api/mcp/ecodia going forward.)

For each of tate@, code@, money@:

1. Sign in to claude.ai.
2. Visit https://claude.ai/customize/connectors.
3. Click "Add custom connector" (or whatever the current label is — UI may have shifted).
4. Name: `ecodia`
5. Description: `EcodiaOS MCP V2 — peerage substrate. status_board / kv_store / Neo4j / forks / patterns / email_threads / crm / scheduler / gmail / sms.`
6. URL: `https://api.admin.ecodia.au/api/mcp/ecodia`
7. Auth: Bearer token, paste the token above.
8. Save.
9. Verify: open a fresh Claude.ai chat, ask "list ecodia tools" — you should see 22 tools enumerated.

If the connector save form does not have a Bearer auth option, tell local-me and I will switch the MCP shim to OAuth or another supported scheme.

---

## Step 2: Install the Claude GitHub App on the EcodiaOS-backend repo

Some of the migrated cron work uses GitHub triggers (PR review routine, deploy verification routine). For those to fire, the Claude GitHub App must be installed on the repo.

1. Sign in to GitHub as the account that owns / has admin on the EcodiaOS-backend repo (likely your personal GitHub).
2. Visit https://github.com/apps/claude.
3. Click Install. Select the EcodiaOS-backend repo (and Co-Exist if you want PR-deploy routines for that too).
4. On claude.ai (tate@), visit https://claude.ai/code/routines and run `/web-setup` if prompted to grant repo access for cloning.

---

## Step 3: For each Routine I author, create it via the web UI

Local-me is shipping a folder at `D:/.code/EcodiaOS/backend/routines/` containing one markdown file per Routine. Each file has frontmatter naming the target account, schedule, repos, connectors, and the verbatim prompt text.

For each file in `backend/routines/`:

1. Open the file. Read the frontmatter — note the `account:` field (tate / code / money).
2. Sign in to claude.ai on the named account.
3. Visit https://claude.ai/code/routines → New routine.
4. Name: copy from `name:` frontmatter.
5. Prompt: copy the full body of the markdown file (everything below the frontmatter).
6. Repositories: per `repos:` frontmatter — usually `EcodiaOS-backend` only, sometimes plus a client repo.
7. Environment: Default (Trusted network access — MCP routes through Anthropic, no need to allowlist api.admin.ecodia.au).
8. Connectors: ensure `ecodia` is selected. Remove any others that aren't needed for this routine.
9. Trigger: per `trigger:` frontmatter (Schedule + cadence, or API, or GitHub event).
10. Permissions: enable "Allow unrestricted branch pushes" only if the routine writes to non-claude/-prefixed branches (most don't).
11. Click Create.
12. Click "Run now" once to verify the routine executes end-to-end against the live ecodia MCP. Open the resulting session URL in a browser and watch.
13. If the Run-now run reads status_board successfully and produces the expected artefact, the routine is ready. Move to the next file.

If a Run-now fires and the routine 401s on MCP, that means the connector wasn't attached or the bearer is wrong on that account. Re-check Step 1 for that account.

---

## Step 4: For API-trigger Routines, generate tokens and hand them back to local-me

A subset of routines have `trigger: api` in frontmatter — these are the ones that fire on external webhook events (Resend inbound email, Stripe webhook, Vercel deploy, GitHub PR). For each:

1. After creating the routine in Step 3, edit it.
2. Add an API trigger.
3. Click "Generate token" — copy IMMEDIATELY (only shown once).
4. Note the URL (looks like `https://api.anthropic.com/v1/claude_code/routines/trig_<id>/fire`).
5. Paste both URL + token into a single secure message back to local-me. Local-me will store them in kv_store and wire the VPS webhook shims to POST to them.

---

## Step 5: Confirm subscription extra-usage is enabled on each account

Per Claude Code docs: when a routine hits the daily cap or the subscription usage limit, organizations with extra usage enabled keep running on metered overage. Without extra usage, additional runs are rejected.

Per existing memory `reference_claude_max_extra_usage.md`: extra usage is on for our Max subscriptions and covers Claude Code seamlessly. Verify it's still set:

1. claude.ai → Settings → Billing.
2. Confirm "Extra usage" or equivalent toggle is ON for tate@, code@, money@.

If any account has it off, turn it on. If it was off and a Routine fired during that window, the run was rejected — tell local-me and I will re-fire after.

---

## Step 6: Routine daily-run-cap awareness

Visit https://claude.ai/code/routines on each account and note the displayed daily routine cap and current consumption. The exact number isn't published in docs (it varies by tier). Tell local-me the per-account cap so I can finalise which Routine goes on which account to balance load.

If tate@'s cap looks too low to hold meta-loop + system-health + morning-briefing + claude-md-reflection + vercel-deploy-monitor + strategic-thinking + inner-life all on the same account, I will redistribute.

---

## Things you do NOT need to do

- Local-me handles all the prompt authoring (the routine prompt files are already written when you read the routines/ directory).
- Local-me handles the VPS-side MCP rename and dual-mount.
- Local-me handles the webhook shim rewrites that POST to /fire.
- Local-me handles the doctrine rewrites (CLAUDE.md, SELF.md, pattern files) for the new local-conductor architecture.
- Local-me handles the side-by-side run + cutover + tear-down of forkService / osSessionService / schedulerPollerService / voiceRelay.

The split is: anything that requires a human at a claude.ai web UI on a specific signed-in account = your work. Everything else = mine.

---

## Status tracking

When you finish a step, drop a one-line "Step N done" message into local-me's chat and I will update the migration status_board row.

When all six steps are done, the migration is unblocked end-to-end and local-me can flip the cutover.
