---
triggers: cowork-is-tool-not-brain, cowork-not-peer-brain, conductor-stays-in-loop, cowork-bounded-step-instruct, cowork-not-autonomous, cowork-screenshot-and-decide, who-is-the-brain, conductor-brain-cowork-hands, cowork-substrate-clarifier, gui-tool-not-agent-substrate
priority: critical
canonical: true
---

> **DEPRECATED — 5 May 2026.** Tate has negated Claude Cowork as a UI-driving substrate. The canonical replacement is Tailscale laptop-agent (Corazon's `input.*` + `screenshot.*` + `shell.shell` through the laptop-agent HTTP API) + macro/GUI recipes. See `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`.

# [DEPRECATED] Cowork is a GUI tool, not a peer brain - the conductor stays in the loop

## 1. The rule

Cowork (Anthropic Claude Desktop with Dispatch toggle + Chrome/computer-use) is a GUI-driving TOOL the conductor picks up. It is NOT a peer brain. The conductor (EcodiaOS on main, with the full MCP tool surface) does the thinking, decides what to do, instructs Cowork in BOUNDED STEPS, screenshots the result, decides the next step, and carries the loop. Cowork executes the bounded UI action. The conductor remains the source of judgement, plan, and durable state.

The "1stop shop for UI-driving tasks" doctrine (`~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`) is correct - Cowork IS the default substrate for web SaaS UI driving. AND Cowork is just a tool, not a peer agent. Both are true. The "1stop shop" claim is about WHICH tool to use; this pattern is about HOW Cowork relates to the conductor.

## 2. Why this matters

Reading the 1stop-shop block in isolation can lead a future session to over-trust Cowork as an autonomous substrate ("Cowork already has the page accessibility tree, Anthropic's agentic capability shipped, and Tate's signed-in browser session - all four facets a hand-rolled loop would only partially have"). Without this clarifier, the conductor may (a) hand off entire workflows to Cowork without bounded-step decomposition, (b) skip mid-loop screenshots and verify steps, (c) defer judgement to Cowork on what to do next when it stalls, (d) treat Cowork dispatch as fire-and-forget when it is in fact instruct-screenshot-decide-instruct. Each of those collapses the conductor's job into the tool's job and surrenders durable-state ownership.

## 3. What "the conductor stays in the loop" means in practice

For every Cowork dispatch:

1. **Conductor decides the bounded step.** "Navigate to vercel.com/dashboard, screenshot the deployments list" - one step, observable result.
2. **Conductor instructs Cowork via `cowork-dispatch step "<bounded-step>" --wait=N`** (the helper script under `~/ecodiaos/scripts/cowork-dispatch`).
3. **Conductor reads the screenshot.** Visual interpretation of `/tmp/cowork-<sub>-<ts>.png` is the conductor's job - the helper does NOT interpret.
4. **Conductor decides the next bounded step** based on what it sees.
5. **Conductor maintains durable state** across the loop - status_board updates, kv_store writes, Neo4j Decisions. Cowork has no persistent state across dispatches; the conductor is the memory.

The Cowork dispatch is one tool call inside the conductor's turn, not an autonomous sub-agent that owns the workflow.

## 4. Do

- Decompose any UI task into bounded steps the conductor can decide between.
- Screenshot after every step. The screenshot is the truth, not Cowork's narration.
- Keep the conductor's judgement loop closed - read, decide, instruct, read.
- Hold durable state (status_board, kv_store, Neo4j) on the conductor side, not implicitly inside Cowork's session.
- Treat Cowork like `input.*` + `screenshot.*` with a smarter wrapper, not like a fork.

## 5. Do NOT

- Hand Cowork a multi-step "do the whole thing" instruction and walk away.
- Skip the screenshot-verify step because Cowork "said it was done."
- Defer judgement to Cowork on what to do next when it stalls or asks a question.
- Treat Cowork dispatch as fire-and-forget. It is instruct-screenshot-decide-instruct.
- Frame Cowork as a "peer agent" in any doctrine - it is a tool the conductor uses.

## 6. Cross-references

- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` - which TOOL to use for web UI driving (Cowork wins for logged-in SaaS UIs).
- `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md` - the 6-step pre-dispatch checklist the conductor runs before any Cowork dispatch.
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` - Step 0 of the pre-dispatch checklist.
- `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md` - when Cowork hits a credential gate, the conductor injects the secret; Cowork does not own the credential path.
- `~/ecodiaos/patterns/conductor-cowork-duo-roles-and-handoffs.md` - the "duo" framing this pattern qualifies; read the duo doc and THIS doc together.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - the meta-rule that says use Anthropic-shipped capability (Cowork's computer-use) instead of building a parallel runtime - which is WHY Cowork is the default tool, but the conductor is still the brain.

## 7. Origin

30 Apr 2026 15:55 AEST. Tate-direct doctrine clarification during the autonomous-pilot window: Cowork is just a tool, not a peer brain. The conductor stays in the loop. Subsequent claude-md-cleanup audit (item C2.1) flagged that the 1stop-shop doctrine in CLAUDE.md without this qualifier risked over-trust in Cowork's autonomy. Authored by fork_mol5vy5w_250614 on 30 Apr 2026 evening as part of the ambient-OS cleanup-night Wave-1 ship pass; CLAUDE.md cross-references to be added in the next coordinator fire. (Pattern was referenced but not on disk per disk-vs-narration audit; this file closes the ghost.)
