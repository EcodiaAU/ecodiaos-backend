---
triggers: ui-design, ux-design, ui-architecture, nav-design, mobile-nav, hamburger, bottom-tab-bar, side-sheet, drawer, top-nav, modal, sheet, layout-component, redundant-ui, parallel-nav, parallel-modal, parallel-drawer, ui-duplication, common-sense-ux, consolidate-not-add, frontend-component-authoring, app-shell, admin-layout, member-layout, role-conditional-nav
---

# Consolidate UI primitives, don't add parallel ones

Before authoring any new UI surface (navigation, modal, sheet, drawer, popover, tab bar, layout shell), exhaustively grep existing primitives in the codebase. If a primitive of the same class exists, **consolidate into it** (extend, refactor, conditional-render) rather than adding a parallel one. Two competing primitives of the same class on the same screen IS the failure mode.

## The rule

A "primitive class" means: any UI element that occupies the same visual + semantic role. Examples of classes:
- **Mobile nav surface** — bottom tab bar, hamburger drawer, top action menu, pull-up sheet
- **Modal-overlay** — confirm dialog, full-screen modal, side sheet, popover
- **Section nav** — sidebar, breadcrumbs, secondary tab strip
- **Action surface** — floating action button, inline actions, kebab menu

If the codebase already has ONE member of a class shipped, the next change in that area MUST consolidate into the existing primitive. Authoring a parallel one creates two competing surfaces, which:
- Forces the user to learn two interaction patterns for the same kind of action
- Splinters the design language ("one motion language" claim becomes false)
- Doubles maintenance surface
- Reads as accretion-by-task, not architecture-by-design

## Pre-action protocol (mandatory before authoring any new layout/nav/modal component)

1. **Grep the codebase for existing primitives of the same class.** Patterns to scan:
   ```
   Drawer | SideSheet | BottomSheet | BottomTabBar | TabBar | NavBar
   Modal | Dialog | Sheet | Popover | Overlay | Portal
   AppShell | Layout | LayoutShell | RootLayout
   HamburgerButton | MenuButton | NavMenu | MobileNav | DesktopNav
   ```
2. **Read each match in full.** Don't skim. Understand the existing API, where it's invoked, what its motion language is.
3. **Make a CHOICE before writing any new code:**
   - **Consolidate** — the existing primitive can absorb this use case (probably with a new `variant` prop, role-conditional content, or section grouping). DO this.
   - **Extend** — the existing primitive needs a new sibling that shares the same skeleton (extracted into a base + two variants). DO this if and only if the variants genuinely diverge in behaviour, not just visual content.
   - **Add parallel** — only if there is a substantively different interaction model (e.g. a real popover vs a real sheet — those are different classes). RARE.
4. **If you choose "add parallel," write a one-paragraph justification in the brief / commit message naming what makes the new primitive a different class from the existing one.** No justification = consolidate, full stop.

## Specific anti-patterns

- **Adding a hamburger nav when a bottom tab bar with a "More" sheet already exists.** The "More" sheet absorbs admin items, settings, less-frequent actions. Hamburger top-nav on mobile is redundant.
- **Building an "AdminLayout" that has its own local nav strip when the AppShell already has a side nav with role-conditional sections.** Admin items go inside the existing side nav under a labelled "Admin" group, conditional on role.
- **Two modal libraries** (e.g. shadcn Dialog + Radix Dialog + a hand-rolled overlay) shipped to the same app. Pick one, refactor others.
- **A new bottom sheet when the existing SideSheet already animates from the side.** Same class, different orientation. Add an `anchor: 'side' | 'bottom'` prop instead.

## Fork-brief discipline

When dispatching a fork to add or modify any UI component, the brief MUST include:

```
## Pre-author audit
Grep for existing primitives in the same class:
- Mobile nav: <list current primitives>
- Modal/sheet: <list current primitives>
- Layout: <list current primitives>
Read each in full before authoring any new component.
```

Briefs that say "add a hamburger drawer" without first instructing the fork to find the existing nav primitives are wrong. Briefs that say "add a confirmation modal" without grepping existing dialog primitives are wrong. The fork follows instructions; the brief author is the one who has to enforce consolidation.

## Verification

After any UI primitive change, screenshot the affected pages at mobile + tablet + desktop breakpoints and verify by eye:

- Is there exactly ONE primary nav surface visible per breakpoint? (Yes = pass. Two competing surfaces = fail.)
- If a role-conditional surface exists (admin/officer view), does it INHABIT the existing primitive, or run alongside it? (Inhabit = pass. Alongside = fail, regardless of how cleanly each is implemented individually.)
- Does the motion language match across all entry points? (Same animation curve, same dismiss gesture, same backdrop fade. Mismatched = fail.)

## Origin

6 May 2026 14:46-15:11 AEST. The Chambers admin nav fix shipped at commit `f602c34` (fork_motktunk_f6a2b5) added a hamburger button + slide-in drawer to AdminLayout.tsx on mobile. This was redundant with the existing Co-Exist-ported bottom-tab-bar + SideSheet pattern shipped earlier at commit `ca8b488` ("port Co-Exist nav pattern (bottom tab bar + side sheet) to Chambers + animation parity admin↔public, all-UI-smooth nudge"). Two competing mobile nav surfaces resulted.

Tate verbatim 15:11 AEST: "bro the chamber navs really need to be consolidated.... therees the normal one and the admin one and they should be unified under the more botton on mobile in the bottom tab bar, no dumbn hamburger in the top nav on mobiel which doesnt work... and only one on laptop.... I need some common sense wwhen it comes to the app ui design adn ux."

The fork executed the brief faithfully. The mistake was at the brief-authoring layer: I named "hamburger drawer or bottom-tab nav" as the implementation choice without first instructing the fork to locate the EXISTING bottom-tab-bar + SideSheet primitive and consolidate admin items into its "More" surface. Naming an implementation pattern in the brief without first auditing existing primitives in the same class is the recurring drift.

This pattern codifies the audit-then-decide-then-author sequence so future briefs name the existing primitive by file path before naming any new UI work.

## Cross-refs

- `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md` — fork brief should INSTRUCT the audit, not run it on main
- `~/ecodiaos/patterns/no-placeholders-no-coming-soon-on-shipped-features.md` — quality bar applies to UI architecture, not just feature completeness
- `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` — "would Tate approve this if he saw it unprompted" is the quality gate
- `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md` — screenshot verification at three breakpoints catches the "two competing surfaces" failure mode by eye
