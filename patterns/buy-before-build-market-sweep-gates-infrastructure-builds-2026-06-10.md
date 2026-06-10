---
triggers: buy before build, market sweep before building, prebuilt tool exists, build vs buy testing, do not build harness, infrastructure build gate, someone already perfected it, app tester product, test infrastructure pivot, reinventing test tooling, framework vs product, walker rebuilt commercial tool
priority: critical
canonical: true
binding: hook=buy-before-build-gate.sh + skill=knowledge-route
---

# A market sweep gates every infrastructure build; the burden of proof is on building

## 1. The rule

Before ANY new infrastructure build (test harness, crawler, monitor, scheduler, pipeline, engine), run a market sweep: name at least three commercial or open-source products that claim the job, and write a one-paragraph gap memo on why none fits. No memo, no build. This generalises [[use-anthropic-existing-tools-before-building-parallel-infrastructure]] from Anthropic primitives to the whole market.

## 2. Why

2026-06-10: a full day went into a bespoke mobile release-gate walker (state matrix, exploration, detectors). The machinery worked and even found real bugs, but Tate's verdict stands: "We're doing that thing again where we try to recreate the infrastructure ourselves... Someone has already perfected it and we should just be using that." The prior codification existed and did not fire because it was scoped to Anthropic primitives and bound to a hook that matched Anthropic keywords. A lesson that fires only on the nouns of its origin story is not a lesson; the general form needs its own gate. Bespoke infra always loses to a product on maintenance: every false positive, device quirk, and platform change becomes OUR engineering forever, where a vendor amortises it across thousands of customers.

## 3. How to apply

- On any brief that smells like an infra build, the FIRST deliverable is the sweep: 3+ named products, capabilities vs the need, current pricing, and the gap memo. Research agents with live web search; never from memory in a fast-moving market.
- The gap memo must name a load-bearing requirement no product meets, not a preference ("ours integrates tighter" is not a gap).
- When a build already exists and the sweep was skipped (this case): stop feature work immediately, run the sweep, migrate to the product, and keep only the pieces that are product-agnostic glue (e.g. a ship gate that reads "is there a green verdict", regardless of what produces verdicts).
- Specs, flows, and test scenarios authored for the bespoke tool are not waste; they are requirements documents for the product's onboarding.

## 4. Anti-patterns

- Treating working code as evidence the build was right; the walker found real bugs AND was still the wrong call, because the alternative also would have found them without a day of build plus permanent maintenance.
- Scoping the codified lesson to the original incident's nouns so the hook never fires on the next instance.
- Running the sweep AFTER v1 ships, when the bespoke build has gravity.
- A sweep from training memory: products die, pivot, and reprice; verify live.

## 5. Cross-references

- [[use-anthropic-existing-tools-before-building-parallel-infrastructure]]
- [[generalisation-engine-lifts-specifics-to-general-form]]
- [[hooks-are-the-epitome-of-learning-prose-without-hook-is-forgotten-2026-06-09]]
- [[release-walker-state-matrix-2026-06-10]] (the build this lesson retires from feature work)

## 6. Origin

2026-06-10 release-walker pivot. Tate: "weve had this lesson before and codified it and still didnt listen." The codification gap was generality plus binding; this pattern carries both.
