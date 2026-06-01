---
triggers: rebuild, native-rebuild, greenfield, port-vs-rebuild, migration, framework-conversion, next-to-vite, vite-conversion, web-only, multi-codebase-split, rewrite, scaffold-from-spec, existing-codebase, feature-parity, regression, spec-authoring, worker-brief, design-spec, from-scratch
---

# A "rebuild" spec must diff against the existing codebase first - port/strip, not greenfield from spec

When a task is framed as "rebuild X" or "split X into N codebases", the FIRST move is to
diff the rebuild target against what already exists on disk, per surface. If the existing
artifact is already in the target framework (or one strip/port away from it), the work is a
**migration / strip / port**, NOT a from-scratch build. Authoring a spec that describes an
already-existing surface as greenfield - and briefing a worker to "build the X codebase" -
produces a skeleton that REGRESSES real, shipped functionality. The skeleton looks like
progress (folders, scaffolding, a clean build) while silently dropping every feature the
working app had.

**General form:** the per-surface rebuild-vs-port decision is independent and must be made
per surface, not inherited from the project's overall framing. A multi-surface "rebuild" can
be correctly greenfield on the surfaces with a genuine framework/language gap (Capacitor
webview -> native SwiftUI/Compose) and simultaneously WRONG to greenfield on a surface that
already exists in the target stack (an existing Vite/React web app "rebuilt" as a Vite/React
web app). The error is not phasing and not the rebuild itself - it is letting the clean N-repo
symmetry of a spec assign "new project" to a surface that should read "fork existing + apply
delta". Diff each surface against disk; let the deltas be asymmetric.

## The rule

Before writing a rebuild/split spec, or dispatching any worker against one, answer per surface:

1. **Does this surface already exist as a working codebase?** `ls` it. Count its source files.
2. **What framework is it ACTUALLY in?** Read its `package.json` / build config. Do not trust
   memory or a one-line description ("it's a Next app") - verify. (Glovebox web was described
   as Next; it was already Vite 6 + React 19.)
3. **What is the real delta to the target?** If the existing stack already equals or nearly
   equals the target, the delta is a strip/port (e.g. "remove Capacitor native calls, deploy
   web-only"), measured in hours, not a rebuild measured in days.
4. **Only the surfaces with a genuine framework gap are greenfield.** A Capacitor-webview iOS
   app rebuilt as native SwiftUI IS a real rebuild. The same app's web bundle, already React,
   rebuilt "as a web app" is NOT - it already is one.

## Do

- Open the existing codebase and read its build config BEFORE deciding rebuild vs port.
- In a rebuild spec, state per surface explicitly: `PORT existing <path> (delta: ...)` or
  `GREENFIELD (no existing artifact)`. Name the existing source path and the exact delta for
  every port surface.
- Brief porting workers to START from the existing source (copy/branch it), then apply the
  delta. Never brief "build the X codebase" when X exists.
- Be suspicious when a "rebuild" produces a clean skeleton fast. Fast-and-clean usually means
  it skipped the accumulated product surface, i.e. it regressed.

## Do not

- Do not describe an existing-codebase surface as greenfield in a spec because the spec's
  mental model is "5 fresh repos".
- Do not trust a stack label from memory ("I built it with Next") over the actual build config.
- Do not dispatch parallel greenfield workers across surfaces before confirming each surface
  actually needs greenfielding. The cheapest surface to get wrong is the one that already works.
- Do not let a design spec's clean N-repo symmetry override the messy truth that one of those
  repos already exists at 90% done.

## Origin

2026-06-01, Glovebox v2 native rebuild. The v2 design spec
(`docs/superpowers/specs/2026-05-31-glovebox-v2-native-rebuild-design.md`, authored by me)
described `glovebox-web` as a greenfield Vite + React 19 + MapLibre GL JS PWA. The existing
`D:/.code/glovebox/frontend` was ALREADY Vite 6 + React 19 (never Next, despite the memory
that it was) with 257 source files of shipped product (maps, basemap, fuel, trips, places,
nav, paywall, share) and a working PWA service worker. A worker briefed to "build the web
codebase" greenfielded a skeleton with empty `routes/`/`components/`/`design/` folders and
none of the 257 files. Days of parallel-worker time + tokens + attention burned before Tate
caught it: "Web is so far from the current v1 glovebox ui and functionality.... how tf did we
regress into a pile of shit" and "All we had to do for web was turn the frontend we currently
have into a vite app instead of next, and make it 100% web only" - and it was already Vite, so
even that was overstated. The correct web job was: existing frontend, guard the 14 Capacitor
native plugins for graceful web degradation, swap StoreKit paywall for Stripe checkout on web,
deploy to Vercel. A strip, not a rebuild.

Cross-refs: `use-anthropic-existing-tools-before-building-parallel-infrastructure.md`
(don't build parallel to something that exists), `verify-deployed-state-against-narrated-state.md`
(a clean skeleton build is not a working app), `brief-names-the-product-not-the-immediate-task.md`.
