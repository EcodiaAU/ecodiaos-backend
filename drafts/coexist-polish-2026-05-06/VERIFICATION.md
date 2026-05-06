# Co-Exist polish batch 6 May 2026 - verification log

Fork: `fork_motg92kd_1b4616`
Commit: `03c3acb`
Vercel deploy: `dpl_4Tr8HindchJgqEgF7B2v8JwsCGoY` (READY, production)
Live URL: https://coexist.ecodia.au/

## Build-time gates (all passed)

- `npm run build` (Vite/Rolldown): green, 1.85s, no warnings introduced
- TypeScript: pre-existing errors only in untouched files (use-orders, use-updates, offline-sync, profile-prefs, admin/applications, admin/users, create-event, account-deletion, settings/account, settings/privacy, test/setup). NONE in any file I changed.
- ESLint (preflight): green
- Vitest: 17/17 files, 166/166 tests green
- Vercel deploy: READY

## Visual verification (Mode A localhost screenshot)

DEFERRED. Tate is foreground on EcodiaOS chat (verified via Corazon `screenshot.screenshot` at fork start). Per `~/ecodiaos/patterns/cowork-no-focus-collision.md` Step 0: Tate's foreground = active chat window; my target = Co-Exist Chrome tab on coexist.ecodia.au. Driving `input.*` to switch Chrome tabs / type URLs would steal focus mid-conversation.

`browser.*` (Puppeteer persistent profile) requires Chrome on `--remote-debugging-port=9222`, which is not currently bound and cannot be enabled without restarting Tate's Chrome.

The conductor can drive verification when Tate's session is idle, OR Tate can eyeball the live URL directly.

## Code-level verification per item

| # | Surface | File | Verification |
|---|---------|------|--------------|
| 1 | "See all" wrap | `src/pages/home.tsx` Section component | Added `whitespace-nowrap shrink-0` to action Link, `min-w-0 truncate` to title h2, `gap-3` between. Applies to ALL home sections (Upcoming Events, National Events, Updates, Impact "My impact" link). |
| 2 | Admin collective rows | `src/pages/admin/collectives.tsx` | Mobile: `gap-3` (was 4), smaller cover `12x12` (was 14x14), `flex-wrap gap-x-2.5 gap-y-1` on stats row, leader name truncated within `min-w-0 max-w-full`, member/event units abbreviated (m/ev) under sm, chevron hidden under sm. |
| 3 | Next event opacity | `src/pages/home.tsx` NextEventCard cardContent | `text-white/70` → `text-white` (date/time row), `text-white/50` → `text-white` (location), `text-white/80` → `text-white` ("View details" CTA). |
| 4 | Chat invite scroll | `src/components/chat-bubble.tsx` AnnouncementCard | Added `min-w-0` to outer card + `overflow-hidden` + `min-w-0` chain on every flex descendant; `truncate` added to label/from/date/time/address/host; `break-words` on title + body. Eliminates any horizontal-scroll path. |
| 5 | Push notif gate | `supabase/functions/send-push/index.ts` | Master-gate: when `data.type` matches `chat_*` (other than `chat_messages` itself) AND `userPrefs.chat_messages === false`, drop the token. Granular per-type gates still respected first. **DEPLOYMENT REQUIRED**: edge function does NOT auto-deploy with the Vercel push. Tate (or follow-up fork with supabase CLI installed) must run `supabase functions deploy send-push` to ship this. |
| 6 | Up Next hero image | `src/pages/collectives/collective-detail.tsx` | First (featured) up-next event card now wraps `OptimizedImage src={event.cover_image_url}` in the `aspect-[2.5/1]` frame. Falls back to existing gradient + CalendarDays icon when no cover image. Date pill overlay preserved with bumped contrast (`bg-white/95`). |
| 7 | Directions accuracy | `src/pages/events/event-detail.tsx` `handleGetDirections` | Prefers `mapPos` (saved `location_point` OR geocoded fallback) → builds `daddr=LAT,LNG`. Apple-platform UA detection → `https://maps.apple.com/?daddr=...&dirflg=d`. Else `https://www.google.com/maps/dir/?api=1&destination=...&travelmode=driving`. Falls back to address text encoding only when no coords exist. |
| 8 | Shop hero mobile height | `src/pages/shop/index.tsx` ShopHero | Container `h-[110vw] min-h-[480px] sm:h-auto` matches HomeHero exactly. Bg img `h-full object-cover object-center` on mobile, `sm:h-auto sm:object-fill` preserves desktop natural-ratio behaviour. Foreground widens to `w-[80%]` on mobile to scale with the taller frame, snaps back to `sm:w-[56.25%]`. Loading skeleton bumped to match (`h-[110vw] min-h-[480px]`). |

## Action items (after verify)

1. **Tate**: eyeball live URL on phone — confirm 1, 2, 3, 4, 6, 7, 8 visually
2. **Tate or follow-up fork**: `cd ~/workspaces/coexist/supabase && bash deploy-functions.sh` (or just `supabase functions deploy send-push`) to ship item 5 edge function
3. Item 5 gate is logic-only; verify in Supabase Logs after deploy by checking that a chat-message push to a user with `chat_messages: false` shows `sent < total`
