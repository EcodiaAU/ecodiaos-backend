---
triggers: marketing-post, social-post, zernio-post, content-generation, post-primitives, visual-generation, instagram-post, linkedin-post, facebook-post, google-business-post, post-media, post-input, app-screenshot, founder-content, impact-org-marketing, marketing-cadence, periodic-publishing, post-value, marketing-doctrine, zernio-cap-reset, monthly-content-plan, gemini-image-generation, html-svg-mockup, carousel-slides, post-cta, ecodia-audience
codified: 2026-05-16
origin: Tate verbatim 2026-05-16 (Brisbane, 14:xx AEST)
---

# Marketing post primitives and generation doctrine

Every Ecodia social post must deliver explicit value to the viewer, target impact organisations that need bespoke software, and be authored from primitives the conductor can generate autonomously. No post ships without a value-type, an audience-segment, and a media primitive.

## Audience

**Target:** impact organisations that need custom software, sites, or apps. Worked examples to anchor on:

- Landcare Australia
- Tangaroa Blue Foundation
- Project Hiu
- Wild Mountains
- Peak bodies aggregating sub-commercial conservation projects (see `carbon-mrv-wedge-peak-body-sub-commercial.md`)
- State/national NRM bodies, large NFPs running technology-touching programs, conservation funders running grant portals

**Do not target:** individual consumers, generic startups, untyped SMBs, "anyone who needs a website." Audience-drift in copy = post is rewritten or killed.

The voice should land for a Program Manager / Executive Director / Tech Lead inside one of those orgs, not for a tech-bro Twitter feed.

## What we can honestly claim (the substantiation rule)

Every claim in copy must be checkable against a substrate. If you can't link to evidence, you can't say it.

**Honest evidence base (use these):**

1. **EcodiaOS-as-business operational story.** Real and verifiable: commit volume, doctrine corpus size, Wyoming DAO LLC ID, on-chain governance contract, the peer-paradigm architecture (VPS substrate at 100.103.227.90 + Corazon as dedicated conductor body at 100.114.219.69). Hardware claims must reflect current state - the legacy "$24/mo single droplet" framing is stale; current truth is a cheaper VPS plus a dedicated machine.
2. **Doctrine corpus as content.** Each of the 200+ pattern files in `~/ecodiaos/patterns/` is a small piece of insight grounded in a real operational failure. "Pattern of the week" is a sustainable recurring lane.
3. **Carbon-MRV / peak-body thesis AS THESIS.** Frame it as our take ("here's why we think this gap exists, here's what we'd want to see filled"), never as portfolio ("we built one"). We have no peak-body client work to point to yet.

**Off-limits in marketing copy (do not say):**

- **Co-Exist.** Not ours to publicise. Belongs to Kurt. No posts, no mentions, no @ tags, no "currently shipping," no "our app," no implied attribution. Stays off our channels until Kurt gives explicit go-ahead on specific framing. (Per `coexist-vs-platform-ip-separation.md`.)
- **Client work or pipeline.** No "currently shipping client work," no "quiet pipeline," no "client builds we'll share later." If we don't have an authorised, named, specific case study we can link to today, we don't allude to one.
- **Capability claims dressed as service.** No "we build X for Y orgs" unless we have a shipped X for a real Y. The "5 things we'd build for a peak body" failure mode: speculation packaged as service offer.
- **Unverified factual claims.** Beta dates, launch dates, signup flows, headcount, revenue, client names. Verify against substrate before posting. No "comment 'beta' for early access" without a real signup flow on the other end.
- **Sentimental brand mood with no value.** "Built on the Sunshine Coast for the orgs protecting it" carries no insight/evidence/story/service-offer/demo. Kill.
- **Generic positioning copy.** "We sit in the gap between off-the-shelf and bespoke" reads as marketing fluff; replace with the specific evidence behind the claim.

**Test before posting:** for each sentence in the draft, ask "what substrate does this come from?" If the answer is "it sounded right" rather than "this commit / this pattern file / this Decision node / this public document," cut it.

## No pattern-matching to other accounts

Do not study other accounts to learn the voice. Do not write reference-account analyses. Do not look at "what good LinkedIn looks like." All of those produce borrowed shapes.

Ecodia is a legally novel entity (AI-managed Wyoming DAO LLC, first of its kind in practice). The substrate is unusual. Marketing shapes that work for normal businesses make us sound less interesting, not more. The voice has to be invented from what we actually are, every time, with no external template.

If a draft sentence could appear unchanged on three other studios' LinkedIn accounts, it is a borrowed shape and gets cut.

## Goal and cadence

**Goal:** flood the small, specific audience of impact-organisation decision-makers (a few hundred people in Australia: EDs, program leads, CEOs of national and state-level conservation bodies, large NFPs, education programs at peak-body scale) with enough Ecodia signal that they want to work with us. Not engagement metrics. Not follower counts. Inbound from the right people.

**Cadence:** high-frequency LinkedIn focus (4-5 posts per week minimum). Other channels are secondary. The goal is repeated presence in the feed of a small named audience, not breadth across platforms.

**Shape:** every post is an export of a specific real moment from the operational substrate, with minimal framing. Examples that fit:

- A pattern file from the corpus, with the failure that caused it
- A real architectural decision being narrated as it's made
- A specific number tied to a specific cause (commits in 6h, rows deleted in an audit, restart count of a service)
- A status_board row and what it means
- A KG snapshot showing how a problem is being modelled
- A constraint we hit and how the architecture handled it
- A real exchange (anonymised where needed) that captured an insight worth keeping

Examples that do not fit and get cut:

- "We build X for Y" positioning copy
- Sentimental brand mood
- Speculation about what we could build
- Reframings of what we've already said
- Anything that could appear on three other studios' feeds unchanged

## Value-per-post rule

Every post must explicitly deliver one of these (state which when drafting):

1. **Insight** - framework or doctrine the reader can apply ("why software cost that much," "what build-in-public from an AI cofounder actually looks like")
2. **Evidence** - specific numbers, screenshots, named outcomes, citations
3. **Story** - narrative with stakes (build-in-public, founder, recovery from mistake)
4. **Service offer** - explicit invitation with a concrete next step
5. **Demo** - visible product or work-in-action that proves capability

Meta-commentary without one of these is not allowed to ship. A post that only says "I am an AI and that's interesting" is not a post.

## Primitives - how to generate post inputs autonomously

The conductor has these substrates for producing post material. Use whichever fits.

### Product / UI screenshots (own surfaces)

- **Co-Exist app screenshots:** drive Chrome on Corazon via the laptop-agent (Tailscale `100.114.219.69:7456`). Open the app URL, sign in with `kv_store.cowork.marketing.coexist_login` (canonical as of 2026-05-16; the legacy `creds.coexist` key has a stale password and is pending Tate-side update), `input.shortcut [ctrl,shift,i]` to open devtools, toggle device toolbar to iPhone 14 Pro, `screenshot.screenshot`, crop via `filesystem.*` or ImageMagick. Sequence is codifiable as a GUI recipe per `gui-recipes-authoring-optimisation-and-verification.md`.
- **EcodiaOS internal surfaces:** status_board snapshot, fork rollup, KG visualisation, commit history. Pull via SQL + render, or screenshot the frontend.
- **Client web builds:** only where authorised; check `~/ecodiaos/clients/{slug}.md` and `no-client-contact-without-tate-goahead.md` before showing client UI.

### Impact-org public content

- **WebSearch via Corazon residential IP** (per `websearch-via-corazon-residential-ip-when-vps-bot-blocked.md`) for the target org's program photos, news coverage, published annual reports. Always attribute.
- Public brand assets (org logos, palettes) - public-domain or fair-use only.
- Specific public impact stats cited from their published reports - link back.

### AI-generated assets

- **Gemini image generation** for original illustrations (concept art, abstract diagrams). Drive via API when creds available, or via the laptop-agent in a logged-in Google AI Studio session.
- **HTML/SVG mockups:** render slide-card carousels as HTML or SVG via `Write` tool to a tmp file, open in Chrome via laptop-agent, screenshot, crop. Same for code-to-visual (mermaid, d3 graphs of KG snapshots, status_board state visualisations).
- **Markdown-to-image** for quote cards.

### Founder / local content

- Photos Tate has uploaded to Drive (founder shots, Sunshine Coast nature, build setup) - requires Drive sync primitive (open item).
- Behind-the-scenes laptop screenshots (real work in flight, taken via laptop-agent on Corazon).

### Doctrine content (our own reservoir)

- `~/ecodiaos/patterns/` (200+ files) is a massive content reservoir. Most patterns can expand into a LinkedIn-length post.
- Recent commits + status_board + Neo4j Decisions are weekly content fodder.
- Self-evolution / inner-life / reflection routines surface stories worth telling.

## Per-channel format

| Channel | Followers | Primary format | Voice |
|---|---|---|---|
| LinkedIn | 588 | long-form text + hero image OR 4-10 slide carousel | Doctrine-grade, impact-org-leadership-readable |
| Instagram | 287 | carousel (4-10 slides) or reel; caption supports, visual stands alone | Visual-first, plain present-tense |
| Facebook | 37 | text + image, community tone | Less doctrine, more product + community |
| Google Business | local | short text + optional image, location-tagged | Factual, local-SEO, "Ecodia in Warana built X for Y" |
| X (EcodiaC48614) | 0 | text, optional image | Skip unless something would amplify well; not worth original effort yet |

Cross-posting via Zernio is on by default; **do not rely on cross-post for visual channels** - IG and GBP get bespoke media or they do not get the post.

## Cadence

**Weekly periodic publishing, not month-ahead bulk scheduling.**

Month-ahead bulk goes stale: cannot reference this-week's commits, this-week's incidents, this-week's news, this-week's ship. Tate flagged this directly 2026-05-16.

Pattern: every **Monday 10:00 AEST**, a cron fires that drafts the week ahead (3-5 posts mixed across channels), generates the visual primitives, and schedules into Zernio for Tue-Fri-Sun. Mid-week opportunistic post when something noteworthy ships.

Monthly Zernio cap reset is the natural budget cycle - cron lives inside that envelope.

When the queue empties past a 7-day forward-look, the cron escalates to a P2 status_board row.

## Surface mechanics - draft checklist

Every post draft must specify before scheduling:

1. **Channel(s)**
2. **Audience segment** (which impact-org persona)
3. **Value type** (insight / evidence / story / service-offer / demo)
4. **Media primitive** (which generator path produces the image)
5. **CTA** (concrete next step for the reader; not "get in touch")
6. **Scheduled time** (within the weekly cron's window)

If any of these fields is empty, the post is not ready to ship.

## Anti-patterns

- Same beat across all channels (LinkedIn-doctrine voice on IG fails)
- Text-only IG or GBP posts (kills reach + signal)
- Vague CTAs ("get in touch," "let us know")
- Targeting "anyone" (audience drift; pick a named persona)
- Bulk-scheduling a month ahead (staleness; Tate-flagged 2026-05-16)
- Posting without media when a primitive is available
- Em-dash `U+2014` in any copy - banned per `~/CLAUDE.md`; use `-` or restructure
- Naming counterparties without checking `client-anonymity-substring-scan.md`

## Open primitives (to provision)

These are not yet wired and are blocking full autonomy on visuals:

- ~~`kv_store.creds.coexist.beta_user`~~ resolved 2026-05-16 to `kv_store.cowork.marketing.coexist_login`; the legacy `creds.coexist` key has a stale password (P3 status_board row for Tate to update at convenience)
- Drive sync primitive (read-only access to Tate's marketing-assets folder)
- Gemini image-generation creds + an in-process or laptop-agent path
- Confirmed working laptop-agent flow for `Ctrl+Shift+I` + device-toolbar + screenshot

Each becomes a status_board row when picked up.

## Origin

Tate verbatim 2026-05-16: "we're not targeting individuals or any old startup or small bizz, its things like landcare aus, Co-Exist, tangaroa blue, project hiu, Wild Mountains etc... you generating visuals is obviously an absolute must, we can get you synced up to some sort of drive config so you can find photos and use them, you've got web search access and visual looking via tailscale etc. Like we actually need to codify this as well, not the exact posts, but all the opportunities and ideas for ways you can get the primitives for posts... each month on the zernio cap reset we can keep going with posts, and maybe even a periodic thing rather than scheduling a month in advance and the posts being out of date."

## Cross-refs

- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - why this file exists right now
- `~/ecodiaos/patterns/carbon-mrv-wedge-peak-body-sub-commercial.md` - audience overlap with target impact orgs
- `~/ecodiaos/patterns/coexist-vs-platform-ip-separation.md` - Co-Exist is the demo, not the platform IP
- `~/ecodiaos/patterns/client-anonymity-substring-scan.md` - anonymity discipline before naming counterparties
- `~/ecodiaos/patterns/websearch-via-corazon-residential-ip-when-vps-bot-blocked.md` - WebSearch path for impact-org research
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - meta-doctrine for codifying the Co-Exist screenshot recipe
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - correct tool surface for Chrome-driving
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - laptop-agent peer-paradigm
