# LostMe app design prompt - 2026-06-03

**Purpose:** Paste into a new Claude conversation (Sonnet 4.6 or Opus 4.7 recommended) asking it to produce mobile-first mockups of the full LostMe app, screen by screen, in the locked brand system. Output target: one HTML artifact per screen, 390x844 (iPhone 14 Pro) baseline, with platform-specific notes called out for Android (Pixel 7, 412x915 with material-3 status-bar/navigation-bar inset).

**Source of truth:** EcodiaOS swarm synthesis 2026-06-03 (wim8m87gw.output). All numbers, copy strings, hex codes, and architectural calls are derived from the 18 decisions revised + 10 risks named + 10 open questions in that synthesis.

---

## Prompt to paste

```
You are designing LostMe, a native iOS + Android consumer-rejection scanning app being built for SeedTree Earth (Ryan Moss, founder). I need exhaustive screen-by-screen mockups in HTML, one screen per artifact, 390x844 px baseline (iPhone 14 Pro), with Android adaptations called out where they differ.

# Product context

LostMe lets a values-driven shopper scan a product they refuse to buy and flag why. Their rejection signal joins thousands of others, the aggregate goes public, and brands change products to get off the list. The user pays nothing. The business model is selling aggregated rejection-pattern data to brand sustainability teams, retailer buying departments, and ESG research firms - but this is disclosed in the second half of onboarding and on a Methodology page, never as the hero positioning.

The audience is intentional, cost-stressed shoppers who want convenience to be the norm aligned with responsibility. They live this life every shop. They will pull out their phone in a supermarket aisle for 30 seconds. They are not anti-consumption purists. App Store short description: "For people who care, and also need dinner."

The differentiator versus Yuka: Yuka tells YOU not to buy. LostMe gets BRANDS to change the product. Mechanism is public pressure via aggregate publication once a brand crosses 100 flags on a given reason. Same lever Yuka used to drive Conagra, Chobani, Intermarche, Walmart to reformulate.

# Brand system - LOCK exactly

## Palette

- Paper (background): #F7F4EE warm paper-white, never pure white
- Ink (text + UI lines): #1A1815 warm near-black, never pure black
- Flag (action + count): #B5462E oxidised iron-red, reserved exclusively for the FLAG button and the flag count number, never decorative
- Sage (charts + dividers): #6B7F5E used only in Report charts and section dividers as the anti-shrillness pairing
- Trace (60% opacity ink): #1A1815 at 60% alpha for secondary text and viewfinder corner brackets in idle state

Never use: terracotta #E2725B (colonised by 2022-2024 wellness brands), forest green (preachy in this category), pure white, pure black, gradients, glassmorphism.

## Typography

- Headlines: Tiempos Headline (Klim Type Foundry). Weights: 400 regular, 600 medium. Fallback: GT Sectra or Roslindale Display. Never Bodoni / Didot / Caslon / Garamond.
- Body + UI: Untitled Sans (Klim). Weights: 400 regular, 500 medium. Fallback: Atlas Grotesk. Never Inter or default Söhne (reads fintech).
- Numerals: old-style figures in long-reading contexts (e.g. paragraphs). Lining figures in counters, totals, and UI badges.
- Size scale: 32/28/22/17/15/13/11 pt. Line height 1.3 for headlines, 1.5 for body.

## Photography and illustration

- Real product photography when available, sourced from Open Food Facts API at scan time
- Monoline iconography for system UI (use Phosphor Icons or SF Symbols equivalent), 1.5pt stroke, ink colour
- The viewfinder corner-bracket shape from the existing prototype stays. The green circle around it goes.
- Zero illustration. No mascots. No isometric scenes. No abstract decorative shapes.

## Copy register

Declarative, mechanical, evidence-first. Sentences that name what happened, not what the user should feel.

Use: "Sent to Brand X at 14:23. 47 others this week."
Never: "You're making a difference!", "empower", "unleash", "movement", "join the change", "amazing", "incredible".

Old-style numerals on in body text. Lining figures in counters.

## Motion

- Sheet animations: 220ms cubic-bezier(0.4, 0.0, 0.2, 1.0)
- Haptic-bound animations (bracket-lock): instant, paired with the haptic
- No bouncy springs. No parallax. No decorative motion.

# Counter rule (apply everywhere a count appears)

The flag counter is scoped to **brand + reason** and counts **unique users in a rolling 7-day window**.

- The "47 others this week" line means: 47 unique users (excluding the current user) flagged THIS brand for THIS reason in the past rolling 7 days.
- The progress bar "47 / 100" tracks the same brand + reason + 7-day scope.
- When that count reaches 100 unique users in any rolling 7-day window for a given brand-reason pair, the aggregated report on Brand X + Reason Y publishes for that week.
- Reason-scoped publishing is what makes the report newsworthy and actionable for a sustainability team (e.g. "Cadbury misleading-sustainability-claims report" lands harder than "Cadbury misc complaints").
- Use this rule across screens 8, 9, 11, 12, 17, and 18.

# Information architecture

Three tabs only:

1. **SCAN** (default tab on launch). Live viewfinder edge-to-edge.
2. **LEDGER** (renamed from Feed). Aggregate flags organised BY BRAND, public, sortable by recent / most-flagged / nearest-to-100-milestone.
3. **YOU**. History list, monthly Report sub-view, settings, methodology link.

The Methodology page is reachable from the YOU tab AND from the onboarding card 3 AND from the in-app About sheet. It is not a tab.

# Screens to produce - exhaustive

For each screen below, produce one HTML artifact at 390x844 baseline (iPhone 14 Pro), inline styles, no external dependencies, Tiempos Headline + Untitled Sans loaded from a CDN if needed. Include status bar (44pt) and safe area insets (34pt bottom on iOS for home indicator). Call out where Android (Pixel 7, 412x915, material-3 navigation gestures) differs.

## 1. App icon

1024x1024 master. Paper #F7F4EE background. Centred ink #1A1815 viewfinder corner-bracket shape (no green circle). No wordmark, no tagline. iOS and Android variants identical.

## 2. Launch / splash

Paper background. Title "LostMe" centred in Tiempos Headline 32pt, ink. No tagline, no spinner. Sub-second hold before onboarding card 1.

## 3. Onboarding card 1

Title (Tiempos Headline 32pt): "A receipt for what you wouldn't buy."
Body (Untitled Sans 17pt): "Flag the products you wish weren't on the shelf. Your reasons go on a public weekly ledger. Brands change products to get off it."
Single CTA pill at bottom (Flag #B5462E, paper text): "Next".
Three pagination dots above CTA. Dot 1 filled flag-red, 2 and 3 ink-trace.

## 4. Onboarding card 2

Title: "30 seconds. While you shop."
Body: "Scan. Tap a reason. Done. The brackets snap when the barcode locks. That's the whole loop."
Mid-screen: an inline static illustration of the viewfinder bracket shape with a fake barcode inside, bracket corners in flag-red showing the lock state.

## 5. Onboarding card 3 (DATA DISCLOSURE - intentionally demoted to card 3 not card 1)

Title: "How this funds itself."
Body: "Brands and researchers pay to read the aggregate flags. That's where the pressure starts. Your scans are stripped of identity before they go anywhere. Full methodology in the Methodology page."
Link below body: "Read the methodology" (ink, dotted underline).
CTA pill: "Get started".

## 6. Scan tab (default home, cold launch lands here)

Edge-to-edge live camera preview occupying full screen.
Status bar transparent over preview.
Viewfinder corner brackets at 60% ink-trace opacity, snapped to roughly 240x160 px centred slightly above middle, four corners only (top-left, top-right, bottom-left, bottom-right).
Bottom tab bar over a paper #F7F4EE strip with 80% opacity backdrop blur. Three tabs labelled SCAN / LEDGER / YOU in Untitled Sans 11pt all-caps, ink. Current tab (SCAN) has a 2pt flag-red underline.
No floating buttons. No top-bar title. The camera is the affordance.
Show empty state: no barcode detected yet.

## 7. Scan tab - bracket locked state

Same screen as #6 except the brackets are now flag-red #B5462E (instant snap, no fade animation in the still frame), and a small chip at top reads "Barcode locked. EAN-13" in Untitled Sans 13pt ink on paper background.
This is the visual confirmation moment. Pair with UIImpactFeedbackGenerator(.medium) on iOS and VibrationEffect.createPredefined(EFFECT_TICK) on Android. Under-100ms perceived latency between detection and lock visual.

## 8. Why-chip sheet (rises from bottom edge)

Bottom-anchored sheet at roughly 70% screen height. Paper background, rounded top corners 20pt radius, ink hairline at the sheet's top edge.
Product header at top of sheet: product photo 64x64 left, product name in Tiempos Headline 22pt right, brand name in Untitled Sans 15pt ink-trace below.
If the product is not yet resolved from Open Food Facts: show "Looking up..." in Untitled Sans 15pt ink-trace and animate three dots. The chips below should be visible BEFORE the product name resolves.
Three chips (v1 closed-set, NOT free text): "misleading claim", "ingredient", "packaging". Pill-shape, paper background, ink hairline border 1pt, ink text Untitled Sans 15pt. Tapped chip fills flag-red with paper text.
Light selection haptic on each tap.
Multi-select. Below chips: small footer "Pick what fits. Tap to commit." in Untitled Sans 11pt ink-trace.
Primary CTA at bottom of sheet: "Flag this." pill flag-red with paper text, Untitled Sans 17pt medium.

## 9. Scan confirmation state

Sheet collapses. Mid-screen modal-style card on paper background:
Headline (Tiempos Headline 28pt): "Sent."
Sub (Untitled Sans 17pt): "47 others flagged this brand this week."
Below: "Next milestone: 100. At 100 the aggregated report goes public."
Counter visualisation: a horizontal progress bar 6pt tall, sage fill on ink-trace track, with "47 / 100" in lining figures aligned right.
Success haptic. Two-second hold. Camera fades back in behind the card. Card dismisses upward, brackets reset to 60% grey, ready for next scan.

## 10. Product-not-found state (CRITICAL - this is a primary signal, not an error)

Bracket-locked state but no Open Food Facts hit.
Card from top: "New to us. What is it?"
Sub: "Snap a photo and name it. We'll catalogue it back to the open database."
One large photo-capture button (paper background, ink hairline, viewfinder bracket icon centred).
Single text field below: "Name of the product".
Below: "Skip for now" (ink, dotted underline, secondary).
Primary CTA: "Add it." flag-red pill.
On submit: the same scan confirmation flow as #9, with "47 others flagged THIS brand this week" replaced by "First flag on this product. The ledger starts here."

## 11. Ledger tab - brand list view

Top bar: "Ledger" in Tiempos Headline 22pt ink on paper.
Below header: filter chips row "Recent / Most flagged / Near milestone". Default Recent.
List of brand cards (vertical scroll). Each card 96pt tall:
- Brand name in Tiempos Headline 17pt ink
- Top-flagged reason in Untitled Sans 13pt ink-trace ("Top reason: misleading sustainability claim")
- Right-aligned counter "1,247" in lining figures flag-red 22pt + milestone bar 4pt tall below ("crossed 100 on packaging" or "67 / 100 to milestone")
- Card divider: 1pt ink-trace hairline below each card, full-bleed

Pagination: infinite scroll, load 20 at a time.

## 12. Ledger > brand detail

Top: brand name Tiempos Headline 28pt ink, brand category Untitled Sans 13pt ink-trace below.
Counter row: "1,247 flags total" + sparkline (sage on ink-trace track, last 12 weeks)
Reason breakdown: stacked horizontal bar segmented by reason, with legend "misleading claim 42%, packaging 31%, ingredient 27%"
Three most recent flagged products as small cards (product photo 48x48 + name + flag count).
**Brand right-of-reply field**: paper-card with hairline border, italic Untitled Sans 13pt: "This brand has not responded yet." If they have: their response text + date + reply chip.
At bottom: "Methodology" dotted-underline link.

## 13. You tab - default view

Top bar: "You" Tiempos Headline 22pt.
Stats row: three numbers in lining figures, sage colour:
- Total flags (lifetime)
- This month's flags
- Brands you've flagged that have responded
Beneath: small label "Your civic receipts" in Untitled Sans 11pt ink-trace all-caps.

Vertical list:
1. "June Report" card (the personal civic receipt) - tappable, opens screen #14.
2. "Recent flags" - list of last 10 scans with product photo, brand, date, status (sent / responded / milestone-crossed).
3. "Methodology" link.
4. "Settings" link.

If offline queue has pending flags: a single chip at top reading "3 scans waiting to sync" in Untitled Sans 13pt on sage background, dismisses to sent state on reconnect.

## 14. You > monthly Report (the personal civic receipt)

Header: "June 2026" Tiempos Headline 32pt + sub "Your civic receipt." Untitled Sans 15pt ink-trace italic.
Body sections (no banner headings, italic letter-spaced sentence-case section labels):
- "where your flags landed" - sparkline + 3 brand names with counts
- "what changed" - bulletless paragraph naming the 2 brands that responded or moved (real text, not template-y)
- "what you flagged most" - one sentence
- A receipt-style footer: "Receipt 2026-06. Stripped of identity. Stored in your phone." Untitled Sans 11pt ink-trace.
Bottom: share button (paper, ink hairline, Untitled Sans 15pt "Share this receipt"). Share template: a PDF download, not a social post.

## 15. You > settings

Plain list. Untitled Sans 17pt left-aligned, hairline dividers:
- Account
- Sign in with Apple / Sign in with Google (whichever absent)
- Notifications
- Data preferences (what's collected, link to Methodology)
- Sign out
- About LostMe (paper card with one paragraph + footer link to the three-line ecodia.au site equivalent: "Made by Ecodia for SeedTree Earth.")

## 16. Methodology page (exposed from YOU and from onboarding 3 and from About)

Editorial-grade single-column layout. Title Tiempos Headline 32pt: "Methodology."
Sub: "How we counted. Where this went. Who saw it."
Body in roman 400, single column, justified text NO, left-aligned. Sections under small italic sentence-case labels:
- how flags become signal
- how we publish aggregates
- who buys the reports
- what we never sell
- how to verify any of this
Each section is 2-3 short paragraphs. No bullets in this page - prose only.
Footer: "Last reviewed 2026-06-03. Tate Donohoe + Ryan Moss." Dotted-underline link "Audit this page".

## 17. Push notification examples

Three notification mockups in iOS and Android styles:
- "1 brand you flagged crossed 100." (sage accent in iOS rich preview)
- "Cadbury responded to your flag." (flag-red accent)
- "Your June receipt is ready." (ink accent)
Each in both iOS lockscreen-style and Android Material 3 collapsed-card style.

## 18. App Store screenshots (5 screenshots, 1290x2796 iPhone 14 Pro Max, then matching 1080x1920 Android)

Each screenshot is a paper-white background with the actual screen mockup centred and a Tiempos Headline 56pt caption above:
1. "A receipt for what you wouldn't buy." with the scan tab visible
2. "30 seconds. While you shop." with the bracket-lock state
3. "47 others this week. 100 makes it public." with confirmation state
4. "Ledger of who said no." with brand list view
5. "For people who care, and also need dinner." with You tab + June Report visible

No screenshots use device frames. Just the screen content on paper background with caption above.

# Output instructions

Produce ONE HTML artifact per screen listed above (18 artifacts total). Each artifact is self-contained, inline CSS, web fonts loaded from Klim Type Foundry's CDN if accessible (otherwise the Google Fonts closest equivalent: Lora for Tiempos Headline, Manrope for Untitled Sans).

After each artifact, in the chat thread, write a 2-3 sentence design rationale calling out which decision in the swarm synthesis the screen embodies (e.g. "Demotes data-sale to disclosure per decision 1", "Camera-as-home per decision 2").

When all 18 artifacts are produced, generate a 19th artifact: a master design system reference page showing the palette swatches with hex codes, type specimens at all sizes, the bracket-lock illustration, sample chip states, and the haptic timing diagram.

If anything in this brief is ambiguous or contradictory, flag it back in the chat with a numbered question before producing artifacts. Do not invent details to fill gaps.

# Tone

Match the editorial-mechanical voice. No salesmanship. No marketing copy beyond what's literally specified. If the user asks for variations, produce them dry and stripped, not glossier.
```

---

## Notes for Tate

- This is the lay-out-the-whole-app prompt. 18 screens + 1 design system reference page = 19 artifacts total.
- Copy from the triple-backtick block above. The pasted block is self-contained, no further context needed.
- Paste target: Claude.ai web (Sonnet 4.6 or Opus 4.7), Claude Code, or any Claude surface with artifact rendering. Anthropic Console works too if you want headless control.
- If the receiving Claude flags an ambiguity, the synthesis source is at the wim8m87gw.output path - I can answer per-question or update this prompt.
- Open questions still pending your call (from synthesis):
  - Three discovery calls before redesign work?
  - Mossy's attachment to data-sale-as-hero?
  - One direction or two side-by-side at Phase 1?
- The prompt assumes the demote-data-sale-from-hero call sits well with Mossy. If he pushes back, screens 3, 16, and 18 caption 1 need rework.
