---
triggers: drafts-filing, drafts-flat-dump, drafts-loose-files, workbench-filing, where-do-drafts-go, drafts-shots, verify-screenshot-filing, drafts-refile, drafts-hygiene, topic-dirs-for-drafts, work-in-progress-filing
category: doctrine
facet: meta
binding: script=~/.ecodiaos/bin/knowledge-health.sh + script=backend/scripts/drafts-apply-judgements.py + cron=sunday-doctrine-synthesis
---

# Drafts file into topic dirs, never the flat top level

`backend/drafts/` is the workbench, and the workbench has a filing rule like everything else: a draft lands in `drafts/<topic>/`, a verify screenshot or binary artifact lands in `drafts/_shots/<topic>/`, and the top level stays empty. The WHERE THINGS GO rule covered knowledge and machine files but left work-in-progress unspecified, so 560 loose files (screenshots, one-off audits, workbooks) accumulated flat and unnoticed; Tate caught it by eye on 2026-06-10, which means the system did not.

## The rule

- New draft text (md/html/notes/scripts): `drafts/<topic>/` where topic is the product, client, or workstream (`coexist/`, `chambers/`, `finance-notes/`, `fork-reports/`).
- Binary run-evidence (png/pdf/recordings): `drafts/_shots/<topic>/`. Gitignored (`drafts/_shots/`); screenshots are regenerable, they bloat the repo and index nothing.
- Finished work gets PROMOTED out: doctrine to `patterns/` via pattern-codify, reference to `docs/`, client material to `clients/`. A draft that stopped changing months ago is either promotable or archivable to `drafts/_archive/` (excluded from the index).
- Placement is a SEMANTIC judgement, never a filename heuristic. Tate verbatim 2026-06-10: "i dont want heuristic bullshit categorising stuff". READ the file, decide from what it says. `scripts/drafts-apply-judgements.py` applies a judgement JSONL ({file, action: move|archive|promote-doctrine|promote-reference, dest}) AFTER the reading is done; the token-mapper `drafts-refile.py` was the one-time bulk untangler, not the ongoing mechanism.
- The `notes/` catch-all is BANNED. A file that cannot be placed is a file that has not been read; the knowledge-health canary alarms on any file appearing in `drafts/notes/`. The weekly sunday-doctrine-synthesis cron runs the standing placement + promotion pass.

## Why

A flat dump defeats both retrieval and review: 560 siblings make every filename unfindable by eye, and the indexer ranks workbench noise against doctrine. The knowledge-health canary now counts loose top-level files (cap 15) and alarms at session start on drift, so this regrows loudly or not at all.

## Anti-patterns

- Dumping a verify screenshot at `drafts/` top level because the turn was busy. `_shots/<topic>/` costs the same keystroke.
- Treating "drafts are work-in-progress" as "drafts need no structure" (the exact wrong call the 2026-06-10 handoff brief carried).
- Hand-moving files one by one when the refile script exists.
