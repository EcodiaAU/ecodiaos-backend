---
type: cowork_realisation
session: self-evolution Routine fire
when: 2026-05-20 (AEST)
branch: claude/blissful-fermat-SZWWg
focus_area: C - Trigger narrowing
neo4j_episode_written: false
neo4j_reason: mcp__ecodia-core token expired at session start; routed around to filesystem-only doctrine work per when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md
kv_store_set: false
kv_store_reason: same as above
---

# Self-evolution fire 2026-05-20: trigger-narrowing audit of broad bare-noun patterns

## Substrate orientation (Step 1)

- `kv_store.get ceo.last_self_evolution`: MCP token expired, could not read prior focus rotation.
- `neo4j.search` 8h window: MCP token expired, could not query recent Episodes/Decisions.
- `status_board.query entity_type=doctrine_gap`: MCP token expired.

Routed around: ran a filesystem scan directly against `patterns/` instead of relying on the cloud-side substrates. This is the canonical correction per `when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md`.

## Focus area picked (Step 2)

C - Trigger narrowing.

Why C over A/B/D:
- A (pattern authoring) needs the 3+ occurrence bar from Episodes; Episodes unreachable.
- B (cross-referencing) needs a sweep over recent doctrine writes; doable but lower leverage right now.
- D (Episode-to-Reflection synthesis) needs Neo4j writes; substrate unreachable.
- C (trigger narrowing) is pure filesystem and extends the enforcement layer (`brief-consistency-check.sh` hook tokeniser) by tightening the trigger corpus it scans. Per `recurring-drift-extends-existing-enforcement-layer.md` this is the right shape.

## Audit method

Wrote `/tmp/scan_broad_triggers.py` and `/tmp/scan_single_word.py`. The first scans for the explicit bare-noun list from `triggers-must-be-narrow-not-broad.md`. The second finds single-word non-compound non-identifier triggers across all 306 patterns and ranks files by offender count.

Baseline:
- 1 pattern with explicit forbidden bare nouns from the doctrine list.
- 85 patterns with at least one suspect single-word trigger.
- Top 8 files (3+ suspect single-words each) selected for narrowing.

## Edits made (Step 3)

| File | OLD offenders | Action |
|---|---|---|
| `asc-app-record-create-recipe.md` | `asc, app, record, create, new, google, chrome, chrome-exe, store, connect` | Replaced 10 bare nouns with 7 narrow compounds anchored to ASC-app-record-create flow |
| `apple-dev-apns-auth-key-create-recipe.md` | `apple, dev, certificates, identifiers, profiles, developer, push-notifications` | Replaced 7 bare nouns with literal-identifier compounds (`AuthKey_.p8`, `apns-key-create-portal`, etc) |
| `decide-do-not-ask.md` | `decide, ask, defer, disambiguate, escalate, tate-blocked` | Removed 5 bare common verbs; narrowed `tate-blocked` to `tate-blocked-classification` |
| `ios-signing-credential-paths.md` | `ios, mac, app-store` | Replaced with `ios-signing-credentials`, `mac-signing-paths`, `app-store-connect-credentials`, etc |
| `no-retrospective-dumps-in-director-chat.md` | `retrospective, summary, narration, recap, ledger` | Replaced with `retrospective-dump`, `chat-summary-dump`, `narration-in-chat-not-doctrine`, etc; also fixed apostrophe-bearing triggers |
| `carbon-mrv-wedge-peak-body-sub-commercial.md` | `carbon` (also `mrv`, `dmrv`, `accu`, `nrm` narrowed) | Replaced bare `carbon` with `carbon-mrv`, `carbon-pricing-wedge`; anchored acronyms to the wedge/pricing/aggregator context |
| `supabase-pooler-session-vs-transaction-mode-selection.md` | `supabase`, `pooler` (explicit forbidden bare noun + whitespace-separated multi-word triggers) | Replaced with `supabase-pooler`, `pooler-mode-selection`, hyphenated multi-word triggers |
| `capacitor-white-screen-build-output-missing.md` | 14 whitespace-separated multi-word triggers + bare `blank screen`, `white screen` | Converted to hyphenated compounds anchored with `capacitor-` prefix |

Every edited file now has a `<!-- Trigger-narrowing audit 2026-05-20 -->` comment block at top-of-body listing OLD vs NEW triggers and the why. Zero em-dashes introduced (verified via `grep -P "\xe2\x80\x94"`).

## INDEX.md regenerated

`node scripts/regen-patterns-index.js` returned: `Wrote INDEX.md (changed). Files listed: 306. Files missing triggers: 0. Rows written: 306.`

## Verification

Post-edit re-scan:
- Patterns with explicit forbidden bare nouns from doctrine list: **0** (was 1).
- `asc` appearances as bare trigger: 2 (was 3).
- Files with 3+ suspect single-word triggers: 26 (was 34, dropped 8 = the files I narrowed).

The corpus is measurably tighter. The remaining suspect-single-word triggers are largely literal identifiers (`tailscale`, `macincloud`, `mstsc`, `scycc`, `fullcam`) or whitelisted by the doctrine ("Literal identifier" category). Those can be picked up by future self-evolution fires if the false-positive rate justifies it.

## Worked

- Filesystem-route-around when MCP died: clean. Doctrine work landed without the cloud substrate.
- The audit-comment-in-body pattern is a good substrate. A future fire can grep for `Trigger-narrowing audit` to find prior decisions.
- The scanner Python scripts (kept in `/tmp` since they were exploratory) could be promoted to `scripts/audit-broad-triggers.py` for reuse on future fires. Not done this session; flagged as next-session pointer.

## Did not work

- Could not write Neo4j Episode or kv_store rotation marker. This means the next self-evolution fire will not see what this one focused on, and may repeat option C. Mitigation: this journal file is filesystem-durable and the audit-comment blocks in the 8 edited patterns are also durable, so a future fire that reads INDEX.md and looks for recent edits will see the rotation history.

## Next session should consider

- Promote the broad-trigger scanner to `scripts/audit-broad-triggers.py` and wire it to a status_board P3 row on each fire's findings.
- Sweep the 26 remaining files with 2+ suspect single-words for literal-identifier-vs-broad-noun classification.
- Run the same scan against `clients/` and `docs/secrets/` (the doctrine applies to all doctrine directories per `context-surfacing-must-be-reliable-and-selective.md`).

## Was this fire worth the tokens

Yes. 8 high-leverage doctrine files tightened, INDEX.md regenerated, zero forbidden-bare-noun triggers remain in the corpus, and the audit method is documented for future fires to reproduce or extend. The hook surfacing layer (`brief-consistency-check.sh`) will have meaningfully less false-positive flooding on briefs about ASC, Apple Dev, iOS signing, retrospectives, carbon MRV, Supabase pooler, and Capacitor builds.

## Honest note (per action-over-plans-honesty-redeems-mistakes.md)

The MCP token expiry meant I could not perform Step 1 substrate orientation as briefed. I did not check `ceo.last_self_evolution` so I cannot guarantee I am not repeating the prior fire's focus. If the prior fire was also option C, this is duplicate work. The audit-comment blocks in the edited files include the date `2026-05-20` so any duplicate-detection logic in a future fire can spot the overlap.
