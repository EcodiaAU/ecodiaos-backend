---
triggers: visual judgement rubric, vision judge screenshots, app screenshot review, contrast check, truncation check, brand palette check, ui coherence check, animation judging, nightly gallery review, visual integrity findings, what to look for in app screenshots
priority: high
canonical: true
binding: cron=cowork.app-tests-nightly + script=backend/scripts/app-tests/run-app-tests.sh
---

# Visual-judgement rubric: what the nightly worker checks in every gallery

## 1. The rule

Every nightly app-tests run produces a screenshot gallery, green runs
included, and the worker judges it against THIS rubric. A structural pass
with failing pixels is a finding. Origin list is Tate verbatim 2026-06-10:
"text or fg/bg contrasting, text and element wrapping/truncating depending
on purpose, colour palette compared to branding/purpose, ui coherence,
transformations and transitions, animations, and so much more."

## 2. The rubric (judge each screenshot, then the set)

Per screenshot:
- **Contrast:** every text block readable against its background; worst
  offenders are text over imagery and muted-on-muted. Disabled states
  dimmed but still legible.
- **Wrapping and truncation BY PURPOSE:** titles may truncate with
  ellipsis; amounts, dates, names, and CTAs never truncate; body copy
  wraps without orphaned single words on their own line where avoidable;
  nothing overflows its container or collides with a neighbour.
- **Palette vs brand:** colours belong to the app's token set (Coexist
  cream/sage/charcoal; Glovebox outback orange/eucalypt; Locals
  mustard/neutral map). A hex that looks off-family, a default-blue
  link, or a washed tint is a finding. Purpose-fit too: error reds for
  errors only, success greens not used decoratively.
- **Coherence:** consistent spacing rhythm, alignment to a grid, one
  typography scale, consistent corner radii and icon stroke weight
  across the screen and ACROSS screens in the set.
- **States:** loading states styled (skeleton or branded spinner, never
  a blank region), empty states designed with copy, error states humane.
- **Imagery:** no broken-image glyphs, no stretched or wrong-aspect
  photos, no unloaded grey rectangles where content should be.
- **Layout chrome:** safe-area respected (no content under the notch or
  home indicator), keyboard does not cover the focused field, touch
  targets visually plausible (~44pt+), no clipped buttons at any
  captured font scale.
- **Dark mode** (when the run includes it): every check above re-judged;
  dark mode that inverts but breaks contrast or imagery is a finding.

Across the set (the gallery as a sequence):
- **Transitions and transformations:** where the runner captures motion
  (maestro startRecording, or before/after pairs around navigation),
  judge sampled frames: navigation should not hard-cut where siblings
  animate, sheets should not jump-cut between detents, no half-rendered
  intermediate frames. Honest limit: frame sampling catches missing or
  abrupt transitions and mid-transition jank captured in a frame; it
  cannot certify 60fps smoothness.
- **Cross-screen coherence:** the set should read as one product: same
  header treatment, same card language, same nav chrome.
- **Cross-platform parity** (when both platforms ran): same surface side
  by side; divergence in content or affordances is a finding even when
  styling legitimately differs per platform idiom.

## 3. How findings land

Each visual finding: screenshot path + which rubric line + severity
(blocker = unreadable/broken on a customer path; major = off-brand or
incoherent on a primary surface; minor = polish). Written into the
nightly status_board verdict notes alongside structural results. The
worker never fixes app code mid-judgement; findings route to the
conductor.

## 4. Anti-patterns

- Judging only red runs; the washed-map class ships through green
  structural runs.
- Vague findings ("looks off"): every finding names the rubric line and
  the pixel evidence.
- Treating motion as unjudgeable and skipping it entirely; sampled
  frames are partial coverage, zero frames is none.

## 5. Cross-references

- [[maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10]] (the dual activity)
- [[agent-is-the-vision-llm-not-parallel-api-2026-06-09]]
- [[ecodia-consumer-marketing-pages-inherit-chambers-glovebox-aesthetic-2026-06-08]] (brand reference points)

## 6. Origin

2026-06-10, Tate's visual-criteria list while standing up the Maestro
dual activity; the rubric is the judging half made explicit and bound to
the nightly cron.
