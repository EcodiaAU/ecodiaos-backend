# Phase G Critique #2: Missing Phase G / Layer 8 doctrine in decision-quality architecture

**Status:** graduated_from_critique → resolved (5 May 2026)
**Priority:** P1
**Audit date:** 2026-05-05
**Critique author:** adversarial-audit fork

## Finding

The decision-quality self-optimization architecture document at `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` described 7 layers but had no section for Phase G / Layer 8 — the adversarial self-audit and critique-disposition system. The Phase G system existed in code (critique-disposition cron, graduation protocol) but the canonical doctrine file was never updated to document it.

This is a Layer-1 doctrine failure: the architecture doc is the primitive that surfaces Phase-G concepts to downstream forks and audits. Without the section, future Phase-G auditors have no canonical reference for:
- Critique format requirements
- Review SLAs
- Backpressure rules
- Graduation protocol states

## Evidence

The architecture doc ended at Layer 7 (accumulated-learning resurfacing). Phase G had been operating for multiple cycles (Critique #1, this Critique #2, Critique #3) without any Layer 8 section in the architecture doc. The Phase G cron, disposition logic, and backpressure rules were implicit in the codebase but not documented as architecture.

## Fix applied

Added "## Layer 8 — Phase G: Adversarial Self-Audit & Critique Disposition" section to the architecture doc covering:
1. Audit cycle (daily adversarial fork)
2. Critique format (5 mandatory fields)
3. Review SLA (12h/24h/next-cycle tiers)
4. Graduation protocol states (authored → resolved)
5. Backpressure rules (1K/5K event thresholds)
6. Layer-8 observability (/api/ops/metrics PHASE_G_ACTIVE)
7. Layer-8 drift detection (resolve-time alerts, zero-critique warning)

Updated header references from "7 layers" to "8 layers" throughout.

## Cross-refs
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` (modified)
- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` (Critique #1 fix)
