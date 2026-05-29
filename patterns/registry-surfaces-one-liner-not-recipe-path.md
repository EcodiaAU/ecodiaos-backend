---
triggers: registry-quick-ship, dev-process-registry-row, ship-script-vs-recipe, one-liner-discovery, codify-quick-ship, asc-driver-already-exists, headless-driver-already-on-sy094, registry-hook-surface, dont-author-from-scratch-when-driver-exists, ship-ios-py-coexist, ship-ios-py-glovebox, codified-flow-already-on-disk
status: active
origin: 2026-05-29
---

# The dev-process registry surfaces the one-liner, not the recipe path

When a codebase has a working headless ship driver on disk (typically `~/asc-scripts/ship-ios.py <slug>` on SY094, or an equivalent script in the repo), the registry row's `ship_scripts.<platform>` AND a new `quick_ship.<platform>` field MUST surface the literal one-line invocation, not a path to a recipe markdown.

**Why:** the conductor reads the registry surface at turn start via the `dev_process_reflex_surface.py` hook. If the surface points at a recipe markdown, the conductor opens it, scrolls 200 lines, and may still author the work from scratch (especially under context pressure or when the recipe contradicts itself). If the surface IS the one-liner, the conductor runs it. Worked instance: 2026-05-29 Co-Exist 1.8.25 ship - the headless `ship-ios.py coexist` driver had been on SY094 since 17 May 2026 alongside per-app spec, asc-probe, attach-submit, retry-attach, and reusable Corazon helpers under `D:/.code/coexist/scripts/`. None surfaced. I authored a parallel ship script + ASC probe from scratch in `drafts/`, lost a Node-version round trip, and burned 30+ tool calls before Tate flagged the duplication. Cost to add the quick_ship field: 10 minutes. Cost of not having it: every ship.

**How to apply:**

1. Every registry row at `~/.claude/hooks/ecodia/lib/dev-process-registry.json` carries a `quick_ship` object: one entry per platform, value = the literal command including bastion hop + auth + driver path. Conductor runs the value verbatim.
2. `quick_ship.<platform>_probe_only` (or `_status`) carries the read-only inspection command. Always run before bumping version. ASC probe answers the train-closed-or-not question and prevents the wrong bump.
3. `ship_scripts.<platform>` keeps the recipe path AS WELL as the driver pointer. Recipe is the doctrine when the driver fails or when authoring a new app's spec; driver is the default path.
4. Add an `asc` block (or `play` / equivalent store block) with `app_id`, `team_id`, `bundle_id`, `api_key_id`, `api_issuer_id`, `p8_path_*`, `primary_locale`, `release_type`, and a `stale_key_warning` if `kv_store.creds.*` carries an out-of-date pointer for the same artifact.
5. Add a `sy094` (or build-host) block with `build_path`, `xcode_project`, `xcode_scheme`, `build_system`, `creds_kv`, `ssh_path`.
6. Add `node_version_required` (or runtime-version-required) when the platform has a hard floor that does not match the SY094 default. SY094 default is now Node 22 via `nvm alias default 22` as of 2026-05-29; record any future drift.
7. The hook's `_format_codebase_row` surfaces `quick_ship` FIRST in the output block, before deploy/ship/asc/sy094/notes. Ordering matters: the conductor reads top-down and may stop at the first actionable line.
8. The hook's `SHIP_VERBS` regex covers the ship vocabulary the user actually uses: `submit`, `upload`, `archive`, `distribute`, `publish`, `testflight`, `app store`, `asc` are all ship verbs alongside `ship`/`deploy`/`push`. Add new verbs the moment Tate uses one that doesn't match.
9. Maintenance contract: when a new driver script lands, the same edit updates the registry row's `quick_ship` + `ship_scripts` to point at it. Repo-local helper scripts (e.g. `D:/.code/coexist/scripts/asc-probe-version.py`) that are SUPERSEDED by the SY094 driver get a one-line `notes` callout flagging them as superseded, with a do-not-author-new-ones directive.
10. The deprecation banner on any old recipe (e.g. the GUI-RDP path) narrows the recipe's `triggers:` frontmatter to GUI-fallback-only keywords + adds `superseded_by: <new-recipe>.md`, so the deprecated recipe stops surfacing on routine ship prompts.

**When a recipe contradicts the live driver:** the driver wins. Update the recipe in the same turn to mark the contradiction resolved. Worked instance 2026-05-29: `sy094-coexist-ios-release-recipe.md` Phase G-headless claimed SSH path silently fails without GUI Aqua context; the 2m56s end-to-end SSH ship contradicts this. Recipe was updated with a deprecation banner pointing at the headless protocol.

**Anti-pattern to avoid:** authoring a "fresh, clean" ship script in `drafts/` when the codified driver already exists on SY094 or in the repo's `scripts/`. The drafts-first reflex feels like ownership; it costs a full ship cycle. Before authoring any ship/probe/upload script, run `ls ~/asc-scripts/ apps/` on SY094 AND `ls <repo>/scripts/` for the matching codebase. Empty? Author. Populated? Read + extend.

Cross-references:

- [[dev-process-end-to-end-visual-cdp-deploy-verify]] - the eight-rung dev process the registry serves.
- [[ios-app-asc-headless-ship-protocol]] - the universal 10-step iOS ship protocol that ship-ios.py implements.
- [[coexist-ios-headless-ship-recipe]] - per-app deltas for Co-Exist.
- [[sy094-coexist-ios-release-recipe]] - GUI-RDP fallback (deprecated 2026-05-29).
- [[verify-deployed-state-against-narrated-state]] - probe ASC before bumping version, not after.
- [[use-anthropic-existing-tools-before-building-parallel-infrastructure]] - parent doctrine; this pattern is the per-codebase instance.
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the triad rule. Hook + registry + doctrine all shipped same turn.
