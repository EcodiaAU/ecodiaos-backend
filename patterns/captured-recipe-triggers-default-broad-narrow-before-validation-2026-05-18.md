---
triggers: captured-recipe-triggers, captured-recipe-narrowing, os-hook-recorder-triggers, macro-recipe-frontmatter, triggers-from-slug-tokens, untested_spec-to-validated_v1, recipe-promotion-gate, captured-recipe-promotion, post-capture-trigger-narrowing, recipe-frontmatter-audit, recorder-window-title-triggers, capture_method-os-hook-recorder
---

# Captured-recipe triggers default to broad bare-noun spam; hand-narrow before promoting to validated_v1

## Rule

Any pattern file produced by the os-hook-recorder (or any future capture pipeline that auto-emits a `triggers:` frontmatter) is born with a broad trigger set. The recorder composes the trigger list mechanically from `flow_slug` token splits and window-title fragments; it cannot see which words are bare common nouns banned by `triggers-must-be-narrow-not-broad.md`. The file is `status: untested_spec` at birth. Before flipping `status:` to `validated_v1`, the `triggers:` line MUST be re-authored from scratch against the recipe's actual rule.

## Why

The capture recorder writes a 10-section recipe in one pass with no semantic model of what makes the recipe distinct from every other recipe in the corpus. It seeds the trigger list from two mechanical sources: the kebab tokens of `flow_slug` and the visible text of the foreground window title at capture time. Both sources reliably produce bare common nouns.

Concrete observed defects on the 2026-05-07 capture cohort:

- `asc-app-record-create-recipe.md` was emitted with `asc, app, record, create, new, google, chrome, store, connect` as standalone trigger keywords. Nine of thirteen triggers were bare common nouns.
- `apple-dev-apns-auth-key-create-recipe.md` was emitted with `apple, dev, certificates, identifiers, profiles, developer`. Six of fourteen bare.
- `xcode-signing-team-select-recipe.md` was emitted with `xcode, signing, team, select`. Four of sixteen bare.

If any of those files is promoted to `validated_v1` with the broad set intact, `brief-consistency-check.sh` fires on every brief that mentions any of those words. A Co-Exist iOS release brief pulls in the APNs auth-key recipe because the brief contains "apple". A status_board update mentioning "new client" pulls in the ASC create-app-record recipe because the slug token `new` is a trigger. This reproduces, once per captured recipe, the selectivity collapse that `triggers-must-be-narrow-not-broad.md` exists to prevent.

The structural cause is the recorder. The structural fix is a human or LLM reviewer hand-narrowing the triggers as a precondition for promotion. The recorder is not the right place to apply the discipline because the recorder has no semantic model of the rule the recipe encodes; the discipline lives downstream.

## How to apply

Before flipping a captured-recipe file from `status: untested_spec` to `status: validated_v1`:

1. Open the file. Read the body end to end.
2. Re-author the `triggers:` line from scratch. Apply the four discipline categories from `triggers-must-be-narrow-not-broad.md`:
   - Compound keyword joined by `-` or `_` (preferred).
   - Literal identifier: function name, URL fragment, env var, file path, hostname, binary name.
   - Specific person or organisation name.
   - Verb-phrase compound naming a failure mode or anti-pattern.
3. Delete every bare common noun. If the recorder seeded `xcode`, replace with a compound like `xcode-signing-team-select` or drop entirely when already covered by another compound.
4. Keep the trigger count in the 6 to 15 range.
5. Run the verification protocol below.
6. Only then flip `status:` to `validated_v1`.

## Do

- Treat the recorder-emitted trigger set as a placeholder that MUST be replaced, not a starting point to lightly edit.
- Keep `macro-recipe` and `captured-recipe` as triggers on every recipe; those are correctly narrow compounds and serve as the mechanical surfacing route into the recipe corpus as a whole.
- Cross-reference each recipe to its sister recipes via a `## Cross-references` section so `patterns_semantic_search` reaches it even when literal triggers miss.

## Do not

- Promote a captured recipe to `validated_v1` without re-authoring the triggers line. Status flip and trigger narrowing are a single ungate-able step.
- Edit the recorder to emit narrower triggers automatically. The recorder lacks the semantic model to make the call; the discipline lives in the human or LLM reviewer.
- Leave a recipe at `untested_spec` indefinitely on the grounds that "the triggers are still broad". The `status:` field tracks replay validation, not trigger hygiene. The trigger narrowing happens before validation, and the file may remain at `untested_spec` for other reasons but never because of triggers.

## Verification protocol

After narrowing, run a representative-brief check. Two passes:

```bash
# Pass 1: the recipe MUST NOT surface on an unrelated brief.
B='{"tool_name":"mcp__forks__spawn_fork","tool_input":{"brief":"<unrelated brief, e.g. status_board update for a new client>"}}'
echo "$B" | bash ~/ecodiaos/scripts/hooks/brief-consistency-check.sh 2>&1 1>/dev/null | grep CONTEXT-SURFACE | grep <recipe-filename>
# Expect: empty.

# Pass 2: the recipe MUST surface on a brief that genuinely targets it.
B='{"tool_name":"mcp__forks__spawn_fork","tool_input":{"brief":"<targeted brief naming the recipe domain>"}}'
echo "$B" | bash ~/ecodiaos/scripts/hooks/brief-consistency-check.sh 2>&1 1>/dev/null | grep CONTEXT-SURFACE | grep <recipe-filename>
# Expect: one line.
```

If pass 1 finds a hit, a trigger is still too broad; tighten it. If pass 2 finds zero, broaden one trigger to a slightly-less-narrow compound (never a bare common noun).

## Cross-references

- `~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md` (the general rule, Layer 2 of the surfacing architecture).
- `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` (the v2 recorder pipeline that emits these files).
- `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` (the v1 recorder pipeline; same defect class).
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` (the status lifecycle from `untested_spec` to `validated_v1`).
- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` (the five-layer surfacing meta-pattern that depends on Layer 2 selectivity).
- `~/ecodiaos/patterns/tate-recordings-are-primary-gui-learning-substrate.md` (the broader recording-as-substrate doctrine).

## Origin

2026-05-18 self-evolution Routine fire. Audit of `~/ecodiaos/patterns/` found three captured-recipe files (`apple-dev-apns-auth-key-create-recipe.md`, `asc-app-record-create-recipe.md`, `xcode-signing-team-select-recipe.md`), all captured 2026-05-07 by the os-hook-recorder, all carrying broad bare-noun trigger sets seeded from window-title tokens and `flow_slug` splits. Triggers on all three files were narrowed in the same fire; this pattern codifies the structural rule so the next recorder-output cohort is born under the discipline rather than carrying the same defect into promotion.
