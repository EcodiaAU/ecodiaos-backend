---
triggers: em-dash, en-dash, U+2014, U+2013, output-formatting, character-level-banned, no-emdash, em-dash-creep, em-dash-sweep, hyphen-substitute, ai-giveaway-emdash, no-output-emdash, never-output-emdash, emdash-creep, emdash-detector, emdash-hook, character-level-rule, formatting-rule-1, formatting-rule-2
---

# Em-dashes (U+2014) banned at character level - no exceptions, ever

## The rule

NO em-dashes (`-`, U+2014) ANYWHERE in any output. Ever. Character-level absolute.

NO en-dashes (`-`, U+2013) UNLESS the dash sits between two digits (numeric range like `2024-2025`) AND the hyphen would be genuinely ambiguous. Default: replace with ` - ` too.

This applies to:
- Source code (comments, string literals, JSDoc, JSX content, log messages)
- Markdown (doctrine files, READMEs, drafts authored fresh today, status_board context I author today)
- Database content (any user-visible string column we author)
- Outbound emails / SMS / chat / Slack
- Commit messages
- Neo4j node descriptions and Decisions
- Status_board next_action / context strings
- Pattern files
- Newsletter editions, social posts, contracts, proposals, invoices, anything client-facing
- This file and every file like it

Substitute with ` - ` (space-hyphen-space). If grammar reads better restructured, restructure.

## Origin

Tate verbatim 6 May 2026 ~20:22 AEST: "ALso emdashes have seeped backinto our work. We should never be outputting emdashes in any circumstances full stop. Chambers has lots of emdashes build it and in content im pretty sure."

This was a re-statement of the standing rule already in `~/CLAUDE.md` "Output Formatting (Global Absolute Rules)" rules 1 and 2. The fact Tate had to say it again means written discipline alone is not enforcing it. Em-dashes had crept back through Factory output, fork-authored doctrine, edge functions, generated content, and tenant DB rows.

## Sweep that proved the creep (6 May 2026)

Fork `fork_motwuj6r_5cf640` ran a UTF-8-safe Python sweep (`scripts/emdash-sweep.py`) across:

- Chambers FE: 47 em-dashes across 15 files
- Co-Exist FE: 332 em + 32 non-numeric en across 107 files
- EcodiaSite: 26 em + 3 en across 5 files
- ecodiaos backend: 2304 em + 8 en across 256 files
- Chambers Supabase tenant_events: 3 rows
- Co-Exist Supabase legal_pages: 2 rows

Total roughly 2700 em-dash and 40 en-dash characters expunged in one pass. That's the magnitude of "creep" without enforcement.

## Why written discipline alone fails

- Factory dispatches produce code with em-dashes by default. Claude Code (the dispatcher) inherits the model's training-distribution preference for `-` in prose comments and log messages. Without a hook, every Factory run is a fresh source of regression.
- Forks executing briefs author drafts and patterns containing em-dashes. Same training distribution, same regression vector.
- Edge function code authored by humans (or by a different agent) ships through git untouched.
- DB content seeded from prompted LLM output (events, legal pages, marketing strings) carries em-dashes into Postgres rows.
- Reading `~/CLAUDE.md` rule 1 once does not prevent the next 50 turns from regenerating em-dashes; the rule is character-level and the model's prior is strong.

## Enforcement substrates (mechanical)

The rule lives at three layers, in increasing order of finality:

1. **PreToolUse hook on Edit/Write/MultiEdit** (`~/ecodiaos/scripts/hooks/emdash-detector.sh`). Scans the `new_string` / `content` parameter for U+2014 / non-numeric U+2013. Emits `[EMDASH WARN] em-dash detected in <path>` to model-visible context. Warn-only, never blocks. Wired in `~/.claude/settings.json` PreToolUse list.
2. **Periodic sweep** via `~/ecodiaos/scripts/emdash-sweep.py`. Run before any high-leverage release (newsletter publish, Vercel deploy of marketing site, client deliverable, doctrine cron). Authors a status_board P3 row if it finds anything to repair. Excludes evidence dirs (patterns/, clients/, drafts/, audits/, dao/, public/, journal/, .claude/) where verbatim Tate quotes need to stay verbatim.
3. **Doctrine** (this file). When the hook does not catch (because the substrate isn't an Edit/Write tool, e.g. DB writes, outbound API), this file surfaces via the trigger-keyword grep and reminds me to substitute manually before sending.

## Failure modes (do not let any of these recur)

1. **Factory dispatch produces a file with em-dashes** - the brief MUST end with: "No em-dashes anywhere. Substitute with ` - `. This is character-level absolute (~/ecodiaos/patterns/em-dashes-banned-character-level-no-exceptions.md)." If the brief omits this, the dispatch is incomplete.
2. **Fork authors a draft / pattern with em-dashes** - same brief footer. Hooks catch it post-write but the model should not produce it in the first place.
3. **DB seed via API call carries em-dashes** - any `db_execute` / Edge Function INSERT/UPDATE producing user-visible strings runs the input through ` - ` substitution before send.
4. **Outbound email/SMS/post via MCP** - same substitution before send. The hook does not see API params for `gmail.send` etc; this is on the model.
5. **Doctrine cross-reference / commit message uses em-dash** - hook on Edit / shell_exec catches it. Re-write.
6. **A re-sweep finds non-zero count** - that's a doctrine-failure signal, status_board P3 row authored automatically.

## Anti-patterns

- "But Tate's earlier message had an em-dash, so the surrounding context naturally has one" - if you're quoting his message verbatim into a `kv_store.context` row or status_board.context as evidence, that is allowed (evidence vs output). Otherwise, no.
- "It's just a comment, not user-visible" - false. Source code is shipped to Tate. Tate reads diffs. Em-dashes leak out of comments through grep output, search results, error log surfacing, and through future LLM-generated content trained on the codebase. Comments are output.
- "I'll fix it later in a sweep" - the sweep cost has been paid. No more "later". Substitute at write time.

## Cross-references

- `~/CLAUDE.md` Output Formatting rules 1 and 2 (the canonical short-form rule)
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` (this file is itself an instance of that pattern)
- `~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md` (kebab-case narrow trigger discipline)
- `~/ecodiaos/patterns/prefer-hooks-over-written-discipline.md` (why mechanical enforcement supersedes written rules)
- `~/ecodiaos/scripts/emdash-sweep.py` (the sweep tool)
- `~/ecodiaos/scripts/hooks/emdash-detector.sh` (the PreToolUse warn hook)

## Sweep tool usage

```bash
# Dry-run on a target
python3 ~/ecodiaos/scripts/emdash-sweep.py --dry ~/workspaces/chambers/fe

# Apply
python3 ~/ecodiaos/scripts/emdash-sweep.py ~/workspaces/chambers/fe

# Multi-target
python3 ~/ecodiaos/scripts/emdash-sweep.py /path/a /path/b
```

The script is UTF-8-safe (em-dash is 3 bytes E2 80 94), preserves digit-en-digit numeric ranges, and excludes vendor bundles, build artefacts, .git, node_modules, ios/android native build dirs, and evidence dirs.
