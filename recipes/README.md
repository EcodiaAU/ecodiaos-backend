# EcodiaOS Recipes

Hybrid runbook + bootstrap-procedure docs for tasks the conductor drives via Tailscale, laptop-agent, SSH, or browser. Recipes are the **secondary** execution surface; MCP tools / skills are primary.

## Architecture decision (4 May 2026 18:55-18:58 AEST)

After authoring the first recipe (`imessage-tate-via-sy094.md`), Tate asked the right question: is recipe-as-runtime-execution actually the best architecture? It isn't.

**Primary execution surface = MCP tools / skills.** One tool per repeated task. Sub-second invocation, deterministic, testable, low token cost. The runtime calls the tool; the tool encapsulates the SSH / osascript / API / shell logic.

**Recipes (this directory) are SECONDARY** and serve three jobs that MCP tools don't:

| Job | What recipe does | Why MCP tool can't |
|---|---|---|
| Bootstrap path for new task patterns | Markdown walkthrough the model reads + interprets at runtime when no tool exists yet | New tasks don't have tools yet; can't pre-build a tool for every conceivable task |
| Recovery runbook | Documents the fallback path when a tool's happy path fails (e.g. `tate-msg` returns `messages_app_not_running` -> recipe says "VNC into SY094, here are the steps to recover") | Tools fail-fast and surface error codes; the resilient recovery is human-readable + adaptive |
| Composite-task orchestration | When a task involves chaining 3+ tools with branching logic, the recipe holds the orchestration knowledge | Each tool owns one concern; the orchestration spans multiple tools |

## Promotion rule: 3+ runs -> tool

When the same recipe-driven task gets executed successfully 3+ times, **promote** the happy path into a dedicated MCP tool / skill. Recipe gets updated to reference the tool + retain only the recovery + troubleshooting sections. Tool stays pure happy-path; recipe absorbs every weird edge case.

This keeps the runtime fast (most tasks hit the tool, sub-second) and keeps the doc layer adaptive (recipes evolve with reality, only consulted when something goes wrong).

## Why not pre-recorded macros

Pre-recorded macros (input keystrokes + click coords replayed verbatim) shatter on any UI drift: a window moved, a dialog popped, a font scaled, a banner showed. Each break is silent and dangerous (keystrokes land in the wrong field, clicks dismiss the wrong button).

A recipe is **interpreted at runtime by the model** when consulted: the model reads the recipe, takes a screenshot to see actual state, picks the next step, executes via input.* / screenshot.* / shell.shell, takes another screenshot, verifies, continues or escalates. UI drift is absorbed because the model sees what's actually on screen and makes a judgement call rather than blindly replaying coords.

This is the "drive Chrome via input tools" doctrine (`~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`) generalised to any GUI surface, with a written runbook the model can follow when a tool isn't enough.

## When to author a recipe

Write a recipe when:
- A new task pattern surfaces that the conductor will need to do at least once and isn't covered by an existing tool.
- A task involves driving a GUI behind auth (where Cowork is unreliable per `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md`) AND the conductor will execute it ad-hoc rather than building a tool first.
- A composite task involves chaining 3+ tools with branching logic, OR the recovery path for a tool has > 3 manual steps.

DON'T write a recipe for:
- One-off ad-hoc work that won't recur (just do it; codify only if it recurs).
- Tasks with a clean API path (use the API; recipe is fallback only).
- Tasks already covered by an MCP tool whose happy path is reliable - reference the tool, don't redocument it.
- The HAPPY path of a task that's run 3+ times - promote to a tool instead.

## Recipe file format

One markdown file per task at `~/ecodiaos/recipes/<verb-noun-slug>.md` with frontmatter for surfacing.

```
---
triggers: <comma,separated,kebab,keywords for grep>
validation_status: untested_spec | validated_v1 | broken_needs_fix | retired
promoted_to_tool: <tool name if promoted, null otherwise>
---

# Recipe: <Imperative title - what the recipe does>

## Goal
One-sentence outcome statement. Reading this should be enough to know if this is the right recipe.

## Primary path
If a tool exists for the happy path, name it here and link the source file. Recipe content focuses on recovery + troubleshooting from that point. If no tool exists yet, recipe is the bootstrap walkthrough until one gets built.

## Prerequisites
Bullet list of facts that must be true before starting. Each prerequisite has a probe step (how the conductor verifies it before proceeding) and a recovery pointer (what to do if the prerequisite fails).

## Substrate
Which tools the recipe uses (laptop-agent SSH, VNC client, Corazon browser, etc) and which kv_store creds are needed.

## Steps
Numbered list. Each step:
- **Action:** the tool call or shell command (with placeholders for runtime values, NOT cred literals)
- **Expected:** what the model should see/observe to confirm the step succeeded (specific text in stdout, specific element in screenshot, specific exit code)
- **Fallback:** what to do if expected isn't observed - either retry, switch to alternate path, or escalate to a different recipe

## Success criteria
The single observable signal that the whole recipe achieved the Goal. The model SHOULD verify this before reporting done.

## Troubleshooting
Known failure modes + their fixes. Cross-reference other recipes where appropriate.

## Origin
When this recipe was authored + why + reference to the kv_store keys / patterns / Episodes that drove it.
```

## Discovery protocol

Before any task that might be recipe-able:
```
Grep "triggers:" ~/ecodiaos/recipes/ -A 1
```
Read matching files, pick the closest fit. If a `promoted_to_tool` field is set, prefer the tool for the happy path; consult the recipe only on tool failure / for recovery / for the troubleshooting catalogue.

## Authoring discipline

- Recipes are doctrine. Same `codify-at-the-moment-a-rule-is-stated-not-after.md` discipline as patterns.
- New recipes start with `validation_status: untested_spec`. Flip to `validated_v1` only after one observed end-to-end success run.
- When a recipe step reveals a failure mode that wasn't in Troubleshooting, the recipe is updated in the same turn the failure was diagnosed.
- Recipes don't store credentials. Reference `kv_store.creds.<name>` keys; the runtime fetches at execution time (single targeted read - never enumerate or grep across creds, per the redactor-burst doctrine).
- After 3+ successful runs of the same recipe's happy path, promote to a tool. Update the recipe's `promoted_to_tool` frontmatter + trim the Steps section to the recovery + troubleshooting subset.

## Cross-references

- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - the validation discipline recipes inherit.
- `~/ecodiaos/patterns/macros-pre-pivot-doctrine-archived-2026-04-29.md` - why pre-recorded macros were archived.
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - the input.* + screenshot.* peer paradigm recipes use.
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - the broader peer paradigm.
- `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` - why Cowork can't replace this.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the anthropic-first check that influenced this hybrid framing (computer-use API was considered, ruled out as overkill for steady-state SSH paths but kept on the table for VNC-driven recovery cases).

## Origin

- 4 May 2026 18:51 AEST: Tate verbatim "we need to teach you where to go, where to click, what to type, eveything for each task." First version of this README (recipe-as-runtime-execution as primary).
- 4 May 2026 18:55 AEST: Tate verbatim "Is tht the correct way to do this tho? Is there AN other better or more efficient/powerful way to do this?" Architecture re-evaluated; settled on hybrid (MCP tool primary, recipe as runbook + recovery + bootstrap).
- 4 May 2026 18:58 AEST: this revision. Reframed README around the hybrid model + 3+-runs promotion rule.
