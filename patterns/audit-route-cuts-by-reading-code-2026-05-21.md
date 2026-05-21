---
triggers: audit, route-cut, feature-cut, refactor-plan, code-audit, verify-before-asserting, file-audit, route-collapse, feature-plan-audit
---

# Audit route or feature cuts by reading the code. Not by reading the names

## The rule

Before declaring a feature, route, or file CUTTABLE in any audit or refactor plan, open it and read what it does today. Names lie. Buildout-plan history lies. A route audited as "stub" three weeks ago may have been built out into a real feature since. A file whose name implies duplication may map to a genuinely separate concept in the schema.

## Specific worked example (chambers-frontend, 2026-05-21)

I produced a feature-plan that listed these as cuttable based on route names + an April buildout-plan reference alone:

| Cut verdict (wrong) | What reading the actual code showed |
|---|---|
| Resources is a stub | 330+ lines, gradient-tile + asymmetric grid layout, pulls from tenant_resources + chamber social links. Real feature. |
| CommitteesAdmin duplicates GroupsAdmin | CommitteesAdmin operates on `committees` table (governance bodies). GroupsAdmin operates on `focus_groups` + `focus_group_categories` (member interest segments with chat). Genuinely separate concepts. |
| Feedback page is overkill | Real working contact form that sends emails via supabase session. Small but functional. |
| OnboardingWizard is a sidebar nav route to cut | First-login officer experience at /admin/onboarding. The route is the wizard's home. |

All four would have been deleted in haste if the plan had been executed without the recon-first audit. The plan amendment landed as an addendum to chambers-feature-plan-2026-05-21.md before damage.

## Doctrine

For any audit that proposes more than 3 cuts:

1. Open every file the audit names. Read what it does today.
2. Verify named "duplicates" against the schema. Tables with different names are different concepts even if the admin UIs look similar.
3. Re-read any "stub" claim against the actual line count + the features it pulls from. Stubs are <50 lines and pull from nothing meaningful.
4. Walk recent git history on the file. A file with commits in the last 30 days has been touched recently and might have grown past its old description.

For audits scaling beyond ~10 files, dispatch a worker to read each file in parallel and report back per-file evidence-for-or-against cut. Do not trust a name-only audit on its own at scale.

## Anti-pattern (what NOT to do)

- Citing an old buildout plan as the current state of files. Buildout plans rot fast.
- Treating a "P0 missing" entry from months ago as still missing. Verify first.
- Cutting on instinct after reading only the file name + a sentence of description.

## Cross-refs

- `verify-deployed-state-against-narrated-state.md` (parent rule)
- `narration-vs-disk-reconciliation-checklist.md` (sibling)
- `chambers-competitive-landscape-wavecrm-2026-05-21.md` (companion from same session)

## Origin

2026-05-21 chambers Phase A planning. The original feature plan listed 10 routes for cut. After reading the actual code (in the very next session), 6 of those 10 turned out to be real features that should not be cut. Plan amended before any deletes landed. Without the read pass, the refactor would have deleted live functionality and possibly broken member-facing UI.
