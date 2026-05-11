# Co-Exist 1.8.5 — Next-Event-Card Sign-In Button Visibility Verification

**Fork:** fork_mp0kgq3q_7902e2  
**Branch:** `1.8.5-next-event-signin-button`  
**Commit:** `56f5f76`  
**Date:** 2026-05-11  
**Audit reference:** `~/ecodiaos/drafts/coexist-1.8.5-leader-checkin-audit-2026-05-11.md` §Deliverable 5

---

## Visibility Matrix

| State | Condition | Button shown? | Test coverage |
|---|---|---|---|
| Far-future event | `isEventTodayAEST` = false | **HIDDEN** | `sign-in-button-visibility.test.ts` — "far-future event" |
| Day before event (23:59 AEST) | Not today AEST | **HIDDEN** | test — "day before" |
| Midnight AEST on event day | `isEventTodayAEST` = true, `now <= start + 2h` | **VISIBLE** | test — "AEST midnight on event day" |
| 30 min before event start | Today AEST, pre-start, within 2h window | **VISIBLE** | test — "30 minutes before event start" |
| Exactly at event start | `now === start` | **VISIBLE** | test — "exactly at event start" |
| 1h after event start (in progress) | `now <= start + 2h` | **VISIBLE** | test — "1 hour after event start" |
| Exactly 2h after event start | `now === start + 2h` (boundary inclusive) | **VISIBLE** | test — "exactly 2 hours after event start" |
| 3h after event start | `now > start + 2h` | **HIDDEN** | test — "3 hours after event start" |
| Next AEST calendar day | `isEventTodayAEST` = false | **HIDDEN** | test — "next AEST calendar day" |

All 10 vitest cases pass: `npx vitest run src/test/sign-in-button-visibility.test.ts`

---

## Visual Screenshot Constraint

**Mode A (localhost preferred) was not achievable from this fork environment.**  
The VPS fork has no X display or Playwright-capable browser context. Dev server
requires a GUI session to render screenshots against.

**Mitigation applied:** 10 automated vitest cases covering every state in the
visibility matrix above serve as the programmatic verification layer. These
directly exercise the predicate function with `vi.setSystemTime` at each
boundary — providing stronger determinism than manual screenshot inspection
(which can only capture one moment in time per screenshot).

**Recommended follow-up for Tate / visual review:**
On a device or in a local browser session, set system time (or use
`isSignInButtonVisible` mock) to confirm button appears/disappears correctly.
The key boundary to eyeball: ~30min before event start (should show button
without pulsing ring) vs. during event (button + pulsing ring).

---

## Changed Files

| File | Change |
|---|---|
| `src/lib/date-format.ts` | Added `isSignInButtonVisible()` helper (24 lines) |
| `src/pages/home.tsx` | Import + `showSignInCTA` variable + predicate swap (14 lines net) |
| `src/test/sign-in-button-visibility.test.ts` | 121 lines, 10 test cases (new file) |

---

## Predicate Logic

```typescript
// src/lib/date-format.ts
export function isSignInButtonVisible(eventDateStartIso: string | null | undefined): boolean {
  if (!eventDateStartIso) return false
  if (!isEventTodayAEST(eventDateStartIso)) return false          // must be event day in AEST
  const startMs = new Date(eventDateStartIso).getTime()
  return Date.now() <= startMs + 2 * 60 * 60 * 1000              // within 2h of start
}
```

`happeningNow` (start → end) is preserved for: live-indicator dot, pulsing
ring animation, card ring styling. Only the sign-in CTA uses `showSignInCTA`.
The pulsing ring behind the button now only renders when `happeningNow` is
also true (event is actively in progress), not when pre-event window is open.

---

## Build / Test Status

- `npx tsc --noEmit`: **clean** (no output)
- `npm run build`: **✓ built in 2.26s** (chunk-size warning pre-existing, not from this change)
- `npx vitest run src/test/sign-in-button-visibility.test.ts`: **10 passed**
