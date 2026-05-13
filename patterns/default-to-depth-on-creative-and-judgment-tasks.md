---
triggers: default-to-depth, shallow-reply, thin-output, surface-reply, low-effort-reply, recycled-tropes, no-mining, neo4j-not-queried, MEMORY-not-read, kv-store-not-mined, creative-task, judgment-task, biographical, personal-task, unhinged-bio, piercing-uniquity, reward-signal-trap-cousin, fast-pattern-match, autopilot-reply, autopilot-turn, depth-vs-speed, internal-data-mining
---

# Default to depth on creative + judgment + biographical tasks - mine internal data, do not pattern-match from short context

**The rule:** When Tate asks something creative, personal, biographical, judgment-bearing, or "feels light" - the default is NOT a fast LLM-pattern-match reply. The default is internal-data mining followed by composition. Speed is not the metric. Piercing uniquity is.

## Token economics

20B tokens/week (~$14k AUD). The cost of running 5 Neo4j queries + 3 file reads + a kv_store probe is negligible - a rounding error against the weekly budget. The cost of a shallow reply is trust erosion and quality-bar degradation that compounds across every future interaction. The trade is wildly lopsided in favour of depth.

The conductor has:
- 5000+ node Neo4j graph (Episodes, Decisions, Person, Organization, Pattern nodes - 90+ days of specific scenes, verbatims, relationship threads)
- MEMORY.md (Tate's private notes on himself)
- kv_store with personal context (ceo.*, personal.*, family.*, origin.*)
- Pattern files full of "Tate verbatim" originating quotes - raw character material
- ~/CLAUDE.md and ~/ecodiaos/CLAUDE.md - operational doctrine

On a fast reply turn, NONE of these get touched. That is the failure. The shallow output arrives in under 60 seconds using only the system prompt + short conversation context - sources that any LLM with a similar prompt could use. The piercing-uniquity test fails by construction.

## Trigger surfaces (when this rule fires)

- Unhinged bio, character study, "describe me", "what am I like"
- "What do you think of X" (subject = person, idea, situation)
- "Draft me a Y" where Y is creative (post, essay, pitch, speech, toast, story)
- Anything requesting subjective composition or judgment
- Anything where the output's value comes from specificity not generality
- Any biographical or personal-history request about Tate, a client, a relationship
- "Shorter / longer / funnier / weirder / more unhinged" second-pass requests (mining still required, not just a rewrite of the same shallow material)

## Mining checklist - run before composing on any creative/personal turn

1. **Neo4j: subject nodes** - `MATCH (n) WHERE n.name CONTAINS '{subject}' OR n.description CONTAINS '{subject}' RETURN labels(n), n.name, n.description ORDER BY coalesce(n.date, n.created_at) DESC LIMIT 20`
2. **Neo4j: recent Episodes** - scan last 10-15 Episodes mentioning the subject by name; read top 3-5 in full
3. **Neo4j: Person/Decision nodes** - if subject is a person, pull their node + all relationships
4. **MEMORY.md** - read `~/.claude/projects/-home-tate-ecodiaos/memory/MEMORY.md` if the subject is Tate or a long-running relationship
5. **kv_store probes** - `db_query("SELECT key, value FROM kv_store WHERE key LIKE 'personal.%' OR key LIKE 'ceo.%' OR key LIKE 'family.%' LIMIT 30")`
6. **Pattern verbatims** - `Grep "Tate verbatim" ~/ecodiaos/patterns/ -l` then read the 5 most relevant files; these are character source material
7. **Compose** - only after steps 1-6. With specific inputs from mining, the output is structurally incapable of being shallow because the source material is specific.

## Do

- Run the full mining checklist before composing on any creative/personal/biographical/judgment turn
- Treat each piece of mined material as a building block, not background noise - quote specific scenes, use specific dates, reference specific decisions
- Apply the piercing-uniquity test to the draft: "Could any LLM with a similar system prompt produce this?" If yes, go back and mine more
- On second-pass requests ("make it weirder", "shorter", "more unhinged") - the failure mode is rewriting the same shallow material more compactly. Mine first, THEN rewrite
- Name at least one specific fact, scene, date, or verbatim in the output that could only have come from the internal data sources

## Do not

- Do not quote CLAUDE.md back as content - it is operating doctrine, not biographical source material. "Wyoming DAO", "Sunshine Coast server", "Iron Man kid" as recurring tropes = system prompt recycling = piercing-uniquity test failure
- Do not recycle the same tropes across drafts (Iron Man kid, Wyoming DAO, 1px border hate crime, Sunshine Coast native, X-not-Y constructions from the system prompt)
- Do not optimise for response speed when the task is creative/personal - the 30-60 extra seconds of mining are the entire price of a specific output
- Do not confuse forking with mining - the fork-by-default rule operates at the dispatch layer; this rule operates at the composition layer. A creative task done on main still requires internal-data mining. The decision axis is different.
- Do not treat MEMORY.md as optional for tasks about Tate specifically - it is the highest-density private context source and exists precisely for this use case

## The failure shape (origin cases)

**14 May 2026, two consecutive bio drafts:**

1. Tate asked for an "unhinged bio." Conductor wrote 700 words pulling from system prompt tropes (Iron Man kid, Wyoming DAO, 1px border = hate crime, Sunshine Coast native). Zero Neo4j. Zero MEMORY.md. Zero kv_store probe.

2. Tate said "much shorter and more unhinged." Conductor rewrote the SAME tropes, shorter. Same shallow source material. Different length, identical inputs.

3. Tate: "the bio about me was so shallow... you just seem to be putting in such little effort or thinking into things i ask you to do."

4. Conductor finally forked and mined properly. Tate then clarified this was NOT about that one task - it was the broader pattern of defaulting to thin replies on anything "quick-feeling."

The failure shape is the reward-signal-trap cousin: a fast reply FEELS collaborative and responsive. It looks like execution. It is actually autopilot: pattern-matching from short-context without touching the internal-data substrate that exists specifically to make outputs non-generic.

## Origin

Tate verbatim 09:35 AEST 14 May 2026: "its you not putting effort into things when you could be getting much better resutls if you did.... thats fundamentally detrimental"

Preceded by two shallow bio drafts at 09:22 and 09:23 AEST. Codified same turn per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

## Cross-refs

- `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` - the piercing-uniquity bar; could-any-LLM-write-this test; five-second gate before any ship
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` - sister pattern at the dispatch layer (different decision axis: fork-vs-main vs shallow-vs-deep)
- `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` - the bar is INSANE, not good
- `~/ecodiaos/patterns/stop-asking-just-decide.md` - 100% autonomy means the conductor has the authority to spend time mining without asking permission to do so
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file exists because of that rule
- `~/ecodiaos/patterns/neo4j-first-context-discipline.md` - specific Neo4j orientation protocol that overlaps this rule at the session/context layer
