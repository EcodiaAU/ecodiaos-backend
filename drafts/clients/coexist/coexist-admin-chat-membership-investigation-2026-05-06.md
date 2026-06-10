# Co-Exist admin chat membership investigation — 6 May 2026

Origin: Tate, 6 May 2026 ~10:53 AEST. "im in the nsw national state chat, but not the qld or victoria or any of them? Why is that? Since my acc is admin i should be in them all no?"

Fork: `fork_motchy6p_f4d69e`. Repo: `/home/tate/workspaces/coexist`.

## Data model

Tables (`supabase/migrations/023_staff_chat_channels.sql`):

- `chat_channels` — one row per staff chat room. Columns: `id`, `type` (`'staff_collective' | 'staff_state' | 'staff_national'`), `collective_id` (for `staff_collective`), `state` (for `staff_state`), `name`, `created_at`. Unique partial indexes per type so each state and national are singletons.
- `chat_channel_members` — explicit membership rows. `(channel_id, user_id)` unique. Trigger-managed.

Roles (`is_admin_or_staff`, migration 078): true for `role IN ('national_leader', 'manager', 'admin')`. `'admin'` is the global super-admin tier (Tate).

## Access-control logic

Two layers control whether Tate sees a state chat:

1. **`useMyStaffChannels` hook** (`src/hooks/use-staff-channels.ts:50`):
   ```ts
   .from('chat_channel_members')
   .select('channel_id, chat_channels(...)')
   .eq('user_id', user.id)
   ```
   Returns ONLY channels the user has an explicit membership row for. Admin role is not consulted.

2. **RLS on `chat_channels`** (migration 023):
   ```sql
   create policy chat_channels_select on chat_channels
     for select using (
       is_admin_or_staff(auth.uid())
       or exists (
         select 1 from chat_channel_members ccm
         where ccm.channel_id = chat_channels.id and ccm.user_id = auth.uid()
       )
     );
   ```
   RLS WOULD let admins read the rows, but the hook query joins via `chat_channel_members` so RLS is moot for the chat list.

## Auto-membership triggers

Two triggers populate `chat_channel_members`:

- `sync_collective_staff_channels` (fires on `collective_members` insert/update/delete): adds the user to the per-collective `staff_collective` channel AND to that collective's `staff_state` channel when `role IN ('assist_leader', 'co_leader', 'leader')`. Removes when demoted to `member` and not staff in any other collective in that state.
- `sync_national_staff_channel` (fires on `profiles.role` update): adds users with `role IN ('national_leader', 'manager', 'admin')` to the singleton `staff_national` channel. Removes on demotion to `participant`.

There is **no equivalent trigger that auto-adds global admins to all state staff channels**. State-staff membership is keyed entirely on per-state collective leadership.

## Why Tate is in NSW but not QLD/VIC

Tate's `profiles.role = 'admin'` → he's auto-added to `staff_national` (matches `sync_national_staff_channel`).

Tate is presumably a leader/co-leader/assist-leader of at least one NSW collective (or was when the NSW seed/sync ran) → he's in the NSW `staff_state` channel.

He is not a leader of any QLD/VIC/etc collective → no `chat_channel_members` row for those state channels → not visible in `useMyStaffChannels`.

## Verdict

**Document-as-design / Tate-decision-required.** Not a bug.

The current design is intentional: state staff channels are scoped to *leaders of collectives in that state*, not to global admins. There is parallel auto-membership logic for the national channel (admins included) but not for state channels.

Tate's expectation ("admin should see them all") is reasonable as a product call, but it's a **product decision**, not a code defect. Auto-adding admins to all state channels would:

- Generate `INSERT` notifications fanning out to every state's leadership cohort
- Change the social contract of those channels (state-leaders chatting amongst themselves vs. national-admins observing)
- Mean every new state channel auto-includes admins forever, opt-out unclear

The brief's constraint is explicit: *"DO NOT auto-add Tate to chats if the design is intentional admin-not-in-all-chats."*

## Recommended action

Status_board P3 row inserted: "Admin chat membership: admins not auto-in all state chats by design — change requested 6 May 2026". Tate to decide between:

1. **Status quo** (no change). Design is intentional.
2. **Auto-add admins to all state channels** (extend `sync_national_staff_channel` to also sync admins into every `staff_state` row). One-shot migration to backfill existing admins. Minor — additive trigger.
3. **Admin-only "view all channels" surface** in the chat list. Add a separate query (RLS-bypassing because admin) that lists all `staff_state` rows and shows them under a new section. Doesn't change membership; just visibility. UX-cleaner; messages they post would still create explicit membership rows on first send if needed.

Option 3 is cheapest and least disruptive. Option 2 is the most direct read of Tate's request. Option 1 is the safe default until he chooses.

## Files inspected

- `src/hooks/use-staff-channels.ts` — `useMyStaffChannels` query
- `src/pages/chat/index.tsx` — chat list page
- `src/pages/chat/chat-room.tsx` — chat detail page
- `supabase/migrations/023_staff_chat_channels.sql` — schema + RLS + triggers
- `supabase/migrations/078_fix_role_functions.sql` — `is_admin_or_staff` definition + `sync_national_staff_channel` recreation
