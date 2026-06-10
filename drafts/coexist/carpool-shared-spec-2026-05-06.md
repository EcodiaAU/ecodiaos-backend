# Co-Exist carpool widgets — shared worker spec
Manager fork: fork_motgovfw_22b576
Date: 2026-05-06

## Repo layout (canonical)
- `~/workspaces/coexist/` — single tree. Branch: `main`. Both Capacitor `src/` (FE) and `supabase/` (migrations + edge fns) live here.
- Working tree CLEAN at start. Latest commit on origin/main: `03c3acb polish: 8 mobile UI fixes from Tate's 6 May list`.
- All work commits to local main; manager will rebase/squash into ONE final commit.

## Migration number to claim
- Next free number: **`20260506010000_carpool_widgets.sql`** (latest current is `20260506000000_fix_profile_visibility_public_tier_fallback.sql`).
- Worker 1 claims this slot AT WRITE TIME — re-list `~/workspaces/coexist/supabase/migrations/` immediately before writing in case sibling forks landed something. Single migration file only.

## Existing event-invite widget pattern (mirror this shape)
- Renderer: `AnnouncementCard` in `src/components/chat-bubble.tsx` lines ~355-560.
- Data-fetching wrapper: `InlineAnnouncement` in `src/pages/chat/chat-message-list.tsx` lines ~96-225.
- Creator sheet: `src/components/create-announcement-sheet.tsx`.
- Composer "+" entry: `leaderActions` array in `src/components/message-input.tsx` line ~121.
- Submit handler: `handleCreateAnnouncement` in `src/pages/chat/chat-room.tsx` line ~568.
- Storage convention: `chat_announcements` row + `chat_messages` row with `message_type='announcement'` + `announcement_id` FK. Renderer dispatched in `chat-message-list.tsx` line ~365 via `if (messageType === 'announcement' && msg.announcement_id)`.

## Carpool storage convention (target)
- New tables: `carpool_widgets`, `carpool_seats`, `carpool_breakout_chats`.
- Add new column to `chat_messages`: `carpool_id uuid REFERENCES carpool_widgets(id)`.
- Add `message_type='carpool'` as the dispatched type.
- Renderer: `CarpoolCard` in `src/components/chat-bubble.tsx` (mirror `AnnouncementCard` structure).
- Data-fetching wrapper: `InlineCarpool` in `src/pages/chat/chat-message-list.tsx`.
- Creator sheet: `src/components/create-carpool-sheet.tsx`.
- Composer entry: add `{ icon: Car, label: 'Carpool', onClick: onCreateCarpool, color: 'text-white bg-success-600 shadow-sm' }` to `leaderActions` array.
- Submit handler: `handleCreateCarpool` in `chat-room.tsx`, parallel to `handleCreateAnnouncement`.
- Pickup-address modal: new `src/components/save-seat-sheet.tsx` (or inline in CarpoolCard).

## Breakout chat convention
- Use existing `chat_channels` (id, name, type, state, collective_id) + `chat_channel_members`.
- New channel `type='carpool_breakout'`.
- `chat_channels.state` = 'open' or 'archived'.
- `chat_channels.collective_id` = the carpool's collective_id (so RLS can scope it).
- Hide carpool_breakout channels from main collective chat list — filter by `type != 'carpool_breakout'` in the chat list query.
- Surface in event detail page under "Coordination" subsection, joined via carpool_breakout_chats.carpool_id → carpool_widgets.event_id.
- Server-side trigger creates the channel + adds first member (driver + passenger) when first seat is saved. Subsequent seats auto-add. Logic lives inside the `carpool-save-seat` edge function (Worker 1 builds, Worker 3 surfaces).

## Privacy invariant (CRITICAL — RLS)
- `carpool_widgets.departure_point_text` — visible to all collective members (driver chose to publish).
- `carpool_seats.pickup_address_text` — visible ONLY to (passenger themselves) OR (driver of the carpool). Other collective members see seats but with pickup_address_text = NULL via RLS.
- Test: log in as a third-party collective member, query `carpool_seats`, confirm `pickup_address_text` returns NULL for seats they're not party to. Worker 3 writes this test.

## Schema (from brief, locked)
```sql
CREATE TABLE carpool_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id uuid NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  departure_point_text text NOT NULL,
  departure_lat numeric,
  departure_lng numeric,
  departure_time timestamptz NOT NULL,
  seats_total int NOT NULL CHECK (seats_total > 0),
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','cancelled','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE carpool_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id uuid NOT NULL REFERENCES carpool_widgets(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pickup_address_text text NOT NULL,
  pickup_lat numeric,
  pickup_lng numeric,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(carpool_id, passenger_id)
);

CREATE TABLE carpool_breakout_chats (
  carpool_id uuid PRIMARY KEY REFERENCES carpool_widgets(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  archived_at timestamptz,
  deleted_at timestamptz
);

ALTER TABLE chat_messages ADD COLUMN carpool_id uuid REFERENCES carpool_widgets(id) ON DELETE SET NULL;
```

## RLS policies (Worker 1 implements, Worker 3 verifies via test)
- `carpool_widgets` SELECT: collective members (existing `is_collective_member(auth.uid(), collective_id)` helper or its equivalent — check `004_security_audit.sql` and recent migrations for the canonical helper name).
- `carpool_widgets` INSERT: collective members; `WITH CHECK (driver_id = auth.uid() AND is_collective_member(auth.uid(), collective_id))`.
- `carpool_widgets` UPDATE: only `driver_id = auth.uid()`.
- `carpool_seats` SELECT: ALL columns visible to collective members EXCEPT `pickup_address_text`, which is restricted via a column-grant + view OR a SECURITY DEFINER RPC. Recommended approach: keep base-table SELECT open to collective members, but expose pickup_address_text only through a `get_carpool_seat_pickup(seat_id)` RPC that checks `passenger_id = auth.uid() OR EXISTS (SELECT 1 FROM carpool_widgets WHERE id = seat.carpool_id AND driver_id = auth.uid())`. RLS alone can't restrict per-column directly; use a VIEW that does the conditional unmask, or a separate RPC for the unmasked address. Pick the cleanest path that survives PostgREST.
- `carpool_seats` INSERT: collective members; check seats remaining > 0 atomically (use an RPC `save_carpool_seat(carpool_id, pickup_address_text, pickup_lat, pickup_lng)` that does the seat-count check + insert in a single transaction with row-level lock on carpool_widgets row).
- `carpool_seats` UPDATE: passenger or driver only (for cancellation).
- `carpool_breakout_chats` SELECT: only members of the linked channel.

## Edge functions (Worker 1)
- `carpool-create-widget` — body: `{collective_id, event_id, departure_point_text, departure_lat?, departure_lng?, departure_time, seats_total, notes?}`. Creates widget + chat_messages row in one transaction. Returns the widget id + message_id.
- `carpool-save-seat` — body: `{carpool_id, pickup_address_text, pickup_lat?, pickup_lng?}`. Atomic: lock carpool_widgets row, check seats remaining, INSERT carpool_seats, IF first seat then auto-create chat_channels (type='carpool_breakout', name='🚗 Carpool: {Event Title}') + insert carpool_breakout_chats row + add driver and passenger as channel members. ELSE add passenger to existing breakout channel members. Update widget.status='full' if last seat taken.
- `carpool-cancel-seat` — body: `{seat_id}`. Auth check (passenger themselves OR driver). Set `carpool_seats.status='cancelled'`. Remove member from breakout channel. If widget was 'full', revert to 'open'.
- `carpool-archive-sweep` — no body, called by pg_cron every hour. Steps: (1) For each `carpool_widgets` where event.date_end + 24h < now() AND status != 'archived' → set widget.status='archived', set carpool_breakout_chats.archived_at=now(), set chat_channels.state='archived'. (2) For each carpool_breakout_chats where archived_at + 7d < now() AND deleted_at IS NULL → DELETE chat_channels (cascades to messages), set carpool_breakout_chats.deleted_at=now(). Returns counts JSON.

## Realtime (Worker 3)
- Subscribe via `supabase.channel('carpool:'+carpool_id)` in InlineCarpool wrapper.
  - Listen for `postgres_changes` on `carpool_seats` filtered by `carpool_id=eq.{id}`.
  - On INSERT/UPDATE → invalidate React Query keys `['carpool', carpoolId]`, `['carpool-seats', carpoolId]`.
- Add carpool_widgets + carpool_seats to the realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE carpool_widgets, carpool_seats;` (in the migration).

## Worker dependencies
- Worker 2 + Worker 3 should READ this file and use the table/column/function names from the schema as canonical, even before Worker 1 commits. This is parallel work that converges on shared names.
- Worker 1 MUST not deviate from the table/column/function names listed here (Worker 2 + 3 are coding to them).
- Worker 2 should mock the data-fetching hook with placeholder values until Worker 1's migration is on disk; then re-run typegen if needed.
- Worker 3 wires realtime + breakout-chat surfacing + writes integration tests.

## Pre-commit gate (each worker)
- `npm run lint` clean (or no-new-warnings vs HEAD).
- `npx tsc --noEmit` clean (or no-new-errors vs HEAD).
- For Worker 1: `npx supabase db reset` runs migration cleanly against local Supabase if available; otherwise validate SQL with `psql --dry-run` or pg-syntax-check.

## Out of scope (v2/v3 — DO NOT BUILD)
- Sub-pickups (passenger asks for a sub-pickup en route).
- "Looking-for-ride" widgets (passenger-initiated, not driver-initiated).
- Multi-leg carpools.
- Map-pin selection on pickup address (text-only for v1; lat/lng columns are stored if user provides via geocoder later).
- iOS bundle / cap-sync (Tate handles separately).

## Coordination
- Each worker emits `[FORK_REPORT]` with: files touched, commit SHA, smoke-test result, anything blocked.
- Workers commit on local main with messages `worker1: db+edge`, `worker2: ui`, `worker3: realtime+breakout`. Manager will squash.
