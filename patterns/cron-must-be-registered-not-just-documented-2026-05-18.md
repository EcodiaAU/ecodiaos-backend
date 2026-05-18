---
name: cron-must-be-registered-not-just-documented-2026-05-18
description: A cron referenced in a docstring or pattern but absent from os_scheduled_tasks / routines/ / PM2 is doctrine fiction. Every cron MUST have a registration surface.
triggers: cron-must-be-registered, doctrine-fiction-cron, recurring-billing-monthly, billingScheduleEngine, marketing-outreach-cron, monday-post-batch, scheduler-row-missing, cron-symbolic-fire, cron-documented-not-scheduled, claim-vs-substrate, every-cron-must-have-a-registration, deliverable-without-trigger, doctrine-only-cron, doc-claim-no-substrate
status: active
---

# Cron must be registered, not just documented

A cron referenced in a docstring, pattern file, routine doc, or comment but ABSENT from `os_scheduled_tasks` table / `backend/routines/<name>.md` with frontmatter `schedule:` / PM2 daemon / Windows Task Scheduler is **doctrine fiction**. The fact that a piece of code says "this cron fires daily 09:00 AEST" does not make the cron exist.

## The rule

Every cron mentioned in any durable substrate (code comment, pattern file, doctrine doc, CLAUDE.md) MUST have at least one of:

1. **`os_scheduled_tasks` row** (the canonical VPS scheduler, when VPS substrate is live).
2. **`backend/routines/<name>.md` with `schedule:` frontmatter** (Anthropic-cloud Routine).
3. **PM2 daemon entry** in `ecosystem.config.js` (local Corazon).
4. **Windows Task Scheduler** entry (local Corazon, for non-Node tasks).
5. **`cron` registered via `schedule_cron` MCP call** with verifiable next_run.

If NONE of these exist, the doc claim is a lie. The fix is either:
- Register the cron in a real substrate, OR
- Delete the doc claim.

Both are valid. **Documenting a cron that doesn't fire is worse than documenting nothing.**

## Why

Three offenders surfaced in the 2026-05-18 audit:

- **`recurring-billing-monthly`** - `src/services/billingScheduleEngine.js:12` and `clients/coexist.md:132` both claim it runs daily 09:00 AEST. Zero registrations across `src/`, `scripts/`, `routines/`. **The reason INV-2026-004 is on a status_board manual-fire row is that the doc claim was treated as substrate, and the substrate didn't exist.** SHIPPED 2026-05-18: cron prompt rewritten to invoke a deterministic runner at `backend/scripts/cron/recurring-billing-monthly.js`, registered in migration 129.
- **`marketing-outreach` (every 72h)** - doctrine claims it produces LinkedIn/IG drafts per fire. Zero `cowork.marketing.*` keys, zero draft files. Cron either doesn't fire or fires symbolically.
- **`Monday-10:00 weekly post-batch`** - referenced in `marketing-post-primitives-and-generation-doctrine-2026-05-16.md`. No scheduler row.

The compounding harm: every time someone reads the doc and treats the cron as real, they layer downstream dependencies on a phantom trigger. INV-2026-004 ended up as a manual fire on status_board because a human became the actual scheduler.

## How to apply

**Before writing any "cron fires X cadence" sentence in a doc:**

1. Decide which substrate owns the trigger.
2. Register it in that substrate (with verifiable next_run).
3. Then write the doc claim.

**When auditing existing docs:**

```bash
grep -rE "(every|daily|weekly|hourly) (at|0?[0-9]{1,2}:[0-9]{2}|hour|day|week|min)" backend/patterns/ backend/clients/ backend/src/ | grep -v archived
```

For each hit, verify the substrate exists. Where it doesn't, either register or strike.

**When wiring a new cron:**

- Author the registration in the substrate.
- Stamp the first successful fire's timestamp into `kv_store.cron.<name>.last_fire_at`.
- Wire the cron-fire-must-have-deliverable rule. ([[cron-fire-must-have-deliverable-not-just-narration]])

## Verification

A cron passes registration audit when:

- `kv_store.cron.<name>.last_fire_at` is within 1.5x its stated cadence, OR
- the cron is brand-new and its `next_run` is within 1.5x cadence.

Otherwise the cron has joined the doctrine-fiction pile and should be relit or deleted.

## Origin

40-minute audit window 2026-05-18 while Tate was out. Finance/billing audit surfaced `recurring-billing-monthly` as the load-bearing example: documented for months in `clients/coexist.md` and `billingScheduleEngine.js`, never actually scheduled with a working runner. Marketing audit found the same shape in `marketing-outreach` and `Monday-10:00 post-batch`. Three offenders in one session = pattern, not incident.

## Cross-refs

- [[cron-fire-must-have-deliverable-not-just-narration]]
- [[cron-deliverables-can-be-conditional-not-all-fires-must-ship]]
- [[verify-deployed-state-against-narrated-state]]
- [[narration-vs-disk-reconciliation-checklist]]
