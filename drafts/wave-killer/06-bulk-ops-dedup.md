# Wave-Killer Worker 06 - Bulk ops plus dedup engine

You are a worker dispatched at 2026-05-29 evening AEST. The Chambers product (`D:/.code/chambers-frontend`) needs to become a credible Wave CRM replacement TONIGHT because Dev Battra (adversarial competitor) is pitching SCYCC an app of his own. Speed beats stealth.

## Your scope: Tier 2 bulk operations and dedup engine

Per `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Part 4 item 5 and Tier 2 item 4, "contact exists in multiple places" is a named Wave weakness. Officers need bulk merge / edit / renew / tag without dropping into SQL. Build it on top of `MembersAdmin.tsx`.

### Required deliverables

1. `MembersAdmin.tsx` gains a multi-select column. Selected-row count + a sticky action bar appears at the bottom.
2. Action bar surfaces five bulk verbs:
   - Merge (only enabled with 2-5 selected): officer picks the canonical row, the others are merged in. `tenant_members.merged_into_id UUID NULL` column added if missing (migration `0160_member_merge.sql`). Foreign-key-bearing rows (`tenant_member_dues`, `tenant_member_mandates`, event RSVPs, group memberships) are repointed to the canonical id; the loser rows are soft-deleted with `merged_into_id` set and `deleted_at = now()`.
   - Edit fields (1+ selected): one-pass edit of `tags[]`, `membership_tier_id`, `committee_ids[]`, `notes_append`. Writes happen in a single transaction.
   - Renew dues (1+ selected, members with `pending` or `current` dues): triggers `dues-renewal-scan` per member, returns success count.
   - Tag / untag (1+ selected): apply or remove a tag across the selection.
   - Export (1+ selected): CSV via the existing `data-export` edge function.
3. Dedup engine: new admin page `MembersDedup.tsx` at `/admin/members/dedup`. Detects probable-duplicate clusters via:
   - exact email match (case-insensitive),
   - exact phone-number match (E.164-normalised),
   - `levenshtein(full_name) <= 2` AND same email-domain,
   - same employer + same first-name initial + same surname.
   Clusters rendered as side-by-side cards; one-click merge into the canonical row reusing the bulk-merge transaction above.
4. Audit log writes to `admin_activity_log` (`0005_admin_activity_log.sql`) per bulk action with the action verb + affected row count + actor id.
5. Undo window: every bulk action is reversible for 5 minutes via a toast-bound undo button. Reverse uses `merged_into_id IS NULL` flip on the loser rows + restore of the prior field values from the audit log.

### Out of scope

- The members listing itself (already shipped).
- Per-member detail surfaces (out of scope).
- Cross-tenant deduplication (Chambers is multi-tenant; merges are tenant-scoped).

## The eight-rung process is non-negotiable

1. Research codebase: read `src/pages/admin/MembersAdmin.tsx`, every member-bearing migration starting at `0001_init_chambers.sql`, the RLS policies on `tenant_members`, `supabase/functions/data-export/`, `supabase/functions/re-engage-scan/` (for the renew path).
2. Plan: TodoWrite each verb + the dedup detector + the audit log + the undo window.
3. Write code: migration `0160_member_merge.sql`, MembersAdmin multi-select + action bar + verbs, MembersDedup page, dedup detector RPC `dedup_candidate_clusters(tenant_id)`, audit log writes, undo toast wiring.
4. Unit tests: `cd D:/.code/chambers-frontend && npm test`. Add tests for the merge transaction (foreign-key repoint correctness), dedup levenshtein, undo state.
5. Integration tests: hit the live Chambers Supabase (project ref `arkbjjkfjsjibnhivjis`) via org PAT at `D:/PRIVATE/ecodia-creds/supabase.env`. Seed a test tenant with 100 members including 10 known duplicate pairs, run the dedup detector, merge 3 clusters, confirm dues + event RSVPs survive on canonical rows.
6. Visual verify via CDP: navigate to `/admin/members` on the Vercel preview, select rows, screenshot each verb, then `/admin/members/dedup`, walk the cluster cards, screenshot.
7. Push: branch `feat/wave-killer-06-bulk-dedup-2026-05-29`, commit author Tate's noreply (`219926280+EcodiaTate@users.noreply.github.com`).
8. Verify deploy: Vercel READY on preview, canary screenshots of action bar + dedup page, link in `[FORK_REPORT]`.

## Final actions before exit

- status_board: upsert row tagged `wave-killer-bulk-dedup-2026-05-29` with deliverable matrix.
- Neo4j: Episode `wave-killer-bulk-dedup-2026-05-29` covering the merge transaction shape + dedup heuristics.
- `coord.signal_done({terminate:true})` then `coord.close_my_tab`.

## Source docs

- Audit: `D:/.code/EcodiaOS/backend/drafts/chambers-vs-wave-feature-audit-2026-05-27.md` Tier 2 item 4, Part 4 item 5
- New posture: `feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29` auto-memory
- Eight-rung doctrine: `D:/.code/EcodiaOS/backend/patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`

Read the audit doc + the new-posture feedback memory before drafting your plan.
