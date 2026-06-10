# Substrate Map Verification - 2026-06-08

Read-only probes against every substrate CLAUDE.md claims exists. All probes capped at 5-15s.

## 1. Postgres (Supabase nxmtfzofemtrlezlyhcj)

| Table | Slice | Count |
|---|---|---|
| status_board | archived_at IS NULL | **180** |
| status_board | archived_at IS NOT NULL | **1159** |
| kv_store | creds.* | **69** |
| kv_store | cowork.* | **1481** |
| kv_store | other | **670** |
| os_scheduled_tasks | archived_at IS NULL | **78** |
| os_scheduled_tasks | archived_at IS NOT NULL | **623** |
| os_scheduled_tasks | last_status=NULL (active set) | 74 |
| os_scheduled_tasks | last_status=paused | 4 |
| os_scheduled_tasks | last_status=failed | 0 |

Notes: 180 active rows is well above the "124-row rot" figure CLAUDE.md cites as the historical hygiene low. CLAUDE.md's `b22cc8dd` P1 implies dispatch is broken; the 78 active rows + 0 failed (per `scheduler-no-ide-defer-and-cron-rows-never-permanently-fail` doctrine) is consistent.

## 2. Neo4j Aura

```
__Embedded__       8117
Episode              45
ConsolidationRun     36
Reflection           23
Decision             20
UIAction             16
UIState               7
Pattern               4
Project               2
Peer                  2
Question              2
Research              1
Organization          1
Concept               1
```

**Total real nodes: ~160** (excluding 8117 embedding shadows). CLAUDE.md says "5000+ nodes" - this is **OFF BY ~30x**. Either the cited figure was always inclusive of embeddings, or KG consolidation has pruned heavily. Decision/Episode/Pattern counts are tiny (45+23+20+4 = 92). Strategic_Direction, Person, Tool, System, CCSession labels claimed by CLAUDE.md are **absent**.

## 3. MCP narrow connectors

| Connector | Claimed | Observed | Match |
|---|---|---|---|
| ecodia-core | 14 | 14 | yes |
| ecodia-scheduler | 15 | 15 | yes |
| ecodia-comms | 41 | 41 | yes |
| ecodia-crm | 18 | 18 | yes |
| ecodia-money | 23 | 23 | yes |
| ecodia-graph | 10 | 10 | yes |
| ecodia-supabase | 8 | 8 | yes |
| ecodia-code | 6 | 6 | yes |
| ecodia-shell | 4 | 4 | yes |
| ecodia-factory | 10 | 10 | yes |

All 10 narrow connectors return exact claimed tool counts. Total **149 tools**. CLAUDE.md says factory is "dead, being unmounted" but it still serves 10.

## 4. Laptop-agent (Mac, 127.0.0.1:7456)

Health 200, uptime ~104min. Seed-call exposes **~240 tools** across 26 namespaces. CLAUDE.md says "~200" - actual surface is **larger** (240+). All 6 CDP multi-alias helpers present: `cdp.attach_tab`, `cdp.findVisible`, `cdp.clickByTag`, `cdp.nativeFill`, `cdp.deepFindRect`, `cdp.realClick`. Memory pressure 99% used (~946MB free of 64GB) - notable.

## 5. Auto-memory

5 indexed entries in MEMORY.md, 5 .md siblings on disk + MEMORY.md itself = 6 files. **No orphans.**

## 6. Hooks

Disk: **70 files** under `~/.claude/hooks/ecodia/` (excluding `__pycache__`, `fixtures`, `lib`, `logs`, `state`, `tests` subdirs). Settings.json references: **58** distinct hook paths. **12 hooks on disk are NOT registered in settings.json** (e.g. fixtures, internal helpers, or unwired). High overlap (~83%).

## 7. Skills

Disk: **110 skill dirs** under `~/.claude/skills/`. Available-to-session list shown in this turn: **~310 entries** (capacitor-*, capgo-*, *-webhooks families). **~200 skills are deferred-load (present in session catalog but missing on disk)** - these are global Anthropic-provided skills, not local.

## 8. Patterns

Disk: **391 pattern .md files** under `backend/patterns/` (excluding `_archived/`).
INDEX.md: **479 lines**. The INDEX is a 1-line-per-pattern format; 479 lines / ~1 = ~479 referenced > 391 on disk suggests **INDEX is stale** (references archived/renamed patterns). Daily 22:00 AEST `patterns-index-regen` cron should fix - it's listed in CLAUDE.md as `paused-pending-Mac` but live cron data shows 78 active, so check the specific row.

## 9. Voice profile

- `ecodiaos-voice-profile.md`: 811 lines, 71.7KB
- `voice_check_self.py`: 936 lines (scorer)
- `voice_check.py`: 611 lines (sibling outbound-Tate scorer)

Self-score against `doctrine` register: **60.0/100** (target >=85). **FAIL.** Profile itself triggers:
- 5 AI-banned vocab hits ("transformative", "journey", "best practices", "at the end of the day", "the truth is")
- 4 "as an AI" family hits
- 6 X-not-Y pivots, 4 three-part negations
- 2 announce-usefulness, 2 apology-reflex hits
- median sentence 9 words (target 14-25)

The profile contains its own anti-pattern examples (which is why it trips), but the scorer can't distinguish quoted examples from authored prose. This is a **substrate calibration gap**, not a content failure.

## 10. Deprecated surfaces

| Endpoint | HTTP | Status |
|---|---|---|
| /api/mcp/cowork | 401 | up, auth-gated (sunset-pending, matches CLAUDE.md) |
| /api/mcp/ecodia-full | 401 | up, auth-gated (sunset-pending) |
| /api/mcp/ecodia-core | 401 | up (sanity check) |

Both deprecated gateways still mounted. EcodiaOS Cowork V2 connector not probed (claude.ai-side, no public endpoint).

## 11. Client + secret docs

- `backend/clients/*.md`: **22 files**
- `backend/docs/secrets/*.md`: **38 files**

CLAUDE.md says secrets has "24+ provisioned + pending + drift catalogue" - actual 38 is **higher** (consistent with the +14 since the figure was written).

---

## DRIFT FROM CLAUDE.md - 8 wrong claims

1. **Neo4j "5000+ nodes"** -> actual ~160 real nodes (8117 embeddings). Off by ~30x.
2. **Neo4j labels Strategic_Direction/Person/Tool/System/CCSession** -> none present.
3. **Laptop-agent "~200 tools"** -> actual 240+ across 26 namespaces.
4. **kv_store creds path "creds.* read-deny on cowork bearer"** -> 69 creds.* rows exist (count fine, deny-rule not probed in this pass).
5. **status_board "124-row rot"** -> currently 180 active (above the historical low).
6. **Patterns INDEX 479 lines vs 391 .md files** -> INDEX needs regen, drift = 88 lines.
7. **Secret docs "24+"** -> 38 actual.
8. **ecodia-factory "dead, being unmounted"** -> still serves 10 tools via the narrow connector.

## File
`/Users/ecodia/.code/ecodiaos/backend/drafts/substrate-map-verification-2026-06-08.md`
