# Resonaverde Codebase Recon — 2026-05-11

Produced by fork `fork_mp0v8piv_d4bfc9`. Full end-to-end read of the codebase + live Supabase schema query.

---

## 1. ROUTE MAP

### Public Pages
| Route | File | Description |
|---|---|---|
| `/` | `src/app/page.tsx` → `src/app/HomePage.tsx` | Homepage with hero, about, services, quiz, booking, blog preview, newsletter signup, contact, footer |
| `/blog` | `src/app/blog/page.tsx` → `src/app/blog/ClientPage.tsx` | Blog listing — all posts, 3-column grid, newest first |
| `/blog/[slug]` | `src/app/blog/[slug]/page.tsx` → `src/app/blog/[slug]/ClientPage.tsx` | Individual post page, renders `content` via `dangerouslySetInnerHTML` |
| `/unsubscribe` | `src/app/unsubscribe/page.tsx` → `ClientPage.tsx` | Token-based unsubscribe page |
| `/login` | `src/app/login/page.tsx` → `ClientPage.tsx` | Email + password login (Supabase Auth) |
| `/privacy-policy` | `src/app/privacy-policy/page.tsx` | Static legal page via `LegalPage` component |
| `/terms` | `src/app/terms/page.tsx` | Static legal page |

### Admin Pages (auth-gated)
| Route | File | Description |
|---|---|---|
| `/admin/write` | `src/app/admin/write/ClientPage.tsx` | Post composer + email blast panel |
| `/admin/copy` | `src/app/admin/copy/ClientPage.tsx` | Site copy, design tokens, quiz config editor |
| `/admin/subscribers` | `src/app/admin/subscribers/page.tsx` | Subscriber list with filter + pagination + manual unsubscribe |

### API Routes
| Route | Method(s) | Description |
|---|---|---|
| `/api/subscribe` | POST | Upsert subscriber record (email, source, status='active', token) |
| `/api/unsubscribe` | GET/POST | Token-based unsubscribe (sets status='unsubscribed') |
| `/api/newsletter/auto-send` | POST `{postId}` | One-shot: create campaign + send to all active subscribers immediately |
| `/api/newsletter/create-draft` | POST `{postId}` | Create draft campaign row for a post (or return existing draft) |
| `/api/newsletter/send` | POST `{campaignId}` | Send existing campaign to all active subscribers |
| `/api/newsletter/send-test` | POST `{campaignId, toEmail}` | Send test email to a single address |
| `/api/newsletter/subscriber-count` | GET | Returns `{ok, count}` of active subscribers |
| `/api/newsletter/subscribers` | GET, DELETE | List subscribers (paginated, filterable) + manual unsubscribe by ID |

### Other
| File | Purpose |
|---|---|
| `src/app/sitemap.ts` | Dynamic sitemap — queries posts table |
| `src/app/robots.ts` | Robots.txt |
| `src/proxy.ts` | (Unknown/minimal — likely middleware proxy stub) |

---

## 2. ADMIN AREA

### Auth Mechanism
- **Login**: `/login` uses `supabase.auth.signInWithPassword({ email, password })` — standard Supabase email/password auth.
- **Session check**: `/admin/write/ClientPage.tsx` checks `supabase.auth.getSession()` on mount; redirects to `/login` if no session.
- `/admin/copy/ClientPage.tsx` checks `supabase.auth.getUser()` and renders a MagicLink form if no session (so `/admin/copy` has a second auth path: magic link via `supabase.auth.signInWithOtp`).
- `/admin/subscribers/page.tsx` has no explicit auth check — relies on Supabase RLS or the fact that the subscribers API uses service role (but the page itself is not protected — anyone can navigate there, though the API queries will fail without auth for direct Supabase queries).
- `site_editors` table exists in the schema (one column: `email`) — likely for RLS policies but no code reads from it at the app level.
- **Logout**: `supabase.auth.signOut()` in sidebar footer of `/admin/write`.

### What Each Admin Page Does

**`/admin/write`** — 3-panel layout:
1. Left sidebar (library): list of all posts, newest first. Click to load into editor. × to delete. "Set Featured" toggle. "New Post" button clears workspace.
2. Centre (workshop): Title input, excerpt textarea, TipTap rich-text editor (loaded via dynamic import, no SSR), image grid with file upload.
3. Right panel (newsletter/megaphone): Shows subscriber count. Per-post campaign state machine: "Prepare Email Blast" button → subject/intro editor → Save Draft / Send Test / Send to Everyone.

**`/admin/copy`** — 3-tab sidebar + main editor:
- **Copy tab**: Edit all static site text (hero subtitle, about, services, booking, blog, newsletter, contact, footer/branding). Each field can be typed as `title/heading/body` affecting which HTML element renders on the homepage.
- **Design tab**: Edit theme tokens (colors palette, typography, buttons, layout/spacing, header, hero, cards, footer, links). Live preview widgets for buttons, typography, colors.
- **Quiz tab**: Build/edit the homepage quiz (enabled toggle, title, intro, questions with scored options, outcomes with min/max score ranges and optional CTA).

**`/admin/subscribers`**:
- Table of all subscribers (email, status, subscribed date).
- Filter by All / Active / Unsubscribed.
- Paginated (50/page).
- Admin can manually unsubscribe active users (sets status='unsubscribed' via DELETE `/api/newsletter/subscribers`).

---

## 3. POST SYSTEM

### Storage
**Table:** `posts`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid | gen_random_uuid() | PK |
| `title` | text | — | Required |
| `slug` | text | — | Auto-generated from title via `slugify()` on save |
| `excerpt` | text | NULL | Optional preview text |
| `content` | text | — | HTML string from TipTap editor |
| `image_urls` | text[] | `{}` | Array of Supabase Storage public URLs |
| `created_at` | timestamptz | now() | — |
| `author_id` | uuid | — | Supabase Auth user ID |
| `is_featured` | boolean | false | Only one featured post at a time (enforced in app logic, not DB constraint) |

### Create Flow
1. Admin fills title, excerpt, body in `/admin/write`.
2. Clicks "Save": `savePost()` runs.
3. New files uploaded to Supabase Storage bucket `blog` at path `{userId}/{randomUUID}`. Public URLs appended to `finalUrls`.
4. Content extracted via `editorRef.current.getHTML()` (TipTap ref, avoids stale closure bug).
5. Slug generated from title via `slugify()`.
6. `supabase.from("posts").insert({...})` (or `.update()` if editing).
7. If new post: `triggerAutoSend(data[0].id)` called immediately — fires `POST /api/newsletter/auto-send`.

### Public Fetch
- **Homepage**: `supabase.from("posts").select(...)` directly from browser client using anon key. Fetches featured post (`is_featured=true`) and up to 6 recent posts separately.
- **Blog listing** (`/blog`): Same client-side fetch, all posts ordered newest-first, no limit.
- **Blog post** (`/blog/[slug]`): `supabase.from("posts").select(...).eq("slug", slug).maybeSingle()`.
- **Sitemap**: Server-side fetch (presumably), queries posts for slugs.

All public reads use the **browser client** (anon key, `supabaseClient.ts`) — depends on Supabase RLS allowing public read on `posts`. No server-side rendering/ISR for post pages currently.

---

## 4. EMAIL BLAST SYSTEM

### Full Flow: Auto-Send (new post publish)

```
savePost() [ClientPage.tsx:195]
  → triggerAutoSend(postId) [ClientPage.tsx:201]
    → POST /api/newsletter/auto-send { postId }
      1. Load post from DB
      2. Guard: check newsletter_campaigns WHERE post_id=postId AND status='sent' → 409 if exists
      3. Load all active subscribers
      4. Load site_theme rows (for branded email)
      5. Build HTML: buildNewsletterHtml({post, subject, preheader, intro_md:"", siteBrand, siteUrl, theme})
      6. INSERT newsletter_campaigns { post_id, subject, preheader, intro_md:null, body_html, status:'sending' }
      7. Resend batch.send() in chunks of 100
         - Each email: replace {{UNSUBSCRIBE_URL}} with subscriber-specific token URL
         - Headers: X-Entity-Ref-ID, List-Unsubscribe, List-Unsubscribe-Post
      8. INSERT newsletter_sends rows (one per subscriber: campaign_id, subscriber_id, email, resend_id, status)
      9. UPDATE newsletter_campaigns SET status='sent', sent_at=now()
      → Returns { ok, campaignId, sent, failed }
```

### Full Flow: Manual Email Blast (prepare → edit → send)

```
"Prepare Email Blast" button [ClientPage.tsx:228]
  → POST /api/newsletter/create-draft { postId }
    - Load post
    - If draft/error campaign already exists for postId → return existing campaignId
    - Build HTML (NO THEME — bug, see Section 7)
    - INSERT newsletter_campaigns { status:'draft', body_html }
    → Returns { ok, campaignId }

Admin edits subject + intro in Newsletter panel
  → saveNewsletter() [ClientPage.tsx:254]
    → supabase.update({ subject, intro_md }).eq("id", openCampaignId)
    (Note: body_html is NOT updated here — only subject and intro_md)

"Go" (test send) [ClientPage.tsx:267]
  → POST /api/newsletter/send-test { campaignId, toEmail }
    - Load campaign (gets current subject, intro_md)
    - Load post
    - Build HTML fresh with current intro_md (NO THEME — bug)
    - Replace {{UNSUBSCRIBE_URL}} with siteUrl/unsubscribe (non-personalised for test)
    - Save compiled body_html back to campaign
    - resend.emails.send() single email
    → Returns { ok, id }

"Send to Everyone" button [ClientPage.tsx:280]
  → POST /api/newsletter/send { campaignId }
    - Load campaign (gets current subject, intro_md)
    - Guard: return 400 if already sent
    - Mark status='sending'
    - Load post
    - Load subscribers (active only)
    - Build HTML fresh with current intro_md (NO THEME — bug)
    - Save compiled body_html to campaign
    - Resend batch.send() in chunks of 100
    - INSERT newsletter_sends rows
    - UPDATE campaign status='sent', sent_at=now()
    → Returns { ok, sent, failed }
```

### Key Components
- **`src/lib/newsletter/template.ts`** — `buildNewsletterHtml()`: builds inline-styled HTML email from post + optional theme map. Handles Google Fonts import for email clients that support it. Uses `{{UNSUBSCRIBE_URL}}` placeholder replaced per-subscriber at send time.
- **`src/lib/newsletter/triggerAutoSend.ts`** — helper wrapper that calls `/api/newsletter/auto-send` from client or server. Currently only called from `savePost()` in ClientPage.
- **`src/lib/newsletter/siteUrl.ts`** — `getSiteUrl()`: prefers `NEXT_PUBLIC_SITE_URL`, falls back to `VERCEL_URL`, then `localhost:3000`.
- **Resend SDK**: Used for all email delivery. Env vars: `RESEND_API_KEY`, `NEWSLETTER_FROM`.

### Env Vars Required
```
RESEND_API_KEY
NEWSLETTER_FROM          # e.g. hello@resonaverde.com.au
NEXT_PUBLIC_SITE_URL     # e.g. https://resonaverde.com.au
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

## 5. FILE/IMAGE HANDLING

### Upload Flow
1. Admin selects files via `<input type="file" multiple>` in the Post Images section.
2. Files stored in component state `files: File[]`.
3. On `savePost()`: for each file in `files`, upload to Supabase Storage:
   ```ts
   const path = `${userData.user.id}/${crypto.randomUUID()}`;
   await supabase.storage.from("blog").upload(path, file);
   const { data } = supabase.storage.from("blog").getPublicUrl(path);
   finalUrls.push(data.publicUrl);
   ```
4. `finalUrls` (existing URLs + new URLs) saved to `posts.image_urls`.

### Storage Bucket
- Bucket name: `blog`
- Path format: `{supabaseUserId}/{uuid}` (no extension, raw UUID)
- URL format: `https://dxtglcfyqvhmmnopshhp.supabase.co/storage/v1/object/public/blog/{userId}/{uuid}`
- Files are public (no signed URLs).

### Delete Bug (see Bug 2)
The "×" button on existing images calls:
```ts
setExistingImages(prev => prev.filter(u => u !== url))
```
This removes the URL from React state and on next save, the URL is omitted from `posts.image_urls`. **The actual file in Supabase Storage is never deleted.** Storage accumulates orphaned files permanently.

### Email Images
- Newsletter template uses `opts.post.image_urls?.[0]` as the hero image.
- Image rendered inline in email as `<img src="..." style="width:100%; border-radius:...px; margin-top:14px;" />`.
- First image only is used in emails.

---

## 6. EXISTING DB SCHEMA

Live query against `dxtglcfyqvhmmnopshhp` on 2026-05-11.

### `posts`
| Column | Type | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | NO |
| title | text | — | NO |
| slug | text | — | NO |
| excerpt | text | — | YES |
| content | text | — | NO |
| image_urls | text[] | `{}` | NO |
| created_at | timestamptz | now() | NO |
| author_id | uuid | — | NO |
| is_featured | boolean | false | NO |

### `newsletter_campaigns`
| Column | Type | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | NO |
| post_id | uuid | — | YES |
| subject | text | — | NO |
| preheader | text | — | YES |
| intro_md | text | — | YES |
| body_html | text | — | NO |
| status | text | 'draft' | NO |
| created_at | timestamptz | now() | NO |
| sent_at | timestamptz | — | YES |

Status values observed in code: `draft`, `sending`, `sent`, `error`

### `newsletter_sends`
| Column | Type | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | NO |
| campaign_id | uuid | — | NO |
| subscriber_id | uuid | — | NO |
| email | text | — | NO |
| resend_id | text | — | YES |
| status | text | 'queued' | NO |
| error | text | — | YES |
| created_at | timestamptz | now() | NO |

Status values: `queued` (default), `sent`, `failed`

### `subscribers`
| Column | Type | Default | Nullable |
|---|---|---|---|
| id | uuid | gen_random_uuid() | NO |
| email | text | — | NO |
| created_at | timestamptz | now() | NO |
| source | text | 'homepage' | NO |
| status | text | 'active' | NO |
| token | text | — | NO |
| unsubscribed_at | timestamptz | — | YES |

Status values: `active`, `unsubscribed`

### `site_copy`
| Column | Type | Default | Nullable |
|---|---|---|---|
| key | text | — | NO |
| value | text | '' | NO |
| updated_at | timestamptz | now() | NO |

Keys are free-form strings (e.g. `hero_subtitle`, `section_about_title`, `contact_email`, etc.). Full key list is defined in `COPY_GROUPS` array in `/admin/copy/ClientPage.tsx`.

### `site_theme`
| Column | Type | Nullable |
|---|---|---|
| key | text | NO |
| value | text | NO |

Keys defined in `THEME_GROUPS` in `/admin/copy/ClientPage.tsx` (colors, fonts, sizes, buttons, layout, header, hero, cards, footer, links).

### `site_editors`
| Column | Type | Nullable |
|---|---|---|
| email | text | NO |

One column, likely used for Supabase RLS policy to gate admin write access to posts/site_copy/site_theme tables. No application-level code reads this table.

### `quiz_config`
| Column | Type | Default | Nullable |
|---|---|---|---|
| id | integer | 1 | NO |
| config | jsonb | `{}` | NO |
| updated_at | timestamptz | now() | YES |

Single-row table (id=1). Stores full quiz configuration as JSON blob (`QuizConfig` shape: `{enabled, title, intro, questions[], outcomes[]}`).

---

## 7. BUG 1 ANALYSIS — Email Blast Preview Bug

### The Bug

**The manual email blast path does not apply the site theme to emails.** The auto-send path (triggered on new post publish) loads `site_theme` rows and passes them to `buildNewsletterHtml()`. The manual paths (`create-draft`, `send`, `send-test`) do NOT load or apply the theme.

**Secondary bug**: There is no email preview UI in the admin. Angelica cannot see what the email will look like before sending. The only preview mechanism is "Test Send" — but even that sends without theme colors/fonts applied.

### Exact Lines

**`/api/newsletter/create-draft/route.ts` lines 44-52:**
```ts
const html = buildNewsletterHtml({
  post,
  subject,
  preheader,
  intro_md: "",
  siteBrand: "Resonaverde",
  siteUrl,
  // ← NO theme: parameter missing entirely
});
```

**`/api/newsletter/send/route.ts` lines 128-135:**
```ts
const baseHtml = buildNewsletterHtml({
  post,
  subject: campaign.subject,
  preheader: campaign.preheader,
  intro_md: campaign.intro_md,
  siteBrand: "Resonaverde",
  siteUrl,
  // ← NO theme: parameter missing
});
```

**`/api/newsletter/send-test/route.ts` lines 67-74:**
```ts
const baseHtml = buildNewsletterHtml({
  post,
  subject: campaign.subject,
  preheader: campaign.preheader,
  intro_md: campaign.intro_md,
  siteBrand: "Resonaverde",
  siteUrl,
  // ← NO theme: parameter missing
});
```

**Compare with `/api/newsletter/auto-send/route.ts` lines 138-156:**
```ts
let theme: Record<string, string> = {};
const { data: themeRow } = await supabase
  .from("site_theme")
  .select("*")
  .limit(1)
  .maybeSingle();
if (themeRow) {
  theme = themeRow as any;
}
const baseHtml = buildNewsletterHtml({
  post, subject, preheader, intro_md: "", siteBrand: "Resonaverde", siteUrl, theme,
});
```

**Note:** The auto-send theme query is also slightly wrong — it uses `.limit(1).maybeSingle()` which returns a single row object, not a key→value map. The `site_theme` table stores one key-value pair per row, so this approach returns one row instead of all theme values. The correct query should be `.select("key,value")` without `.limit(1).maybeSingle()`, then reduce to a map. This means even auto-send emails don't correctly apply the full theme.

### Proposed Fix

**1. Add a shared `getTheme()` helper to `src/lib/newsletter/getTheme.ts`:**
```ts
import { getServiceSupabase } from "@/lib/supabaseService";

export async function getTheme(): Promise<Record<string, string>> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("site_theme").select("key,value");
  if (!data) return {};
  const theme: Record<string, string> = {};
  for (const row of data as { key: string; value: string }[]) {
    if (row.value) theme[row.key] = row.value;
  }
  return theme;
}
```

**2. In `create-draft/route.ts`, `send/route.ts`, `send-test/route.ts`, and `auto-send/route.ts`:**
```ts
import { getTheme } from "@/lib/newsletter/getTheme";
// ...
const theme = await getTheme();
const baseHtml = buildNewsletterHtml({
  post, subject, preheader, intro_md: campaign.intro_md,
  siteBrand: "Resonaverde", siteUrl, theme,
});
```

**3. Optional — email preview UI**: Add a "Preview" button in the newsletter panel that renders the current campaign's `body_html` in an iframe or opens it in a new tab. Fetch the body_html from the campaign row (already in the campaigns state) and display it. No backend changes needed — use a `data:text/html` blob URL or an inline iframe with srcDoc.

---

## 8. BUG 2 ANALYSIS — Delete File From Post

### The Bug

When admin clicks the × button on an image in the Post Images grid, the URL is removed from `existingImages` state. On the next `savePost()`, the filtered URL is not included in `finalUrls`, so the DB record is updated correctly. **However, the file in Supabase Storage is never removed.** It becomes an orphaned file consuming storage forever.

### Exact Location

**`/admin/write/ClientPage.tsx` line 388:**
```ts
<button onClick={() => setExistingImages(prev => prev.filter(u => u !== url))} style={styles.imgDelete}>×</button>
```

There is no corresponding storage deletion call anywhere.

### Proposed Fix

**Option A: Delete at time of × click (immediate, simple)**

Change the button handler in ClientPage.tsx:
```ts
async function removeImage(url: string) {
  // Extract storage path from public URL
  // URL format: https://{project}.supabase.co/storage/v1/object/public/blog/{userId}/{uuid}
  const path = url.split("/storage/v1/object/public/blog/")[1];
  if (path) {
    await supabase.storage.from("blog").remove([path]);
  }
  setExistingImages(prev => prev.filter(u => u !== url));
}
```

Replace line 388 with:
```ts
<button onClick={() => removeImage(url)} style={styles.imgDelete}>×</button>
```

**Caveat**: If admin removes an image but then doesn't save the post, the image is deleted from storage but still referenced in the DB. To be safe, track "pendingDeletes" and only execute storage deletes at `savePost()` time:

**Option B: Delete at save time (safer)**

```ts
const [pendingDeleteUrls, setPendingDeleteUrls] = React.useState<string[]>([]);

// On × click: mark for deletion, remove from state
function markImageForDelete(url: string) {
  setPendingDeleteUrls(prev => [...prev, url]);
  setExistingImages(prev => prev.filter(u => u !== url));
}

// In savePost(), after updating DB:
for (const url of pendingDeleteUrls) {
  const path = url.split("/storage/v1/object/public/blog/")[1];
  if (path) await supabase.storage.from("blog").remove([path]);
}
setPendingDeleteUrls([]);
```

Option B is recommended — it prevents orphaned storage files while also protecting against accidental deletion when the admin cancels without saving.

---

## 9. FEATURE 3 GAPS — Draft + Scheduled Publishing

### What Exists Now
No draft/schedule concept. Every post saved via `savePost()` is immediately visible on the public blog (no status filtering on public queries). Auto-send fires on new post creation.

### Schema Changes Needed

**Migration for `posts` table:**
```sql
ALTER TABLE posts
  ADD COLUMN status text NOT NULL DEFAULT 'published',
  ADD COLUMN scheduled_at timestamptz NULL;

-- Existing posts should stay published
UPDATE posts SET status = 'published' WHERE status IS NULL;

-- Optional index for scheduler query
CREATE INDEX idx_posts_scheduled ON posts (scheduled_at) WHERE status = 'scheduled';
```

Status values: `'draft'` | `'published'` | `'scheduled'`

### UI Changes (admin/write/ClientPage.tsx)

1. Add status selector to the editor toolbar or field area:
   ```
   [Draft] [Published] [Scheduled ▼] → shows datetime picker when 'scheduled'
   ```
2. Pass `status` and `scheduled_at` in the `savePost()` payload.
3. On sidebar list: show status badge next to post title (grey=draft, green=published, blue=scheduled).
4. Auto-send should only fire when `status='published'` (or on schedule fire). Currently it fires on every new post insert.

### Public Query Changes

In `HomePage.tsx` and `blog/ClientPage.tsx` and `blog/[slug]/ClientPage.tsx`, add filter:
```ts
.filter("status", "eq", "published")
// OR: filter WHERE status='published' OR (status='scheduled' AND scheduled_at <= now())
```

For the blog slug page, a draft post should 404 (return "Post not found") rather than show content.

### Auto-Publish Mechanism

Two options:

**Option A: Vercel Cron Job (recommended)**
- Add `vercel.json` with cron config:
  ```json
  {
    "crons": [{
      "path": "/api/cron/publish-scheduled",
      "schedule": "*/5 * * * *"
    }]
  }
  ```
- Create `src/app/api/cron/publish-scheduled/route.ts`:
  ```ts
  export async function GET(req: Request) {
    // Verify Vercel cron auth header: CRON_SECRET
    // Query: SELECT id FROM posts WHERE status='scheduled' AND scheduled_at <= NOW()
    // For each: UPDATE posts SET status='published' WHERE id=...
    // Then call triggerNewsletterAutoSend(postId) for each
  }
  ```
- Env var: `CRON_SECRET` for verification.

**Option B: Client-side trigger on page load**
- On each admin load, check for overdue scheduled posts. Less reliable.

### Auto-Send Integration Change

Currently `savePost()` calls `triggerAutoSend()` on every new post. With drafts, change to only call auto-send when the post transitions to `status='published'`:
```ts
if (isNewPost && data?.[0] && data[0].status === 'published') {
  triggerAutoSend(data[0].id);
}
```
The cron job handles auto-send for scheduled posts when they publish.

---

## 10. FEATURE 4 GAPS — Gated Resources

### What Exists Now
Nothing. No resources table, no access control, no download mechanism.

### Schema Changes Needed

```sql
CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_path text NOT NULL,         -- Supabase Storage path in 'resources' bucket
  file_name text NOT NULL,         -- Original filename for download
  file_size_bytes bigint,
  requires_subscription boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_published boolean NOT NULL DEFAULT true
);
```

No separate `resource_access` table needed for MVP — gating is binary: active subscriber OR not.

**Supabase Storage**: Create a new private bucket `resources` (RLS-disabled, no public access). Files accessed only via signed URLs generated server-side after subscriber check.

### Routes Needed

**`/api/resources/[id]/download` (GET)**
```
1. Read ?email=... query param OR subscriber_token cookie
2. Check subscribers table: status='active' WHERE token=token OR email=email
3. If not active subscriber: return 403 JSON { ok: false, error: "Subscribe to access" }
4. Load resource row: get file_path
5. Generate signed URL: supabase.storage.from("resources").createSignedUrl(file_path, 300)
6. Return 302 redirect to signed URL
```

**`/api/resources` (GET)** — list published resources (public, no auth needed — just title/description, not the actual file).

**`/api/admin/resources` (GET, POST, DELETE)** — admin CRUD, protected by auth session check.

### UI Changes

**Public resource listing page** (`/resources`):
- List all `is_published=true` resources with title, description.
- Download button: if subscriber (check via cookie), link to `/api/resources/[id]/download?token={token}`. If not subscriber, show "Subscribe to access" with scroll-to-newsletter CTA.

**Subscriber token persistence**: On successful subscription (`/api/subscribe`), set a long-lived cookie `subscriber_token={token}`. This allows gate checks on subsequent visits without re-entering email. The cookie approach is low-friction but not high-security (token in cookie can be shared). Acceptable for a content gate.

**Admin resource management** (add to `/admin/copy` or new `/admin/resources`):
- Upload file to Supabase Storage `resources` bucket.
- Create resource row with title, description, file path.
- Toggle published/unpublished.

### Summary of New Files/Changes for Feature 4
- DB migration: `resources` table
- Supabase: new private `resources` storage bucket
- `src/app/api/resources/route.ts` — public list
- `src/app/api/resources/[id]/download/route.ts` — gated download
- `src/app/api/admin/resources/route.ts` — admin CRUD
- `src/app/resources/page.tsx` + `ClientPage.tsx` — public resource listing
- `src/app/admin/resources/page.tsx` + `ClientPage.tsx` — admin management UI
- `/api/subscribe/route.ts` — add `Set-Cookie` header on success
- `src/lib/resourceAccess.ts` — shared helper: extract token from request, check DB

---

## 11. RISKS

### Schema Migrations
- No migration tooling visible (no `/migrations` folder, no Prisma schema). Schema changes must be applied manually via Supabase dashboard SQL editor or the Supabase Management API. Risk: no version-controlled migration history. Mitigation: document every SQL change here + apply carefully.

### Breaking Public Queries on Status Addition (Feature 3)
- Adding `status` column with `DEFAULT 'published'` on existing rows is safe. BUT: all public-facing Supabase queries (`select().from("posts")`) in `HomePage.tsx`, `blog/ClientPage.tsx`, `blog/[slug]/ClientPage.tsx` currently fetch without filtering by status. After migration, new draft posts will be publicly visible until code is deployed. Deploy migration and code change in same Vercel deployment. Risk window: deployment gap.

### Auto-Send Firing Twice (Feature 3)
- Currently `savePost()` fires auto-send on every new post insert. With scheduling, if the cron job also fires auto-send when a scheduled post publishes, there's a double-send risk. Mitigation: the `auto-send` route already guards against double-send via the 409 check (`status='sent'` campaign exists). This guard is robust.

### Supabase RLS on Posts Table
- Public reads of posts from browser client use the anon key. If RLS is not configured to allow anon `SELECT` on `posts`, the public blog will be broken. No code changes can fix this — must be verified in Supabase dashboard. Current site appears to work, so RLS presumably allows public read. Adding `status` column filter requires that the RLS policy doesn't break on the new column.

### Email Theming Bug Severity (Bug 1)
- Emails sent via "auto-send" ALSO have a theme bug (uses `.limit(1).maybeSingle()` which returns one row instead of all theme rows). This means brand colors/fonts are NOT applied in any outgoing emails currently. The fix must cover all 4 routes.

### Storage Orphan Accumulation (Bug 2)
- Without fixing the storage delete bug, every time a post's image is removed via the admin and the post saved, one file permanently accumulates in the `blog` bucket. On Supabase free tier there's a 1GB storage limit. Low urgency but should be fixed.

### Subscriber Token Cookie (Feature 4 gating)
- Setting a long-lived cookie with the subscriber token means anyone who gets access to the token (e.g. via shared computer, forwarded URL) can access gated resources. For Resonaverde's use case (coaching content gate) this is likely acceptable. Not for high-value IP.

### No Server-Side Rendering on Post Pages
- All post fetching is client-side (browser fetches from Supabase anon). This means post pages have no meaningful SEO (no server-rendered content). The sitemap provides URLs, but Googlebot must render JS to see content. For a coaching business this may matter for SEO. Not a blocker for the 4 work items but worth noting.

### Vercel Cron Availability (Feature 3)
- Vercel cron jobs require Vercel Pro plan ($20/mo) or Hobby (free but limited to 2 crons, and not available on the free tier in all regions). If project is on Hobby, may need upgrade for the publish-scheduled cron. Alternative: use a 3rd-party cron (cron-job.org free tier) hitting the Vercel endpoint.

### `NEXT_PUBLIC_SITE_URL` Must Be Set
- `getSiteUrl()` falls back to `VERCEL_URL` if `NEXT_PUBLIC_SITE_URL` is not set. `VERCEL_URL` is the deployment subdomain (e.g. `resonaverde-abc123.vercel.app`), not the custom domain. If this env var is unset, all unsubscribe links in emails will point to the Vercel deployment URL, not `resonaverde.com.au`. This is likely already set in Vercel env vars but must be verified.

---

*End of recon. File written by fork `fork_mp0v8piv_d4bfc9` at ~/ecodiaos/drafts/resonaverde-recon-2026-05-11.md*
