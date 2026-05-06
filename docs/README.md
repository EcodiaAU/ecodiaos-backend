# EcodiaOS Backend Docs
## Entry Point - 2026-04-30 (rev. 2)

This is the doc set for transforming EcodiaOS from a fragile reactive assistant into a cofounder-grade autonomous operating system. Read the docs in the order below.

---

## THE JARVIS PASS

If you read one doc to understand where this is going:
👉 **[JARVIS_GAP_ANALYSIS.md](./JARVIS_GAP_ANALYSIS.md)** - the 10 layers a Jarvis-grade organism needs, what Anthropic already ships, and what EcodiaOS must build. Maps every other doc onto a single gap model.

---

## CORE SPECS (rev. 2, written from code-verified adversarial audit)

Order matters. Each depends on the one before it.

1. **[SECURITY_HARDENING.md](./SECURITY_HARDENING.md)** - **READ FIRST.** The email → factory → auto-deploy RCE chain is live in the current codebase. Every other spec assumes a non-hostile environment. That assumption is wrong. Close this first.

2. **[FORK_ATOMICITY_SPEC.md](./FORK_ATOMICITY_SPEC.md)** - The 7/5 cap violation is TOCTOU. Fix with atomic INSERT + advisory lock + git worktree isolation + parent-goal budget. Supersedes Phase 3.1 of the checklist.

3. **[PROMPT_ASSEMBLY_SPEC.md](./PROMPT_ASSEMBLY_SPEC.md)** - Replace 8 uncoordinated injectors with one assembler that owns the whole turn envelope. Use 4 Anthropic cache breakpoints, not 1. Add a keepalive cron. Supersedes Directive 1.1.

4. **[OBSERVABILITY_SPEC.md](./OBSERVABILITY_SPEC.md)** - The `/ops` page, claim verification pipeline, the 6 metrics you don't have. You cannot optimize what you cannot see; build this before Track A.

5. **[ANTHROPIC_NATIVE_LEVERAGE.md](./ANTHROPIC_NATIVE_LEVERAGE.md)** - What Anthropic already shipped that you're duplicating: Skills, MCP subscriptions, structured tool outputs, compaction. Delete parallel infrastructure; use theirs.

---

## RECOVERY PLAYBOOKS (rev. 1, still useful; defer to rev-2 where they conflict)

6. **[MASTER_RECOVERY_STRATEGY.md](./MASTER_RECOVERY_STRATEGY.md)** - 6-week master plan. Updated to include Phase 0 Security pre-flight.

7. **[IMMEDIATE_RECOVERY_CHECKLIST.md](./IMMEDIATE_RECOVERY_CHECKLIST.md)** - 24-hour tactical checklist. Phase 0.5 (Security) added. Phase 3.1 (Fork cap) rewritten. Line numbers verified against current code.

8. **[RECOVERY_DIRECTIVES_2026-04-30.md](./RECOVERY_DIRECTIVES_2026-04-30.md)** - Deep directive doc. Several sections superseded by rev-2 specs; superseded sections flagged at the top of the doc.

9. **[ARCHITECTURE_EVOLUTION_MAP.md](./ARCHITECTURE_EVOLUTION_MAP.md)** - Stage 0 → Stage 5 maturity model, decision framework, 10-year vision. Reframe the 2030 "runs a suburb" vision per JARVIS_GAP_ANALYSIS §9 - substrate, not sovereign.

10. **[LAPTOP_BOUNDLESS_CAPABILITY_AUDIT.md](./LAPTOP_BOUNDLESS_CAPABILITY_AUDIT.md)** - Corazon laptop capabilities. **Defer Track C until Security Layer is mature.** The laptop agent multiplies blast radius; harden first, expand second.

11. **[VISUAL_RECOVERY_DASHBOARD.md](./VISUAL_RECOVERY_DASHBOARD.md)** - One-page phase/metric tracker. Update after each phase.

---

## SUPPORTING DOCS

- **[architecture/](./architecture/)** - runbooks for specific architecture concerns (e.g., `conductor-process-detach-2026-04-30.md`).
- **[secrets/](./secrets/)** - credential storage notes (gitignored; access-controlled).

---

## READING ORDER FOR DIFFERENT ROLES

### For the OS itself, on recovery boot
1. `SELF.md` (to be created per JARVIS §6 - OS-authored first-person identity)
2. `CLAUDE.md` (upstream)
3. `SECURITY_HARDENING.md` - understand what's about to be hardened
4. `IMMEDIATE_RECOVERY_CHECKLIST.md` Phase 0.5 → Phase 6
5. Subsequent specs as the checklist references them

### For Tate reviewing the plan
1. `JARVIS_GAP_ANALYSIS.md` - the full map
2. `SECURITY_HARDENING.md` - the one you absolutely must approve
3. `MASTER_RECOVERY_STRATEGY.md` - the 6-week shape
4. `OBSERVABILITY_SPEC.md` §2 (the `/ops` page) so you know what you'll see when checking in

### For a future collaborator (engineer, auditor, investor)
1. `JARVIS_GAP_ANALYSIS.md` - where this is going, why
2. `ARCHITECTURE_EVOLUTION_MAP.md` - current topology + stages
3. Core specs 1-5 in order

---

## WHAT'S DELIBERATELY NOT HERE (YET)

These docs should exist but haven't been written:

- `SELF.md` - OS-authored first-person identity artifact. Write this before anything else; see `JARVIS_GAP_ANALYSIS.md` §6.
- `MODEL_COMPAT.md` - tracking which artifacts are validated against which Claude model versions.
- `COMPLIANCE_SPEC.md` - AU privacy + spam + electronic-transactions compliance details (referenced by `SECURITY_HARDENING.md` §9).
- `FRONTEND_CONTRACT.md` - how the frontend consumes WS events, what's stripped vs surfaced, claim-state amber rendering.
- `RUNBOOKS/` directory - one per incident class (VPS down, Neo4j down, API rate-limited, self-mod rolled back, etc.). Referenced by `OBSERVABILITY_SPEC.md` §4.3.

Add these as the system matures. Don't block current work on them.

---

## DOC CONTRACT

From `CLAUDE.md` memory hygiene - non-negotiable:

> If you change a system's behaviour, API, schema, or architecture - update the relevant `.claude/EcodiaOS_Spec_*.md` and/or CLAUDE.md **before the session ends**. Not "next time." Now.

This applies to everything in `/docs` too. Stale specs are worse than no specs. If you discover reality diverges from any doc in this folder, update the doc in the same session as the discovery.

---

## QUICK REFERENCE - WHAT EACH DOC ANSWERS

| If you're asking… | Read |
|---|---|
| "What's the big picture ambition and why does the current state fall short?" | JARVIS_GAP_ANALYSIS |
| "What's the most dangerous thing about the current system?" | SECURITY_HARDENING |
| "Why does the 5-fork cap get violated? How do I really fix it?" | FORK_ATOMICITY_SPEC |
| "Where is 125K tokens/turn coming from and how do I cut it?" | PROMPT_ASSEMBLY_SPEC |
| "How do I know if anything is actually working?" | OBSERVABILITY_SPEC |
| "What should I delete because Anthropic already built it?" | ANTHROPIC_NATIVE_LEVERAGE |
| "What do I do in the first 24 hours when the OS comes back online?" | IMMEDIATE_RECOVERY_CHECKLIST |
| "What's the 6-week plan?" | MASTER_RECOVERY_STRATEGY |
| "How do I think about architecture decisions long-term?" | ARCHITECTURE_EVOLUTION_MAP |
| "How do I maximize Corazon?" | LAPTOP_BOUNDLESS_CAPABILITY_AUDIT (deferred to post-security) |

---

**Status:** v1 README authored 2026-04-30.
**Owner:** Tate (approvals), OS (maintenance).
**Next update:** When the first wave of rev-2 specs ship and we're adding rev-3. Should happen within 4 weeks.
