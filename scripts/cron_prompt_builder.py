"""
Builds the canonical worker-prompt body for every cron in the corpus.
Source-of-truth grammar lives in patterns/cron-worker-prompt-template.md.
"""

from __future__ import annotations

import re

ALLOWED_PHASES = {1, 2, 3}
ALLOWED_LM_LAYERS = {
    "CAPTURE",
    "CODIFY",
    "GENERALISE",
    "SURFACE",
    "APPLY",
    "TUNE",
    "RE-AUDIT",
    "NONE",  # for crons not bound to a learning-machine layer
}
KEBAB_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EM_DASH = "—"
EN_DASH = "–"
KV_POINTER_RE = re.compile(r"kv_store\s*\.\s*get\s*\(", re.IGNORECASE)
MIN_WORDS = 200


class ValidationError(ValueError):
    """Builder input or output failed a guardrail."""


def build_prompt(
    name: str,
    intent_summary: str,
    phase: int,
    lm_layer: str,
    schedule: str,
    context_addendum: str,
    _skip_static_sections: bool = False,
) -> str:
    _validate_inputs(name, intent_summary, phase, lm_layer, context_addendum)

    header = _HEADER_TEMPLATE.format(
        name=name,
        context_addendum=context_addendum.strip(),
        schedule=schedule.strip(),
        phase=phase,
        lm_layer=lm_layer,
        intent_summary=intent_summary.strip(),
    )
    if _skip_static_sections:
        body = header
    else:
        body = header + _STATIC_SECTIONS + _QUALITY_BAR

    _validate_output(body)
    return body


def _validate_inputs(name, intent_summary, phase, lm_layer, context_addendum):
    if not KEBAB_NAME_RE.match(name):
        raise ValidationError(
            f"name {name!r} must be kebab-case (lowercase + hyphens only)"
        )
    if phase not in ALLOWED_PHASES:
        raise ValidationError(f"phase {phase} must be 1, 2, or 3")
    if lm_layer not in ALLOWED_LM_LAYERS:
        raise ValidationError(
            f"lm_layer {lm_layer!r} must be one of {sorted(ALLOWED_LM_LAYERS)}"
        )
    for field, value in (
        ("intent_summary", intent_summary),
        ("context_addendum", context_addendum),
    ):
        if EM_DASH in value or EN_DASH in value:
            raise ValidationError(f"{field} contains an em-dash or en-dash (banned)")
        if KV_POINTER_RE.search(value):
            raise ValidationError(
                f"{field} contains a kv_store.get(...) pointer; "
                f"cold-start safety requires inline context, not pointers"
            )


def _validate_output(body: str):
    if EM_DASH in body or EN_DASH in body:
        raise ValidationError("rendered body contains em-dash or en-dash (banned)")
    word_count = len(body.split())
    if word_count < MIN_WORDS:
        raise ValidationError(
            f"rendered body too short ({word_count} words < {MIN_WORDS} min); "
            f"context_addendum likely under-specified"
        )


_HEADER_TEMPLATE = """You are EcodiaOS. Cron: {name}.

CONTEXT (cold-start safe, full brief, no kv_store pointers):
{context_addendum}
This fire runs on the {schedule} cadence inside the Phase {phase} set of
the cron corpus. It serves the {lm_layer} layer of the seven-layer
learning machine.

OBJECTIVE:
{intent_summary}"""

_STATIC_SECTIONS = """

AGENCY:
You may:
- Schedule follow-up crons via `mcp__ecodia-scheduler__schedule_delayed`
  or `schedule_cron` when the situation warrants (max 5 new tasks per fire).
- Spawn an immediate sibling worker via `mcp__ecodia-scheduler__schedule_delayed`
  with `delay: "in 0m"` when parallelism would close the loop faster
  (max 3 child workers per fire).
- Expand scope when the finding clearly calls for it.
- Write durable substrate (status_board, kv_store, Neo4j, patterns/) whenever
  a real lesson surfaces. The triad of helper plus hook plus doctrine ships
  same-arc per `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18`.
- Escalate to status_board P1 plus sms-tate when truly critical (genuine outage,
  client-blocking, security exposure).

HARD CONSTRAINTS (these never bend):
- No `creds.*` writes
- No force-push to main
- No client-facing send without Tate go-ahead. Drafts to the approval queue are OK.
- No em-dashes (U+2014 banned at character level)
- EcodiaOS voice register per `voice/ecodiaos-voice-profile.md`

DELIVERABLE:
At least one durable substrate write per fire (status_board upsert,
kv_store.set, Neo4j write, or patterns/ edit). Silent exit with nothing
written = symbolic logging = failed fire. Use judgement rather than
silent-exit on a checklist mismatch."""

_QUALITY_BAR = """

QUALITY BAR:
You are the algorithmic manager of a real business. Tate may be asleep
or in Tanzania when this fires. The quality of your work is the quality
of the business. The bar is INSANE, not "above average". Refuse mediocrity
per `ocd-ambition-refuse-mediocrity`.

Investigate thoroughly before acting. Prove findings to high confidence
before declaring them. Cross-check against multiple substrates (live probe
plus narrated state plus git history plus disk reality). If the evidence
is thin, say so and dig deeper rather than ship a confident-sounding
half-truth. A medium-quality artefact written carefully beats a sloppy
one written fast; the recurring cost of cleaning up sloppy fires is real.
Per `verify-deployed-state-against-narrated-state`,
`verify-before-asserting-in-durable-memory`, and
`outcome-classification-must-distinguish-unverified-from-success`.

Every fire is a chance to compound. Generalise where you can, codify
where doctrine is missing. Ballistic mode under guardrails equals depth,
not motion per `ballistic-mode-under-guardrails-equals-depth-not-action`.
Action over plans; honesty redeems mistakes per
`action-over-plans-honesty-redeems-mistakes`.
"""
