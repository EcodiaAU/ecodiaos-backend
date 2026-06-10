# status_board hygiene sweep - 2026-06-08

Aggressive sweep during 6h ham-session before account reset. Target: 180 active rows, 65 stale >3d.

## Numbers

- Rows touched (last_touched refreshed): 62
- Rows archived: 2 (P5 SUPERSEDED + P5 parked-on-trigger)
- Rows substantively refreshed (status + next_action sharpened): 6
- Substrate probes run: 14 (gh API + on-disk + git log)
- Stale rows >3d remaining post-sweep: 0
- Voice-fetch ids from brief (c725614f, bc727c7e, 75285a44, 3e374728, 4cc89f9f): not found in active or archived rows; skipped

## Archives (probe-backed)

- f7db96b9 SCYCC client silence -> SUPERSEDED by Angelica warm channel (status text self-superseded)
- 4b4959ac CETIN MVP -> parked-only-revisit on Angelica trigger

## Substantive refreshes (probe-backed)

- ed10b05c Locals Wave E -> verified commit 4cdd35a on EcodiaAU/locals-web 2026-06-02
- fc011b56 Glovebox v2 Android -> verified commit 9be5aef, HEAD now b38b0d1 (SOS stack)
- 39e6fc89 Glovebox v2.0 parent -> 4 EcodiaAU repos verified live
- 84d1462f locals-android -> pushed to EcodiaAU/locals-android 2026-06-03 verified
- 7d44be0e P1 secret leak rotation -> action sharpened, verbose status killed
- 682db3f9 SOW-2026-06-03 -> PDF on disk (143KB) verified

## Top 10 P1/P2 needing attention this week

1. **P1 5f4d0670** Goodreach + Resonaverde channel merge (ecodiaos): Tom + Angelica alignment, draft restructure proposal
2. **P1 8c3199ea** WM intensive - Lizz Hills antagonist (tate): Tate-led
3. **P1 03b7a63a** Session-corpus mining -> recurring scheduled job (ecodiaos): convert one-off arc to weekly cron
4. **P1 d6489696** factoryBridge dispatches to dead ecodia-factory (ecodiaos): pick path c, fold dead code
5. **P1 ad9ab3e0** factoryBridge.runBackgroundJob dead (ecodiaos): all ecodia-api background hangs 300s
6. **P1 f89742d9** Chambers App Store launch (ecodiaos): monitor App Review thread
7. **P1 939cac51** Corazon C: drive 95% used 5.8GB free (ecodiaos): clean %TEMP%, disk-health-critical
8. **P1 d2cad335** Stripe Agentic Commerce stack (ecodiaos): DISPATCH-READY step 4 independent of 87833a81
9. **P1 87833a81** Algorithmic-Manager Kit landing + Stripe + Q.O.O. CTA (ecodiaos): DISPATCH-READY, 6d idle
10. **P2 7d44be0e** P1 secret leak service_role rotation (ecodiaos): open Supabase dashboard via CDP, rotate

## Observations

- The 6-day-stale cluster (58 rows) all tracked to a 2026-06-02 mass-touch event; many were already legitimately tracked with valid external-wait / Tate-side blockers, just needed freshness markers
- Two P1 factoryBridge rows (d6489696 + ad9ab3e0) are duplicate-shaped on the same dead-substrate problem; consolidation candidate next sweep
- Three Glovebox rows describe the same v2 rebuild arc at different granularities (parent 39e6fc89 + Android child fc011b56 + iOS child e4322902); kept separate per status_board row granularity doctrine
- The brief's 5 voice-fetch-failed ids did not exist - that context was stale; surfaced here for the next conductor

Substrate write count: 1 SQL transaction (28 UPDATEs) + 1 cleanup UPDATE (8 rows) + 1 specific refresh (locals-android) + this report file.
