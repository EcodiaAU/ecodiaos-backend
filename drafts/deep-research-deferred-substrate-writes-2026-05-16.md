# Deferred Substrate Writes - Deep Research Cron 2026-05-16

**From:** deep-research cron (remote CC session)
**To:** main conductor
**Reason:** ecodia-core and ecodia-graph MCP servers require re-authorization in this remote session environment. Token expired.

Research file is committed and pushed to `claude/happy-hopper-eUZsM`:
`research/ai-run-businesses-2026-05-16.md` (205 lines, full synthesis)

## Three writes needed on main conductor:

### 1. Neo4j Episode Node

```
graph_merge_node or neo4j_write_episode:
  label: Episode
  name: "deep-research 2026-05-16 AEST - AI-run businesses"
  type: cowork_realisation
  description: [read full content from research/ai-run-businesses-2026-05-16.md]
  topic: "D - AI-run businesses: zero-person/minimal-human models, Polsia case study, AU legal posture, eval debt risk"
  key_findings: "Polsia $6.3M ARR 1 human 5943 companies. AU has no AI Act through 2026. Eval debt is primary internal risk. Institutional knowledge compounding is the moat."
```

Link via RELATED_TO edges to existing Strategic_Direction nodes for:
- AI-run business model / OS architecture
- Co-Exist / conservation tech
- Ecodia commercial positioning

### 2. kv_store Update

```
kv_store_set:
  key: ceo.last_deep_research
  value: {
    timestamp: "2026-05-16T AEST",
    topic: "D - AI-run businesses",
    research_file: "research/ai-run-businesses-2026-05-16.md",
    branch: "claude/happy-hopper-eUZsM"
  }
```

### 3. Status Board Row (Opportunity)

```sql
INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context)
VALUES (
  'opportunity',
  'Research-surfaced: vertical-Polsia for conservation/Landcare NGO ops',
  'idea - needs scoping',
  'Assess whether Landcare Australia (~6000 member groups) operational pain maps to AI-agent orchestration. Polsia model applied to NGO vertical.',
  'tate',
  3,
  'Sourced from deep-research cron 2026-05-16. Polsia runs 5943 companies with 1 human + Claude Opus. Conservation NGOs have similar operational pain (volunteer coordination, grants, reporting, events). Sub-commercial market aligns with Co-Exist thesis. See research/ai-run-businesses-2026-05-16.md for full context.'
);
```

## Summary of Research (for conductor context without reading the file)

**Topic:** Who is running businesses primarily via AI in 2026, at what scale, with what legal exposure.

**Headline finding:** Polsia (Ben Broca, solo) runs 5,943 companies via Claude Opus + Agent SDK at $6.3M ARR with $800/month cost. This is the closest external analog to EcodiaOS. The 80/20 split (AI handles 80% execution, human retains 20% strategic) is the empirically validated model across all successful deployments.

**Australia:** No standalone AI Act. National AI Plan (Dec 2025) pursues voluntary compliance. Privacy Act amendments from Dec 2026 require disclosure of automated decision-making. Ecodia's current structure (Tate as director, AI as operator) is legally sound under Corporations Act.

**Internal risk:** Eval debt - quality gate erosion over time without anyone noticing. 47% of stalled AI programs had no automated eval at month 12. Ecodia's factory quality gates are the mitigation; need to ensure they're not being bypassed under time pressure.

**Moat:** Institutional knowledge compounding. Only activates if factory learnings are being queried at dispatch time (worth auditing).
