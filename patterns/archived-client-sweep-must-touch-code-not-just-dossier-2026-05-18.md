---
name: archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18
description: Archiving a client requires removing matcher entries, scripts, semgrep rulesets, gauntlet configs, and skill files in the same arc. Dossier note alone is insufficient. See the 117-file [redacted] leak.
triggers: client-archive, archived-client, [redacted]-archived, [redacted]-leak, client-sweep, matcher-entries, [redacted], archived-but-leaking, dossier-not-substrate, clientMention-matcher, semgrep-client-config, gauntlet-config, skill-archived, full-archival-sweep, 117-file-leak
status: active
---

# Archiving a client must touch the code, not just the dossier

Marking a client's status_board row archived and moving `clients/<slug>.md` to `clients/archived/<slug>/` is the **start** of an archival sweep, not the end. Every active client has dozens to hundreds of references scattered through the codebase: regex matchers, semgrep rulesets, gauntlet configs, custom skill files, scripts, environment-specific configs, sometimes routine prompts. **Archiving must remove or quarantine all of them in the same arc.**

## The rule

When archiving a client, the same fork / session MUST:

1. **Move the dossier** (`clients/<slug>.md` to `clients/archived/<slug>/` or `_archived/<slug>/`).
2. **Strip the matcher** (remove regex entries from [src/services/matchers/clientMention.js](../src/services/matchers/clientMention.js) and equivalents).
3. **Remove or quarantine scripts** (`scripts/<slug>-*.sh`, `tools/<slug>-*.sh`, `scripts/clients/<slug>/`).
4. **Remove semgrep rulesets** (`.semgrep/<slug>/`, `.semgrep/configs/<slug>.yml`).
5. **Remove gauntlet configs** (`scripts/gauntlet-configs/<slug>.sh`).
6. **Remove skill files** (`.claude/skills/<slug>-*/`). If kept for reference, mark `archived: true` in frontmatter AND remove from any active skill loader.
7. **Strip mention from CLAUDE.md / pattern files** (grep `~/CLAUDE.md`, `~/ecodiaos/CLAUDE.md`, `backend/patterns/` for the slug, replace with archived-note or delete).
8. **Update Neo4j** (set `Organization.archived_at` on the node, don't delete - preserves relationship history).
9. **Archive status_board rows** (`UPDATE status_board SET archived_at = NOW() WHERE entity_ref = '<slug>'`).
10. **Sweep the auto-memory references** (`C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/project_<slug>*.md` move to `memory/archive/`).

Verification: grep the slug across the repo. The only hits should be in archive directories, Neo4j history, and Episode/Decision nodes that reference the engagement (those stay, they're history).

## Why

Audit 2026-05-18: [redacted] was archived as a client in 2026-05-17 ("clients/archived/[redacted]/" exists). But:

- `src/services/matchers/clientMention.js:27-34` STILL hardcoded [redacted]/[redacted]/[redacted]/[redacted] as live regex targets. **Patched 2026-05-18 same arc.**
- **117 backend files still mention [redacted]**: `tools/[redacted]-prepush.sh`, `scripts/[redacted]-checks/*`, `scripts/gauntlet-configs/[redacted].sh`, `scripts/clients/[redacted]/`, `.semgrep/[redacted]/`, `.claude/skills/_archived/[redacted]-prepush-pipeline/` (in the skill loader despite the `_archived` prefix).
- Every fork brief, factory dispatch, or perception event mentioning [redacted] STILL triggers a CRM intelligence dispatch.

The dossier said archived. The substrate said active. The substrate wins every time, because the substrate is what fires when an event arrives.

The reverse failure also exists: Wildmountains was verbally locked as a client 2026-05-18 but was NOT in clientMention.js. Inverse symptom, same root cause: dossier-only state diverges from substrate state. **Added 2026-05-18 same arc.**

## How to apply

**Standard archival fork brief:**

```
Archive client <slug>. Sweep all of these in one arc:

1. mv clients/<slug>.md clients/archived/<slug>.md
2. Strip <slug> regex from src/services/matchers/clientMention.js _activeClients
3. find . -path ./node_modules -prune -o -name "*<slug>*" -print  
   For each hit: move to archived/ or delete with rationale
4. grep -r "<slug>" .semgrep/ scripts/gauntlet-configs/ scripts/clients/ tools/ .claude/skills/ --files-with-matches
   For each hit: archive or delete
5. UPDATE status_board SET archived_at = NOW() WHERE entity_ref = '<slug>' OR name ILIKE '%<slug>%'
6. Cypher: MATCH (o:Organization {slug: '<slug>'}) SET o.archived_at = datetime()
7. mv ~/.claude/projects/.../memory/project_<slug>*.md memory/archive/
8. Verify: final grep for "<slug>" returns only history-preserving locations (Episode/Decision nodes, archive/ dirs)
```

**Inverse pattern (new active client onboarding):** mirror the rule. Adding a client to status_board / Neo4j without also adding the matcher entry, the semgrep ruleset (if their codebase needs scanning), and the skill files (if their workflow needs them) is incomplete onboarding. See Wildmountains.

## Verification

Post-sweep verification command:

```bash
grep -r "<slug>" . --include="*.{js,md,sh,yml,json}" --exclude-dir=node_modules --exclude-dir=archive --exclude-dir=_archived --exclude-dir=archived 2>/dev/null | wc -l
```

Should return either 0 or a number small enough to manually inspect, and every remaining hit should have a clear justification (Episode node, historical Decision, archive directory).

## Origin

CRM audit 2026-05-18 found 117 [redacted]-mention files post-archival. The dossier-only archival pattern leaked into matchers, scripts, semgrep, gauntlet, and skill files. Codifying the rule so the next archival is a one-shot fork instead of a continuing leak.

## Cross-refs

- [[client-dossier-must-update-on-every-touch]]
- [[stale-client-threshold-by-tier]]
- [[distributed-state-seam-failures-are-the-core-infrastructure-risk]]
- [[verify-deployed-state-against-narrated-state]]
