# Meeting Analysis Editor - Spec v1

**Authored by:** fork_mp3btyep_c9d078  
**Date:** 2026-05-13  
**Status:** Draft - awaiting Tate review before build forks dispatch  
**Trigger:** Tate verbatim 10:31 AEST 13 May 2026 - "we need a good way to make edits to all the actions, decisions, deepdive etc, and make sure if they have flow on effects to other aspects of the analyiss, its applied yk? Like some sort of reanalysis after all changes are made ya? or maybe a light chat that can make the changees for me and i jsut have to talk to it... kinda like what we're doing, but some way of knowing which convo and the whole /meetings setup"

---

## §1 Goal + Scope

The Meeting Analysis Editor is a per-meeting chat surface embedded in the `/meetings/:id` detail page. It lets Tate correct any aspect of an analysis - actions, decisions, deepdive sections, participants, open questions - by talking in natural language. The chat agent applies edits atomically to a structured analysis object, tracks which items depend on which, flags downstream items that may be stale after an upstream change, and then runs a full consistency reanalysis before the email is re-rendered and made sendable.

The problem it solves: Tate sent corrections to the 12 May Co-Exist 3hr meeting analysis via email this morning. The current path is a manual edit-fork: someone reads the email, interprets corrections, finds the right JSONB fields, patches them by hand, re-runs the email render. That is too much friction for what should be a 30-second conversation.

**What this is:**
- A natural-language editing surface for the analysis object produced by `meetingAnalysisService.js`
- A dependency graph that flags cascade-affected items when an edit touches a referenced item
- A reanalysis consistency pass before the corrected email is sent
- A deterministic email render from the structured state (no re-running the full LLM analysis)

**What this is not:**
- A Notion replacement or general note-taking surface
- Multi-user concurrent editing (v1 is Tate-only)
- A way to edit the raw transcript (that path already exists at `PATCH /meetings/:id/transcript`)
- A replacement for the original analysis pipeline (it edits the output, not re-runs the source)
- An autonomous sender - the agent never calls `POST /meetings/:id/email`; that button stays in Tate's hands

**Success criteria:**
1. Tate opens a meeting, clicks "Edit analysis", types "Change the owner of action ai-003 from Tate to Kurt" and the structured object updates within 2s.
2. Any items that referenced `ai-003` are immediately flagged for review in the UI.
3. Tate types "looks good" and the reanalysis pass runs, returning green-light within 30s for a typical meeting.
4. The email preview updates live. The Send button unblocks.
5. The whole flow never requires Tate to touch JSON, identify a table row, or dispatch a fork.

---

## §2 Structured Analysis Schema

The load-bearing piece. Today `analysis_json` and `action_items_json` are stored as opaque JSONB blobs with no stable item IDs and no dependency graph. The editor requires typed, ID-stable, graph-connected analysis objects.

### 2.1 Target Schema (TypeScript shape for reference)

```typescript
interface StructuredAnalysis {
  // --- Identity ---
  meeting_id: string             // uuid, FK to meeting_recordings.id
  schema_version: '1'            // bump on breaking shape changes
  analysed_at: string            // ISO timestamp of original analysis run
  last_edited_at: string | null  // ISO timestamp of most recent editor save
  
  // --- Participants ---
  participants: Participant[]
  
  // --- Summary ---
  summary: {
    one_line: string             // under 25 words
    executive: string            // 5-8 paragraphs for long meetings
    sentiment_arc: string        // paragraph(s) describing energy arc
  }
  
  // --- Core items (each has stable id + dependency refs) ---
  actions: Action[]
  decisions: Decision[]
  deepdive_sections: DeepdiveSection[]
  open_questions: OpenQuestion[]
  commitments: Commitment[]
  risks: Risk[]
  opportunities: Opportunity[]
  strategic_implications: StrategicImplication[]
  themes: Theme[]
  standout_moments: StandoutMoment[]
  people_entities: PeopleEntity[]
  
  // --- Email projection ---
  email_render: EmailRender
}

interface Participant {
  id: string                    // e.g. "par-001"
  name: string
  role: string | null
  speaker_code: string | null   // "A", "B" etc from diarisation
  present: boolean
}

interface Action {
  id: string                    // e.g. "ai-001" (preserve from action_items_json)
  action: string                // verb-led description
  owner: string                 // real name or "TBD"
  due: string | null            // natural language or ISO date
  priority: 'P1' | 'P2' | 'P3'
  context: string               // why this came up
  source: 'explicit' | 'implicit'
  depends_on: string[]          // ids of other actions this must wait for
  blocking_for: string[] | null // ids of actions/decisions this unblocks
  timestamp_range: string | null
  needs_review: boolean         // true = flagged by cascade
  review_reason: string | null  // why flagged
}

interface Decision {
  id: string                    // e.g. "dec-001"
  decision: string
  rationale: string | null
  decided_by: string            // owner name
  stakeholders: string[]        // other participant names
  timestamp: string | null
  depends_on: string[]          // ids of actions/decisions that preceded this
  blocks: string[]              // ids of actions/decisions now enabled by this
  needs_review: boolean
  review_reason: string | null
}

interface DeepdiveSection {
  id: string                    // e.g. "dd-001"
  heading: string
  content: string               // markdown prose
  references: string[]          // ids of actions/decisions/risks mentioned in content
  needs_review: boolean
  review_reason: string | null
}

interface OpenQuestion {
  id: string                    // e.g. "oq-001"
  question: string
  context: string
  blocked_on: string | null
  who_owns_answer: string | null
  needs_review: boolean
  review_reason: string | null
}

interface Commitment {
  id: string                    // e.g. "com-001"
  commitment: string
  owner: string
  to_whom: string | null
  deadline: string | null
  timestamp: string | null
  context: string | null
  depends_on: string[]
  needs_review: boolean
  review_reason: string | null
}

interface Risk {
  id: string                    // e.g. "rsk-001"
  risk: string
  severity: 'high' | 'medium' | 'low'
  context: string
  references: string[]          // ids of actions/decisions that could mitigate
  needs_review: boolean
  review_reason: string | null
}

interface Opportunity {
  id: string                    // e.g. "opp-001"
  opportunity: string
  context: string
  timestamp: string | null
  needs_review: boolean
  review_reason: string | null
}

interface StrategicImplication {
  id: string                    // e.g. "si-001"
  implication: string
  timeframe: 'immediate' | 'short-term' | 'long-term'
  rationale: string
  references: string[]
  needs_review: boolean
  review_reason: string | null
}

interface Theme {
  id: string                    // e.g. "thm-001"
  theme: string
  description: string
  timestamp_range: string | null
  weight: 'primary' | 'secondary'
  key_speakers: string[]
  needs_review: boolean
  review_reason: string | null
}

interface StandoutMoment {
  id: string                    // e.g. "sm-001"
  quote: string
  speaker: string
  timestamp: string | null
  significance: string
  needs_review: boolean
  review_reason: string | null
}

interface PeopleEntity {
  id: string                    // e.g. "pe-001"
  name: string
  role: string
  key_interests: string
  stance: string | null
  needs_review: boolean
  review_reason: string | null
}

interface EmailRender {
  subject: string
  recipients: string[]          // last-used to list for pre-fill
  body_md: string               // deterministic render from structured state
  last_rendered_at: string | null
  dirty: boolean                // true when any field changed since last render
}
```

### 2.2 ID Assignment Rules

- IDs are stable once assigned: never change on edits, only retire on explicit removal.
- Retired IDs are NOT reused. Add items get the next sequential number: `ai-026` follows `ai-025` even if `ai-025` was deleted.
- ID prefix map: `ai-` actions, `dec-` decisions, `dd-` deepdive, `oq-` open questions, `com-` commitments, `rsk-` risks, `opp-` opportunities, `si-` strategic implications, `thm-` themes, `sm-` standout moments, `pe-` people entities, `par-` participants.
- Existing `action_items_json` already has `id` fields (e.g. `ai-001`). Preserve these exactly on migration.

### 2.3 Validation Rules

- `action.priority`: must be `P1 | P2 | P3`
- `action.owner`: non-empty string, max 100 chars
- `decision.decided_by`: non-empty string
- All `depends_on` / `blocks` / `references` arrays: must reference IDs that exist in the same structured analysis object; orphan refs are silently dropped on save.
- `email_render.recipients`: validated email format, max 20 recipients.
- `needs_review` and `review_reason`: always set together; if `needs_review=false` then `review_reason=null`.

### 2.4 Storage

**Primary store:** add column `structured_analysis jsonb` to `meeting_recordings`. This is the canonical state the editor works against.

Keep `analysis_json` and `action_items_json` as read-only historical blobs - they are the raw LLM output before structuring. Never overwrite them. The editor always reads/writes `structured_analysis`.

**Migration sketch:**
```sql
-- Migration 115_meeting_structured_analysis.sql
ALTER TABLE meeting_recordings
  ADD COLUMN structured_analysis jsonb,
  ADD COLUMN structured_analysis_version text DEFAULT '1',
  ADD COLUMN structured_analysis_migrated_at timestamptz;

-- Backfill function: run once per existing meeting with analysis_status='done'
-- Shape: assign sequential IDs to all items in analysis_json + action_items_json,
-- set needs_review=false on all items, set email_render.dirty=false,
-- set email_render.body_md to the current HTML email body (store as md approximation).
-- The backfill script lives at: scripts/migrate-meetings-to-structured.js
```

**No separate storage:** the full structured analysis fits comfortably in a single JSONB column. A long 3hr meeting with 30 actions + 20 decisions + 10 deepdive sections is roughly 80-120KB of JSON - well within Postgres JSONB limits and Supabase row size. No need for Supabase Storage for this.

**Edit history:** append-only log in new table `meeting_analysis_edits` (see §8).

---

## §3 Editor Chat Agent

### 3.1 Chat Session Model

New table: `meeting_editor_sessions`

```sql
CREATE TABLE meeting_editor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_recordings(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  message_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'  -- active | closed
);

CREATE TABLE meeting_editor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES meeting_editor_sessions(id),
  meeting_id uuid NOT NULL REFERENCES meeting_recordings(id),
  role text NOT NULL,              -- 'user' | 'assistant'
  content text NOT NULL,
  edit_ops jsonb,                  -- ops the assistant applied in this turn (null for user msgs)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON meeting_editor_messages (session_id, created_at);
CREATE INDEX ON meeting_editor_sessions (meeting_id);
```

**Session lifecycle:** one active session per meeting at a time. Opening `/meetings/:id/editor` fetches or creates the active session. Closing the tab does not close the session - it persists so conversation history is available on next open. A session is "closed" only if Tate explicitly clears it via "Start fresh" button (rare; mostly for archival).

### 3.2 Tool Surface (what the LLM can call)

The editor agent has access to exactly these tools. No others.

```typescript
// Core edit operations
editMeetingAnalysis({
  meeting_id: string,
  edit_op: EditOp,
  args: EditArgs
}) => { success: boolean; affected_ids: string[]; cascade_flags: CascadeFlag[] }

// Read-only inspection
getMeetingAnalysis({ meeting_id: string }) 
  => StructuredAnalysis  // returns current structured_analysis

// Signal that all edits are done and reanalysis should run
requestReanalysis({ meeting_id: string, reason?: string })
  => { queued: boolean }
```

**`EditOp` enum and corresponding `EditArgs`:**

```typescript
type EditOp =
  // Actions
  | 'update_action'          // args: { id, fields: Partial<Action> }
  | 'add_action'             // args: { action: Partial<Action> } (id auto-assigned)
  | 'remove_action'          // args: { id }
  | 'merge_actions'          // args: { source_id, target_id } - target absorbs source
  | 'reassign_action'        // args: { id, new_owner: string }
  | 'reprioritise_action'    // args: { id, priority: 'P1'|'P2'|'P3' }
  
  // Decisions
  | 'update_decision'        // args: { id, fields: Partial<Decision> }
  | 'add_decision'           // args: { decision: Partial<Decision> }
  | 'remove_decision'        // args: { id }
  
  // Deepdive sections
  | 'update_deepdive_section'    // args: { id, fields: Partial<DeepdiveSection> }
  | 'add_deepdive_section'       // args: { section: Partial<DeepdiveSection> }
  | 'remove_deepdive_section'    // args: { id }
  | 'reorder_deepdive_sections'  // args: { ordered_ids: string[] }
  
  // Open questions
  | 'update_open_question'   // args: { id, fields: Partial<OpenQuestion> }
  | 'add_open_question'      // args: { question: Partial<OpenQuestion> }
  | 'remove_open_question'   // args: { id }
  | 'resolve_open_question'  // args: { id } - marks resolved, removes from open

  // Commitments
  | 'update_commitment'      // args: { id, fields: Partial<Commitment> }
  | 'remove_commitment'      // args: { id }
  
  // Risks
  | 'update_risk'            // args: { id, fields: Partial<Risk> }
  | 'remove_risk'            // args: { id }
  
  // Participants
  | 'rename_participant'     // args: { id, new_name: string } - cascades to all owner fields
  | 'add_participant'        // args: { participant: Partial<Participant> }
  | 'update_participant'     // args: { id, fields: Partial<Participant> }
  
  // Summary
  | 'update_summary'         // args: { fields: Partial<summary> }
  
  // Cross-cutting
  | 'clear_review_flag'      // args: { id } - Tate manually dismisses a cascade flag
  | 'flag_for_reanalysis'    // args: { id, reason: string } - Tate manually flags an item
```

Each op returns `{ success, affected_ids, cascade_flags }` where `cascade_flags` is an array of `{ id, type, reason }` for items that the cascade logic flagged as potentially stale.

### 3.3 System Prompt Skeleton

```
You are the EcodiaOS Meeting Analysis Editor. You help Tate correct and refine the analysis of a specific meeting by applying precise edits via the editMeetingAnalysis tool.

MEETING CONTEXT:
Title: {meeting.title}
Date: {meeting.started_at}
Duration: {meeting.duration_seconds / 60}min
Client: {meeting.client_name || 'n/a'}

CURRENT ANALYSIS SUMMARY:
One-line: {structured_analysis.summary.one_line}
Actions: {count} | Decisions: {count} | Open questions: {count}
Items needing review: {needs_review_count}

RULES:
- Apply edits via the tool, do not narrate what you're about to do - just do it.
- After each edit, briefly confirm what changed and surface any cascade flags in one sentence.
- If multiple items need the same change (e.g. rename an owner across all actions), apply them in a single turn.
- Never suggest sending the email. That is Tate's call.
- If the request is ambiguous, state your interpretation and apply it. Do not ask clarifying questions.
- Keep responses under 100 words unless Tate asks for explanation.
- No em-dashes.

EDIT HISTORY (last 10 ops):
{last_10_edit_ops_summary}
```

### 3.4 Model Selection

**Editor agent model:** `claude-haiku-4-5` (or latest Haiku). This is high-frequency low-stakes tool calling - interpreting short correction instructions and mapping them to structured ops. Haiku is fast, cheap, and more than capable for this. Cost per message: roughly $0.001-0.003. A typical edit session (10-20 messages) costs under $0.05. Fine.

**Reanalysis model:** `claude-opus-4-7` - same as original analysis. The consistency check is the one place where model quality matters. Use the same model as the original pass.

### 3.5 Agent Constraints

- The agent never calls the email endpoint. Output only.
- The agent never modifies `transcript_text`, `transcript_json`, `analysis_json`, or `action_items_json`. These are read-only historical blobs.
- The agent only modifies `structured_analysis` via the edit ops.
- Context window: inject the full `structured_analysis` object on every turn (it's small enough - 80-120KB of JSON for a big meeting is fine for Haiku's context window).
- No streaming required - edit ops are synchronous and fast. Simple request-response.

---

## §4 Dependency Graph + Cascade Logic

### 4.1 The Graph

Every item in `StructuredAnalysis` participates in a directed graph via three field types:
- `depends_on`: array of item IDs this item waits for
- `blocks`: array of item IDs this item enables
- `references`: array of item IDs mentioned in this item's content (prose references)

When an item changes, the cascade logic traverses:
1. All items in `depends_on` (items this one depends on - their change may affect this item's validity)
2. All items that reference this item in their own `depends_on`, `blocks`, or `references` arrays (downstream dependents)
3. All deepdive sections whose `content` text mentions the changed item's previous value (e.g. action owner name that just changed)

### 4.2 Cascade Rules

**Action reassigned (e.g. owner changes from Tate to Kurt):**
- Flag all deepdive sections in `references` that mention the old owner name in their content (`review_reason: "Action {id} owner changed from {old} to {new} - phrasing may be stale"`)
- Flag all commitments referencing this action (`review_reason: "Action {id} owner changed"`)
- Flag no other actions unless they are in `depends_on` of the changed action

**Action removed:**
- All items (decisions, deepdive sections, commitments, risks) that have the removed action ID in their `depends_on` / `blocks` / `references` arrays get `needs_review=true` (`review_reason: "Referenced action {id} was removed"`)
- Cascade is immediate and synchronous - applied before the op returns.

**Two actions merged (source into target):**
- All items referencing `source_id` in their dependency arrays have `source_id` replaced with `target_id` atomically.
- `source_id` is marked retired (added to a `retired_ids` set on the structured analysis root).
- Retired IDs in references are silently cleaned up on next save.

**New deepdive section added:**
- No cascade needed. New items never cascade forward (nothing depends on something that just appeared).
- But: scan existing actions/decisions to see if any of them are clearly related by keywords (e.g. new section about "app + website" and there's an action about "build app"). If matches found, surface as a suggestion in the assistant's reply: "You may want to reference actions ai-004 and ai-011 in this section." The agent does NOT auto-link - it surfaces and waits.

**Decision updated (e.g. rationale rewritten):**
- Flag all items in `blocks` (items this decision enables) if the decision's `decision` text changed significantly (not just rationale).
- Flag deepdive sections in `references`.

**Participant renamed:**
- Cascade through ALL items: update `owner`, `decided_by`, `key_speakers`, `to_whom` fields that match the old name string exactly (case-insensitive). This is the one auto-applying cascade - names are structural, not prose references.
- Flag deepdive sections whose `content` contains the old name (prose content, not structured fields) for human review (`review_reason: "Participant renamed - content may still use old name"`)

### 4.3 Cascade Timing

**Immediate and synchronous on every edit op.** Do not batch until reanalysis. The reason: Tate needs to see cascade flags in the UI WHILE he's editing, so he can decide whether to address them now or later. Batching them until "done" hides the consequences of edits until the worst possible moment.

Cascade flags appear in:
1. The agent's reply message ("3 items flagged for review after that change.")
2. The UI's "Items needing review" counter (badge on the Editor tab)
3. The structured analysis object itself (`needs_review: true` on affected items)

**Tate can dismiss flags** via `clear_review_flag` op or by just saying "those are fine" in chat (agent calls `clear_review_flag` on each).

---

## §5 Reanalysis Pass

### 5.1 Triggers

Reanalysis runs when:
- Tate types a finalisation phrase: "done", "ready", "looks good", "send it", "reanalyse", "check it over", "that's it" (fuzzy match, not exact)
- Tate clicks the "Reanalyse" button in the UI explicitly
- 60s of no new messages in an active session AND `email_render.dirty=true` AND no items flagged `needs_review` (auto-trigger on apparent completion + clean state)

Reanalysis does NOT run:
- On every edit op (too slow, too expensive)
- If `needs_review` count > 0 (outstanding flags must be resolved first)
- If `email_render.dirty=false` and no `needs_review` items (nothing to check)

### 5.2 Process

```
POST /api/meetings/:id/reanalyse
```

1. Load `structured_analysis` + `transcript_text` + `analysis_json` (original) + edit history for context.
2. Build a consistency-check prompt (NOT the full original analysis prompt - this is faster and cheaper):

```
You are reviewing a meeting analysis that has been manually edited. Check for:
a) Internal consistency: does any action/decision contradict another?
b) Stale phrasing: do any deepdive sections reference owners, timelines, or facts that no longer match the corrected actions/decisions?
c) Summary accuracy: does the executive summary still accurately reflect the edited body?
d) Missing dependencies: are there actions that should depend on decisions that were added/changed?

Current structured analysis:
{structured_analysis_json}

Edit history (what changed):
{edit_ops_since_last_reanalysis}

Return JSON:
{
  "verdict": "green" | "issues",
  "issues": [
    { "item_id": "...", "issue": "...", "suggested_fix": "..." }
  ],
  "summary_accurate": boolean,
  "summary_suggested_revision": string | null
}
```

3. Parse response:
   - `verdict: "green"`: set `reanalysis_status='green'` on the session, enable Send button, render email.
   - `verdict: "issues"`: surface each issue as a follow-up message in the chat. The agent asks Tate to address them. Send button stays disabled.

4. Reanalysis result stored on the meeting_editor_session row (`reanalysis_status`, `reanalysis_ran_at`, `reanalysis_issues_json`).

### 5.3 Summary Revision

If `summary_accurate=false`, the reanalysis response includes `summary_suggested_revision`. The agent presents this as a suggested update: "The summary now says X but you changed Y to Z. Here's a revised version - want me to apply it?" Tate says yes/no; if yes, agent calls `update_summary`.

---

## §6 Email Render

### 6.1 Projection Model

`email_render` is a deterministic projection of `structured_analysis`. It is NOT generated by an LLM - it is templated from the structured state. The same structured state always produces the same email.

**`dirty` flag:** set to `true` whenever any field in `structured_analysis` changes. Set to `false` after a successful render.

**When render runs:**
1. Reanalysis green-light (`verdict: "green"`) triggers automatic render.
2. Explicit `POST /api/meetings/:id/render-email` from frontend (for manual re-render).
3. Render never runs while `dirty=false` (idempotent - skip if already current).

### 6.2 Render Function

`meetingEditorService.renderEmail(structuredAnalysis): string` - a pure function, no LLM call, no side effects.

The render function uses the same `buildAnalysisEmail()` shape as `meetings.js` currently does but reads from `structured_analysis` instead of `analysis_json + action_items_json`. This means the rendered email looks identical to what Tate already expects - same HTML template, same pill badges, same section order.

Internally: `actions` sorted P1 first, `decisions` listed in order, `deepdive_sections` rendered as the executive summary block + risks, etc. The mapping from structured schema to email sections:

| Email section | Source |
|---|---|
| Header / one-liner | `summary.one_line` |
| Action Items | `actions` (sorted by priority) |
| Key Decisions | `decisions` |
| Deep Dive | `summary.executive` + `risks` (severity:high) |

Stored result: `email_render.body_md` stores the rendered HTML (same field name, markdown in name but HTML in practice - match existing convention). `email_render.last_rendered_at` updates. `email_render.dirty` sets to `false`.

### 6.3 Email Send Gate

The Send button in the frontend checks:
1. `reanalysis_status === 'green'` on the active editor session
2. `email_render.dirty === false`
3. `needs_review` count === 0

All three required. If any fails, the button is disabled and a tooltip explains which gate is open.

---

## §7 Frontend Surface

### 7.1 Page Layout

**Route:** `/meetings/:id` - existing page. The Editor is a new tab added to the existing detail view.

**Tab layout (on MeetingDetail.tsx):**
```
[Transcript]  [Analysis]  [Editor]  [Email Sends]
```

Clicking "Editor" tab mounts the editor surface. Meeting context (title, date, client) persists in the page header - no duplication needed.

**"Editor" tab split-pane layout (two columns):**
```
+---------------------------+---------------------------+
|  EMAIL PREVIEW            |  CHAT                     |
|  (live HTML iframe)       |  (message thread)         |
|                           |                           |
|  [Status: 3 items need    |  Tate: "change owner of   |
|   review]                 |  ai-003 to Kurt"          |
|  [Reanalyse] [Send Email] |                           |
|                           |  Agent: Done. ai-003 now  |
|                           |  owned by Kurt. 2 items   |
|                           |  flagged for review (dd-  |
|                           |  002, com-001).           |
+---------------------------+---------------------------+
```

On mobile: vertical stack, email preview collapsed to a summary card at top, chat below.

### 7.2 Email Preview Panel (left)

- Renders `email_render.body_md` (HTML) in an `<iframe srcDoc={html}>` - same pattern as the inline HTML preview used elsewhere in EcodiaOS frontend.
- Updates live after each edit op that resolves (poll or websocket - polling every 3s is fine, same pattern as transcription status).
- Status bar above the preview:
  - `needs_review > 0`: amber badge "N items need review"
  - `email_render.dirty`: blue badge "Email out of date"
  - `reanalysis_status === 'green'` + `dirty === false`: green badge "Ready to send"
- Buttons: `[Reanalyse]` (disabled if needs_review > 0), `[Send Email]` (disabled until gate cleared)
- Send Email button opens a modal matching the existing email modal (to address, subject, optional note).

### 7.3 Chat Panel (right)

- Message thread with alternating user/assistant bubbles, same visual language as the rest of the EcodiaOS UI (dark background, subtle glass borders, matching the `GlassPanel` spatial component family).
- Input box at bottom: textarea, submit on Enter (shift-Enter for newline).
- Each assistant message that applied edits includes a compact "Changes applied" summary chip (e.g. "ai-003 owner: Tate → Kurt | 2 items flagged").
- Thread title: meeting title (e.g. "Co-Exist strategic 12 May").
- Switching to a different meeting navigates to `/meetings/:other-id` - different page entirely, different editor session. No cross-meeting bleed.

### 7.4 Status Indicators

Three persistent status indicators in the UI:
1. **"N items need review"** - amber, shows count from `needs_review=true` items. Clicking expands a drawer listing affected items by ID + review_reason.
2. **"Reanalysis pending"** - blue spinner, shown when reanalysis is in-flight (`POST /reanalyse` called, awaiting response).
3. **"Ready to send"** - green check, shown when all gates clear.

### 7.5 Component References

- Chat bubble layout: build new `MeetingEditorChat.tsx` component. Mirror the visual style of the osSession chat panel (dark bg, subtle user/assistant differentiation). The osSession chat in `pages/OS*.tsx` doesn't exist as a separate route - the chat is embedded in the main app shell. For the meeting editor, build a standalone scrollable message list + input component.
- Email preview iframe: `<iframe srcDoc={html} sandbox="allow-same-origin" className="w-full h-full rounded-lg border border-white/10" />`
- Status badges: reuse `components/shared/StatusBadge.tsx` (already exists).

---

## §8 Backend Surface

### 8.1 New Routes

All on the existing `/api/meetings` router in `src/routes/meetings.js`.

```
POST   /api/meetings/:id/editor/message    -- send message to editor agent
GET    /api/meetings/:id/editor/messages   -- fetch message history for active session
POST   /api/meetings/:id/reanalyse         -- trigger reanalysis pass
POST   /api/meetings/:id/render-email      -- force re-render email projection
GET    /api/meetings/:id/analysis          -- already exists; extend to return structured_analysis too
PATCH  /api/meetings/:id/structured-analysis -- emergency direct patch (admin use only)
```

**`POST /api/meetings/:id/editor/message` request:**
```json
{ "content": "change owner of ai-003 to Kurt" }
```

**Response (streaming not required):**
```json
{
  "message": { "id": "...", "role": "assistant", "content": "Done. ai-003 now owned by Kurt..." },
  "edit_ops_applied": [{ "op": "reassign_action", "args": { "id": "ai-003", "new_owner": "Kurt" } }],
  "cascade_flags": [{ "id": "dd-002", "type": "deepdive_section", "reason": "References old owner Tate" }],
  "needs_review_count": 2,
  "email_dirty": true
}
```

### 8.2 New Service: `meetingEditorService.js`

```javascript
// src/services/meetingEditorService.js

module.exports = {
  // Session management
  getOrCreateSession(meetingId, db),
  getMessages(sessionId, limit, db),

  // Core: invoke Haiku agent with tool use
  processMessage(meetingId, sessionId, userContent, db),

  // Edit ops - each mutates structured_analysis atomically
  applyEditOp(meetingId, op, args, db),  // calls _cascade() internally

  // Cascade
  _cascade(structuredAnalysis, changedItemId, op),  // pure function, returns flagged items

  // Reanalysis
  runReanalysis(meetingId, db),  // calls Opus, stores result

  // Email render
  renderEmail(structuredAnalysis),  // pure function, returns HTML string
  persistEmailRender(meetingId, html, db),
}
```

### 8.3 New DB Tables

```sql
-- meeting_editor_sessions (see §3.1 above)
-- meeting_editor_messages (see §3.1 above)

-- Edit audit log
CREATE TABLE meeting_analysis_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meeting_recordings(id),
  session_id uuid REFERENCES meeting_editor_sessions(id),
  edit_op text NOT NULL,
  args jsonb,
  affected_ids text[],
  cascade_flags jsonb,
  applied_by text NOT NULL DEFAULT 'tate',
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON meeting_analysis_edits (meeting_id, applied_at);
```

### 8.4 Migrations

Three migrations required:
1. `115_meeting_structured_analysis.sql` - add `structured_analysis jsonb`, `structured_analysis_version text`, `structured_analysis_migrated_at timestamptz` columns to `meeting_recordings`.
2. `116_meeting_editor_sessions.sql` - create `meeting_editor_sessions`, `meeting_editor_messages` tables.
3. `117_meeting_analysis_edits.sql` - create `meeting_analysis_edits` audit table.

Plus a one-off backfill script: `scripts/migrate-meetings-to-structured.js` - iterates all `meeting_recordings` where `analysis_status='done'` and `structured_analysis IS NULL`, maps `analysis_json + action_items_json` into the v1 schema, assigns IDs, sets `needs_review=false` on all items.

---

## §9 Implementation Phases

### Phase 1: Schema + Migration (fork 1)

**Scope:** DB migrations only. No new routes, no new service, no frontend changes.

Three SQL migration files (115, 116, 117). The backfill script `scripts/migrate-meetings-to-structured.js`. Backfill runs once; verified by querying `structured_analysis IS NOT NULL` count post-run.

**Deliverable:** All existing meetings with `analysis_status='done'` have `structured_analysis` populated. New meetings continue using the existing `analysis_json` path (Phase 2 will wire the structured-analysis write into `runAnalysis`).

**Fork brief shape:** "Run SQL migrations 115-117 against Supabase. Write and execute the backfill script. Verify row count. Do not touch routes or services."

### Phase 2: Editor Agent + Basic Edit Ops (fork 2)

**Scope:** `meetingEditorService.js` (processMessage + applyEditOp only, no cascade yet). New routes: `POST /editor/message`, `GET /editor/messages`. Wire `runAnalysis` to also write `structured_analysis` on analysis completion so new meetings get structured output automatically.

No cascade logic, no reanalysis, no email render. Editor messages work, edits apply, but downstream items are not flagged.

**Deliverable:** Tate can send a message like "change owner of ai-003 to Kurt" and the edit applies to `structured_analysis`. Verified by querying the column after a test message.

**Fork brief shape:** "Build meetingEditorService.js with session management, processMessage (Haiku tool use), and applyEditOp for all op types in §3.2. Add POST/GET /editor/* routes to meetings.js. Wire runAnalysis to write structured_analysis on completion. Unit test: send a test message, verify structured_analysis updates."

### Phase 3: Dependency Graph + Cascade (fork 3)

**Scope:** Add `_cascade()` to `meetingEditorService.js`. Update `applyEditOp` to call `_cascade` after each op. Return `cascade_flags` in the `/editor/message` response. All cascade rules from §4 implemented.

**Deliverable:** Reassigning an action owner correctly flags downstream deepdive sections. Removing an action correctly flags referencing decisions. Verified by integration test.

**Fork brief shape:** "Implement the cascade rules from §4 of the spec in meetingEditorService._cascade(). Integrate into applyEditOp. Cover all five cascade scenarios: reassign, remove, merge, add (no cascade but suggestion), decision update."

### Phase 4: Reanalysis Pass (fork 4)

**Scope:** `runReanalysis()` in `meetingEditorService.js`. `POST /api/meetings/:id/reanalyse` route. Adds `reanalysis_status`, `reanalysis_ran_at`, `reanalysis_issues_json` columns to `meeting_editor_sessions` (migration 118).

**Deliverable:** `POST /reanalyse` calls Opus, parses response, stores verdict. Returns `{ verdict, issues }`. Green verdict on a clean analysis with no outstanding flags.

**Fork brief shape:** "Implement runReanalysis in meetingEditorService.js. Add migration 118 for reanalysis columns on meeting_editor_sessions. Add POST /reanalyse route. Test: run reanalysis on a meeting with a clean structured_analysis, expect green verdict."

### Phase 5: Frontend Editor Page (fork 5 - manager fork recommended)

**Scope:** Frontend only. Split-pane Editor tab in `MeetingDetail.tsx`. `MeetingEditorChat.tsx` component. Email preview iframe. Status indicators. Sub-fork A: chat component + message routing. Sub-fork B: email preview panel + status badges + send gate.

**Deliverable:** `/meetings/:id` has an Editor tab. Chat works. Preview updates after edits. Status badges correct.

**Fork brief shape (manager):** "Build the Meeting Analysis Editor frontend. Split into two workers: worker A builds MeetingEditorChat.tsx (message list, input, bubble rendering, op-applied chips) and wires POST /editor/message; worker B builds the email preview panel (iframe + status badges + send gate + Reanalyse button) and wires to GET /meetings/:id/analysis. Manager merges both into a new Editor tab in MeetingDetail.tsx."

### Phase 6: Deterministic Email Render (fork 6)

**Scope:** `renderEmail()` pure function in `meetingEditorService.js`. `POST /render-email` route. Wire render to auto-run on reanalysis green-light. Update `email_render.dirty` tracking.

**Deliverable:** After a green-light reanalysis, `email_render.body_md` updates and `dirty` sets to false. The send modal pre-fills from `email_render` state.

**Fork brief shape:** "Implement renderEmail() in meetingEditorService.js. Map structured_analysis to the existing buildAnalysisEmail() HTML template shape. Add POST /render-email route. Auto-call after reanalysis verdict=green. Verify: dirty=false after green-light render."

---

## §10 Risks + Open Questions

### 10.1 Backfill Quality Risk (HIGH)

The backfill from `analysis_json + action_items_json` (flat blobs) to `structured_analysis` (ID-stable, graph-connected) is the riskiest part of Phase 1.

The raw `analysis_json` has arrays without stable IDs (e.g. `key_decisions`, `themes` have no `id` field). The backfill script must assign IDs sequentially. More critically, the `depends_on` / `blocks` / `references` dependency graph is entirely ABSENT in the existing data - there is no cross-reference information to migrate.

**Mitigation:** Backfill creates all items with empty dependency arrays (`depends_on: [], blocks: [], references: []`). The graph starts empty. Dependencies are populated as Tate edits and the agent infers them, or as future passes add them. This is acceptable for v1 - the cascade logic needs the graph to work well, but an empty graph just means no cascade fires on backfilled items until Tate or the agent adds refs. The reanalysis pass still works (it checks the structured content, not graph connectivity).

**Open question:** Should the backfill script attempt to infer `references` by fuzzy-matching action IDs in deepdive section content text? This would give the cascade logic something to work with immediately on backfilled meetings. Downside: false positives. Recommendation: opt-in, not default. Add a `--infer-refs` flag to the script.

### 10.2 Edit-Op Atomicity (MEDIUM)

If Tate sends a message, the agent applies 3 edit ops, and the process crashes between ops 1 and 2, `structured_analysis` is partially updated.

**Mitigation:** Each `applyEditOp` call in the service does a full JSONB column read-modify-write wrapped in a Postgres transaction. Multi-op turns should apply ALL ops in a single transaction (read current state, apply all ops sequentially in JS, write once). This is the right implementation even before the agent supports multi-op turns.

### 10.3 Haiku Model Cost Bound (LOW)

At $0.003 per message, a very active editor session of 100 messages costs $0.30. Across all meetings, this is negligible. No cost gate needed in v1.

One caveat: the system prompt injects the full `structured_analysis` JSON on every turn (input tokens). A large meeting (120KB of JSON) at Haiku input pricing (~$0.25/MTok) costs roughly $0.03 per turn in input tokens alone. Still fine, but if meeting analysis objects grow beyond ~500KB, consider a compressed summary context instead of full injection.

### 10.4 Meeting Scope Identity (LOW)

The agent must know it is operating on a specific meeting. The `meeting_id` is passed on every `/editor/message` request and injected into the system prompt. The agent has no ability to cross-reference or edit other meetings. This is enforced at the route level: `POST /meetings/:id/editor/message` scopes all tool calls to `:id`.

### 10.5 Concurrent Edit Race (LOW)

If Tate somehow has two browser tabs open to the same meeting editor (unlikely but possible), two messages could be in-flight simultaneously. Both would read the same `structured_analysis` state and produce conflicting writes.

**Mitigation:** The Postgres advisory lock approach: `SELECT pg_try_advisory_xact_lock(meeting_id_hash)` at the start of `applyEditOp`. If locked, queue the second write for 200ms and retry. Good enough for v1.

### 10.6 Reanalysis While Editing (LOW)

If Tate triggers reanalysis and then immediately sends another edit message, the reanalysis reads a state that is then modified by the edit.

**Mitigation:** Set a `reanalysis_in_flight` flag on the session row when reanalysis starts. The `/editor/message` route checks this flag and returns a friendly message: "Hold on - reanalysis is running (usually 20-30s). I'll apply your edit right after it finishes." Queue the message for execution post-reanalysis.

### 10.7 "Analysis" Tab Overlap (COSMETIC)

The existing `[Analysis]` tab in MeetingDetail shows the `analysis_json` / `action_items_json` tabbed view (Deep Dive / Actions / Decisions) from the `AnalysisView` component (commit 0f68f921). The new `[Editor]` tab shows the structured_analysis-backed editor.

These will briefly co-exist showing the same data from different sources. Long-term, the Analysis tab should read from `structured_analysis` if present. This is a Phase 5 or post-v1 cleanup. For now, document the divergence in the frontend component and add a "This view may differ from the editor if you've made edits" notice on the Analysis tab when `structured_analysis_migrated_at IS NOT NULL`.

### 10.8 v1 Non-Goal: Undo History

Tate can say "undo that" in chat and the agent can interpret it by looking at `edit_ops_applied` in the most recent assistant message and reversing the ops. This is NOT a database-level undo (no MVCC of structured_analysis versions). The agent reconstructs the reversal from the audit log. Good enough for v1. Full undo stack (with Ctrl+Z) is post-v1.

---

*Spec end. Build forks do not dispatch until Tate reviews.*  
*File: `/home/tate/ecodiaos/docs/specs/meeting-analysis-editor-spec-v1.md`*  
*Fork: fork_mp3btyep_c9d078*
