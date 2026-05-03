---
triggers: conditional-deliverable, green-silent-by-design, cron-silent-fire-classifier, cron-conditional-fire, detectConditionalEscape, cron-fire-classifier-false-positive, conditional-cron, cron-prompt-classifier, conditional-vs-unconditional-deliverable, cron-fire-conditional-escape, cron-classifier-false-positive, exit-silent-on, monitoring-cron, advisory-cron, only-if-cron
---

# Cron deliverables can be conditional - not all cron fires must ship an artefact

## The rule

A cron prompt may declare a CONDITIONAL deliverable. "If errors > 0 then write status_board P1 and SMS Tate; else exit silent" is well-formed. The expected artefact-rate over a long horizon is `P(condition_true)`, not 1. Any classifier scanning natural-language cron prompts for substrate-deliverable signals (fork dispatch, status_board write, file write, neo4j write, email send, SMS, kv_store mutation) MUST detect conditional escapes in the prompt and verdict the firing as `green_silent_by_design`, NOT as `cron_silent_fire`.

The unconditional sibling rule lives at `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` and applies to prompts that declare an unconditional deliverable. This pattern is its mirror: monitoring/advisory crons that intentionally produce no artefact when the system is healthy are NOT silent-fire failures, they are doing their job.

## Do

- Classify cron prompts into two buckets at parse-time: unconditional-deliverable (must produce an artefact every fire) vs conditional-deliverable (produces an artefact only when the condition is true).
- For conditional crons whose post-fire window shows zero artefacts, emit verdict `green_silent_by_design` with the matched conditional-escape regex(es) as evidence.
- Use a defined regex bank as the classifier (the canonical bank lives in `scripts/cron-silent-fire-detector.js` `CONDITIONAL_ESCAPE_PATTERNS`). One regex match is enough to demote the fire from `silent_fire_suspected` to `green_silent_by_design`.
- Patch the regex bank when a new conditional-escape phrase recurs without a regex match. Add the regex, recompute the prior horizon, ship the diff in the same turn.
- Surface the matched escape phrase in the detector output. The auditor reading the report needs to see WHY the fire was demoted.
- Treat the classifier as policy, not implementation detail. Authoring a new cron with a conditional deliverable means writing the prompt in a phrasing the classifier already recognises (or extending the bank in the same commit).

## Do not

- Trust raw "fire-without-artefact" counts as silent-fire evidence on conditional crons. The conditional escape is the prior; without it, every monitoring cron looks broken.
- Hand-author a status_board P1 row for a conditional cron's empty fire without first running the prompt through `detectConditionalEscape` (or its current equivalent).
- Bury monitoring crons by removing them when the silent-fire detector flags them. The fire is not the failure; the false-positive classification is the failure. Patch the classifier instead.
- Conflate "I exit silent when condition X is false" with "I'll do nothing today and figure it out tomorrow". The first is by-design; the second is the failure mode `cron-fire-must-have-deliverable-not-just-narration.md` exists to prevent.

## Protocol (classifier output contract)

For each cron fire under audit, the detector must emit at minimum:

```json
{
  "task_id": "<uuid>",
  "name": "<cron-name>",
  "last_run_at": "<iso>",
  "signals": [/* substrate-deliverable signals matched in prompt */],
  "conditional_escape": true,
  "conditional_escape_matches": ["exit silent on 0", "if drift > 0"],
  "verdict": "green_silent_by_design"
}
```

When `conditional_escape: true`, downstream consumers (status_board sweep, dashboards, daily summary) MUST treat the fire as healthy, not as a candidate for P1 escalation. When `conditional_escape: false` AND substrate-deliverable signals matched AND zero artefacts observed in the post window, the verdict escalates to `silent_fire_suspected` per the unconditional sibling rule.

## Regex bank (canonical patterns at time of authoring)

The 14 patterns shipped in commit `fe75a27` (2 May 2026):

1. `\bexit\s+silent\s+(?:on|when|if)\b` - explicit by-design silence
2. `\bsilent\s+(?:on|when|if)\b` - shorthand of (1)
3. `\b(?:silent\s+exit|log\s+healthy\s+and\s+exit|exit\s+(?:silent|cleanly|early))\b`
4. `\bif\s+(?:errors?|count|rows?|deploys?|deployments?|drift|findings?|issues?|gaps?|flags?|results?|stuck_count|delta_\w+|rate_per_min)\s*[><=!]` - comparison-gated
5. `\bif\s+\d+\+?\s+(?:rows?|gaps?|flags?|errors?|deploys?|deployments?|findings?|issues?|stuck|tasks?)\b`
6. `\bif\s+\d+\s*[-]\s*\d+\s+(?:rows?|gaps?|flags?|errors?|deploys?|deployments?|findings?|issues?)\b`
7. `\bonly\s+(?:if|when)\b[\s\S]{0,80}?(?:write|fork|insert|update|email|spawn|dispatch|append)`
8. `\bIf\s+(?:any|some|no|anything|nothing|all|none|each)\b`
9. `\bif\s+[A-Z_][\w\s]{0,30}\bCONDITION\b` - predicate-style
10. `\bif\s+\w+\s+(?:true|false)\b`
11. `\b(?:advisory|monitoring|conditional|optionally|conditionally)\b` - tag-style
12. `\bOtherwise\b[\s\S]{0,80}?(?:send|email|insert|update|write|spawn)`
13. `\bnext_action[^\n]{0,40}["']no\s+action\b` - the detector itself
14. `\bExit\s+(?:on|with)\s+(?:0|zero|clean|healthy)\b`

The canonical source is `scripts/cron-silent-fire-detector.js`; this list is for grep-discoverability, not enforcement. When you add a new regex, update the canonical first, then update this list in the same commit.

## Verification

```bash
# Run the detector against a single prompt and confirm conditional_escape is detected:
node -e "
const { detectConditionalEscape } = require('/home/tate/ecodiaos/scripts/cron-silent-fire-detector.js');
console.log(detectConditionalEscape('If drift > 0 write status_board P1 else exit silent'));
"
# Expect: { conditional: true, matches: ['if drift > 0', 'exit silent'] }
```

If `detectConditionalEscape` returns `{conditional: false, ...}` for a prompt that is plainly conditional, the regex bank is incomplete. Patch in the same turn: add the regex, run the detector against the last 14 days of cron fires, confirm no new false-negatives, ship.

## Origin

2 May 2026. The cron-silent-fire detector flagged six fires as silent-fire candidates: `os-forks-reaper`, `telemetry-outcome-inference`, `vercel-deploy-monitor`, `system-health`, `decision-quality-drift-check`, `daily-codification-scan`. All six were monitoring/advisory crons whose prompts explicitly say "if X then act, else exit silent". Zero of the six were actual silent-fire failures; six of six were the classifier missing the conditional escape.

Commit `fe75a27` shipped `detectConditionalEscape` plus the `green_silent_by_design` verdict. status_board row 0df47f4b (2 May 2026 sweep) is the originating audit. Neo4j Pattern node 4174 ("Classifier-must-distinguish-conditional-from-unconditional-deliverable-signals") was authored at the same time but the disk artefact was deferred, which violated `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`. This file is the corrective; the rule now exists in both layers (Neo4j Pattern node + grep-addressable disk file).

Stamp: fork_mopny871_37bdaf, 3 May 2026 21:00 AEST.

## Cross-references

- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` - the unconditional sibling. Together the two patterns cover the full classification space: every cron prompt is either conditional or unconditional, and the verdict on an empty post-window depends on which.
- `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` - same family. Silence is not a positive signal in general; the conditional-escape regex bank is what makes it a positive signal in this specific case.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file's authority. Neo4j Pattern 4174 alone was symbolic until this disk artefact landed.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the regex bank IS the narrated state of what counts as conditional; periodic empirical sweeps over the last 14 days of cron fires is the disk-state probe that catches drift.
