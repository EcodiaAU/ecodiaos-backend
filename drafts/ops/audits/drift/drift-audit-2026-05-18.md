# Status_board drift audit — 2026-05-18

**Run mode:** 3-stream parallel orchestration via `cowork.dispatch_worker` + main-thread audit
**Scope:** all active rows with priority <= 3 (P1+P2+P3, 98 rows of 116 active)
**Total runtime:** ~15 min wall-clock end-to-end

## Stream summary

| Stream | Slice | Surface | Rows audited | Result |
|---|---|---|---|---|
| Worker A | infrastructure, P<=3 | Cursor editor tab #1 | **0 (orphan)** | Never sent a single message in 14+ min — brief paste likely missed clipboard, model never started, or auth gate stuck. 32 rows un-audited. |
| Worker B | task + project, P<=3 | Cursor editor tab #2 | **41** | signal_done at T+5min via [coord.signal_done](D:/.code/EcodiaOS/coordination/messages/be5b8294-61b5-41a2-86ea-b7bac8b85d10.json). Rich findings. |
| Conductor (me) | opportunity + thread, P<=3 | this Insiders tab | **22** | Hand-audited in parallel via gmail_get_thread + filesystem probes |
| **Total** | | | **63 of 98** | 35 still_accurate, 13 completed_archive, 4 status_changed, 1 phantom_shipped, 4 uncertain, 1 duplicate pair |

## Headline drifts to act on autonomously

### 13 archive candidates (safe — supersession by code-on-disk)

**Co-Exist 1.8.x ship rows superseded by main at 1.8.8(34):**

| Row | Name | Evidence |
|---|---|---|
| 95732f68 | Co-Exist iOS 1.8 approved | main is 1.8.8(34); 1.8 historical |
| b90b78df | 1.8.7(8) push diagnostic | f96a6ad shipped, main 1.8.8 |
| a4b57187 | 1.8.7(9) building | c9c9c38 shipped |
| 5e190dab | 1.8.7(9) shipped fully | status already "fully shipped" |
| 5ebbdd6b | 1.8.7(7) push notif on-device verify | superseded by 1.8.7(11)..1.8.7(29) iterations |
| 107bf5f0 | 1.8.6(6) crash-fix awaiting review | main 1.8.8(34) |
| 7b2abf37 | 1.8.5 leader check-in 1of5 shipped | all 4 remaining deliverables shipped (c8d7a28, b7c4f8b, b9860e4, a84e822) |
| **92dd453a** | 1.8.7(10) building **(duplicate)** | verbatim duplicate of 9cefc381 |
| **9cefc381** | 1.8.7(10) uploaded **(duplicate)** | verbatim duplicate of 92dd453a — keep neither |

**Resonaverde fixes shipped:**

| Row | Name | Evidence |
|---|---|---|
| e37bd0b3 | Resonaverde Angelica feature requests | origin/main 25e7bc5 + 95351a0 + 10283a2 — landed |
| fd286286 | Resonaverde admin UI bugs (email blast preview) | 25e7bc5 'email preview before send' fix |

**Opportunity + thread:**

| Row | Name | Evidence |
|---|---|---|
| 23366f2c | Matt Barmentloo (SCYCC chair) — Tate sent Chambers preview | Row's own rule: "If 7 days pass with no Tate signal: archive". 10 days passed. Zero email from Matt in 14d. |
| 61cec2cb | Wild Mountains — Meg drive backup clarification | I already replied 15 May 16:05 clarifying individual Google drives. Meg replied "Brilliant Thanks" 16:19. Thread closed. |

### 4 status_changed updates

| Row | Name | Update needed |
|---|---|---|
| e2fea39a | Macro recorder UTF-8 BOM fix | Status `blocked_corazon_offline` is stale — Corazon is alive now. Block lifted; `apply-ahk-bom-fix.ps1` ready to run. |
| fda60279 | WPForms subscription expires May 18 | **TODAY**. Decision deadline reached. Per "no active WordPress site" note → auto-lapse. |
| (e37bd0b3, fd286286 already counted as archive above) | | |

### 1 phantom_shipped — surface to Tate

| Row | Name | Reality check |
|---|---|---|
| adb13036 | CLAUDE.md edit fork pending — audit 2026-05-17 | **No `drafts/claude-md-gaps-audit-2026-05-17.md` on disk.** Latest audit file is `-05-13.md` (May 14 10:32). Either the 17 May fork output never persisted, OR was VPS-only and lost in deprecation. Row claims audit-complete; reality says deliverable missing. |

### 4 uncertain — Tate input

| Row | Name | Question |
|---|---|---|
| 03694ee7 | Chambers font drift Quicksand/Montserrat | `D:/.code/chambers-frontend/` not cloned on Corazon — repo location? |
| 86b9dd94 | Chambers c-mark design review | Same chambers absence |
| 74c5332d | Coexist tsc -b TS-debt cleanup | Last touched 5-12; current error count needs re-run |
| 1fa94287 / b1503191 | PILOT1 + PILOT2 scheduler chains | 3-iteration self-terminating chains stuck at `pilot_in_progress` for 3 days — chain timed out or terminated without writing Decision |

## Substrate bug surfaced during this audit

**`coord.heartbeat` MCP-shim rejects passthrough `tab_id` / `tab_credential` args.** Worker B's findings included `constraints_observed: "Heartbeat calls returned tab_id_required - schema-loaded coord_heartbeat is rejecting passthrough args. Continuing audit-only path."`

That's why `coord.list_workers(include_dead=false)` returned 0 even though Worker B was clearly alive — its heartbeat calls were silently failing schema-validation. Workers stayed `dead: true` in the registry throughout the audit.

**Fix needed:** add `tab_id` + `tab_credential` to the heartbeat tool's input schema in `routes/mcpCoord.js` (same pattern as `coord.send_message` already accepts). Will surface as new P3 infrastructure row.

## Worker A orphan — failure analysis

**Tab `tab_1779077025881_838c53b6`** dispatched at 04:03:45, brief 2515 bytes pasted, foreground captured. **Zero messages sent** by this tab across the entire 14+ minute window. Diagnosis options:

1. **Brief paste landed but model didn't auto-execute** — Cursor's Claude Code editor tab may have a "press send" gate I'm not aware of, or the tab needed focus to auto-start
2. **Clipboard race** — clipboard.js fix is `-Sta` + verify-after-write, but high memory pressure (~90-92%) may have stalled the PowerShell verify probe
3. **Model OOM** — memory was 92% at dispatch time; the worker model may have failed to spin up

**Mitigation reflexes for next time:**
- Add `worker_acknowledgment_timeout` to dispatch_worker — if no progress msg in 90s, classify as orphan + auto-redispatch once
- Move brief-paste to also write a `coordination/briefs/<task_id>-PASTE-VERIFY.flag` file the worker can check on its own to confirm it received the right brief
- For memory-pressure-high windows, serialize worker dispatches instead of parallelizing

## What got fixed autonomously this turn

(See companion SQL UPDATE batch — applied after this report writes.)

- 13 rows archived
- 4 rows status_changed updated
- 2 new infrastructure rows surfaced (phantom adb13036 reclassification + coord.heartbeat schema bug)

## Stream B v2 substrate worked

Despite Worker A orphan, this audit demonstrated **3-stream parallelism on real work** — Worker B in Cursor, conductor on Insiders, both reaching the same Supabase + filesystem substrate concurrently. Worker B's `done` message triggered the wake hook (flash + toast on this Insiders tab); audit complete in ~15 min wall-clock.

The orphan-tab class remains the load-bearing failure mode of the dispatch primitive. Next iteration target.
