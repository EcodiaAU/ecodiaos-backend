# Anti-generalisation probes from the 2026-06-09 sunday-doctrine-synthesis fire

Authored 2026-06-09 17:50 AEST by the consolidated sunday-doctrine-synthesis cron worker (task 31450328).

Anti-generalisation is the inverse of generalisation. It walks general-form patterns and probes whether they are over-broad: firing on cases they should not, with low signal-to-noise.

Two signals available this fire:
1. Pattern citation count from the 7d session transcripts (104 sessions, 6.1 MB).
2. Pattern surfacing count from dispatch-events.jsonl (32h window). Constrained by the recorder-undercount finding documented today.

## Candidate: route-around-block-means-fix-this-turn-not-log-for-later

Citation count 7d: 4 references in transcripts. Surface count 32h: 10 events in dispatch-events. The surfacing rate is roughly 7.5x the citation rate, which suggests the pattern fires often but rarely changes behaviour. The triggers include bare common words "blocked", "broken" which co-occur in countless contexts without the route-around question being live.

Probe outcome: triggers should be tightened. Specifically the bare "blocked" and "broken" tokens should require a compound qualifier: "tool blocked", "deployment broken", "pipeline blocked", or the more specific "tool unavailable" already in the trigger set. The bare forms cast too wide a net.

Confidence: medium. The 7.5x surface-to-citation ratio is suggestive but the recorder-undercount finding means surface counts are only reliable for the two emitting hooks (cred-mention-surface and status-board-write-surface). The 10 surfaces here are from status-board-write-surface, which fires on a different upstream than the others.

Action: defer the narrowing until the recorder-coverage fix lands. Re-probe in the next sunday-doctrine-synthesis fire.

## Candidate: verify-deployed-state-against-narrated-state

Citation count 7d: 45 references. Heavy load-bearing. Triggers list is large (35 entries) and many are specific compound phrases. No probe outcome.

Confidence: high that this is working as intended. The high citation rate combined with specific compound triggers indicates the breadth is earned, not overzealous.

## Candidate: knowledge-architecture-lookup-first-and-claim-binding-2026-06-09

Citation count 7d: 24 references. Authored 2026-06-09 same week. Too fresh to anti-generalise. Re-probe in the next fire.

## Verdict

One soft narrowing candidate identified (route-around-block triggers). No archival candidates. The substrate undercount means most anti-generalisation work needs to wait for the python-hook emit fix.
