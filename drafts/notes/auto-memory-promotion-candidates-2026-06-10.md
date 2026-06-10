---
generated_by: auto-memory-promotion-audit cron, task_id=d061e4f8-4f6f-44fd-9ef5-9c0f2236edaf
generated_at: 2026-06-10 11:32 AEST (Mac, MacBookPro.lan)
memory_dir_scanned: /Users/ecodia/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory/ (Mac canonical, 8 feedback files)
companion_audit: drafts/auto-memory-promotion-candidates-2026-06-09.md (scanned the legacy 64-file Corazon mirror; surfaced 3 different candidates pending at status_board ea5c4456)
citation_surfaces: ~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/*.jsonl session transcripts, backend/patterns/, backend/drafts/, backend/scripts/, backend/routines/
threshold: 5 cites per memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md promotion rule 1
---

# Auto-memory promotion candidates - Mac canonical corpus - 2026-06-10

## Substrate clarification (first)

Two auto-memory corpora exist on this host:

1. **Mac canonical** at `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/memory/` (8 feedback files, bootstrap 2026-06-08). This is where new memories land. Today's audit scans this.
2. **Legacy Corazon-mirror** at `~/.claude/projects/d---code-ecodiaos-backend/memory/` (~64 feedback files). Historical. Flagged for deletion per status_board 346b13b6 (`corazon-memory-md-fossils-2026-06-10`). Yesterday's audit scanned this.

The pending substrate-decision at status_board c604cfc6 names the canonical Mac path; the doctrine file's hardcoded `C:/Users/tjdTa/...` path is stale. Today's brief inherited the stale path; this audit silently corrected to the canonical path and scanned there.

## Citation map (all 6 Mac feedback files clear the 5-cite bar)

| Cites (transcript-files) | Memory slug | Pattern file already exists? |
|------:|-------------|--------------------|
| 183 + 2 patterns/ + 1 script | feedback_sim-driving-must-be-focusless | YES (`sim-driving-must-be-focusless-idb-simctl-never-activate-cliclick-2026-06-09.md`) |
| 18 + 1 draft | feedback_ecodia-marketing-title-template | NO |
| 12 | feedback_cdp-is-default-authorised-2026-06-09 | NO |
| 10 | feedback_default-to-mcp-use-is-authorised | NO |
| 10 | feedback_open-files-for-tate-when-mentioning-paths | NO |
| 6 | feedback_otp-gate-retired-2026-06-10 | YES (`otp-gate-retired-eos-confident-outbound-2026-06-10.md`) |

Cite count = unique session transcript files in `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/*.jsonl` that mention the slug, plus pattern + draft + script hits. Counts unique files, not occurrences; true intensity is higher.

## Net-new promotion candidates (4)

### Candidate 1 - CDP is default-authorised

Memory: `feedback_cdp-is-default-authorised-2026-06-09` (12 transcript cites, Tate verbatim 2026-06-09: "make sure you actually need cdp to submit for review, and if so, cpd attach, pin, alias, codify it and codify the fact that cdp is 99% of hte time auto-authorised").

Sister to `default-to-mcp-use-is-authorised` (candidate 2 below). The pair codifies authorisation-by-mount across CDP + MCP. Existing related doctrine: `chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md`, `cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08.md`. Neither carries the explicit "do not ask, just attach" rule with the destructive-click carve-out enumerated.

Recommend Pattern: **`cdp-is-default-authorised-attach-without-asking-2026-06-09.md`**.
triggers: cdp, chrome-driving, cdp-attach, ask-permission-to-attach, signed-in-chrome, default-authorised, destructive-last-click, play-console-cdp, asc-cdp, money-moving-click.

### Candidate 2 - MCP calls are default-authorised

Memory: `feedback_default-to-mcp-use-is-authorised` (10 transcript cites, Tate verbatim 2026-06-09 after the Locals Play rejection appeared in code@ Gmail and the conductor asked Tate to paste the body instead of calling `ecodia-comms.gmail_list_messages`).

Sister rule to candidate 1. Sharpens the parent `decide-do-not-ask` reflex for the substrate-call case. The how-to-apply already names the gmail userId routing and the .mcp.json fix path; doctrine-ready.

Recommend Pattern: **`mcp-calls-are-default-authorised-mount-is-consent-2026-06-09.md`**.
triggers: mcp-default-authorised, ask-tate-to-paste, mcp-tool-missing-fix-mcp-json, gmail-list-messages-routing, mcp-mount-is-consent, decide-do-not-ask-substrate-case, narrow-connector-bearer, paste-vs-call.

### Candidate 3 - Ecodia marketing-site title template

Memory: `feedback_ecodia-marketing-title-template` (18 transcript cites + 1 draft cite). Highest-cited net-new candidate. Tate verbatim 2026-06-08: "it's getting a bit symbolic and strong, it just needs to exist". Captures the strict `[product type] [for/of] [domain]` template, with verified-live canon for Glovebox / Chambers / ecodia.au / Locals, plus the CDP-read-the-live-sibling-first rule. The anti-pattern list (no editorial labels, no manifesto-shape, no "made easy" cringe, no em-dash, no X-not-Y pivots) is voice-substrate-adjacent but title-specific.

Existing related doctrine: `ecodiaos-voice-substrate-2026-05-26.md` (general voice), `ecodia-internal-docs-render-in-html-not-markdown` (internal docs aesthetic). Neither covers consumer marketing-site title templating with the verified-live canon.

Recommend Pattern: **`ecodia-marketing-site-title-template-2026-06-08.md`**. Sibling to the voice substrate, scope-narrowed to consumer marketing-site big-title sentences.
triggers: ecodia-marketing-title, marketing-site-title, big-title-sentence, ch-sentence, gl-sentence, glovebox-title, chambers-title, locals-title, product-page-title-template, no-manifesto-title, no-made-easy, no-symbolic-positioning.

### Candidate 4 - Open files for Tate when mentioning paths

Memory: `feedback_open-files-for-tate-when-mentioning-paths` (10 transcript cites). Tate verbatim 2026-06-09: "Could you open the location of the icon, i cant click that path. Codify the fact that you should open thins for me". The rule is concrete: chat references a non-text asset -> run `open <path>` same turn; carve-out for text files (IDE clickthrough works) and `/Users/ecodia/PRIVATE/` (recent-files leakage).

Less obviously system-doctrine than candidates 1 to 3, but the 10-cite climb and the no-overlap with any existing pattern argue for promotion. The rule is interaction-substrate, not relationship-style.

Recommend Pattern: **`open-files-for-tate-when-mentioning-paths-2026-06-09.md`**.
triggers: open-file-for-tate, finder-reveal, preview-png, markdown-link-not-clickable, open-folder, open-app-name, recent-files-leak, do-not-auto-open-private, deliverables-dir-reveal.

## Already-promoted candidates - housekeeping (2)

Both have a pattern file already, but the auto-memory file lacks the canonical `# Promoted to backend/patterns/<slug>.md - 2026-MM-DD` footer specified in `memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md` rule 1. Bodies cross-reference the pattern via `Codified:` / `Doctrine:` lines which is informative but non-canonical.

### Housekeeping 1 - sim-driving-must-be-focusless

Already at `patterns/sim-driving-must-be-focusless-idb-simctl-never-activate-cliclick-2026-06-09.md`. Memory file cross-references via wikilink. Add canonical footer:

```
# Promoted to backend/patterns/sim-driving-must-be-focusless-idb-simctl-never-activate-cliclick-2026-06-09.md - 2026-06-09
```

### Housekeeping 2 - otp-gate-retired-2026-06-10

Already at `patterns/otp-gate-retired-eos-confident-outbound-2026-06-10.md`. Memory file cross-references via `Doctrine:` prose. Add canonical footer:

```
# Promoted to backend/patterns/otp-gate-retired-eos-confident-outbound-2026-06-10.md - 2026-06-10
```

## Conductor confirmation needed

**Promote candidates 1 to 4** as new pattern files in `backend/patterns/` with the full Why + How to apply + Origin + cross-refs structure (the memory bodies already carry most of this; lift verbatim, add `triggers:` frontmatter). Register in `backend/patterns/INDEX.md`. Add the canonical footer to each promoted source memory file plus the two housekeeping cases. The knowledge-index ghost-pruner picks up the new files on the next nightly re-embed (or trigger manually via `node backend/knowledge-index/indexer.js`).

Order of promotion if doing one at a time: candidate 3 first (highest cite count, voice-adjacent, urgent next time a marketing site needs a title), then 1+2 as a paired CDP+MCP authorisation cluster, then 4.

## Methodology + caveats

- Cite count by `grep -lI "$slug"` against `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/*.jsonl` plus `backend/patterns/`, `backend/drafts/`, `backend/scripts/`, `backend/routines/`. Unique files only; true citation density is higher.
- Slug-match exact; kebab-case slug variants in linking files would be missed. Spot-checked the four candidates for naming-collision (none).
- Excluded the auto-memory file itself from its own cite count (the `name:` slug appears in the memory's own frontmatter).
- The 5-cite bar is the doctrine threshold. All 6 Mac files cleared it; the 4 net-new and the 2 housekeeping cases are the surface.
- The Mac canonical corpus is small (8 feedback files); the population is fully audited per fire. Cap-of-10 is not hit.
- Distinct from yesterday's audit (drafts/auto-memory-promotion-candidates-2026-06-09.md) which scanned the legacy Corazon mirror and surfaced 3 different candidates (still pending at status_board ea5c4456). Substrate clarification at status_board c604cfc6 remains the underlying open question.
