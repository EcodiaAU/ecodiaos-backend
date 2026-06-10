---
triggers: drafts-filing, drafts-flat-dump, drafts-loose-files, workbench-filing, where-do-drafts-go, drafts-shots, verify-screenshot-filing, drafts-refile, drafts-hygiene, topic-dirs-for-drafts, work-in-progress-filing
category: doctrine
facet: meta
binding: script=~/.ecodiaos/bin/knowledge-health.sh + script=backend/scripts/drafts-refile.py
---

# Drafts file into topic dirs, never the flat top level

`backend/drafts/` is the workbench, and the workbench has a filing rule like everything else: a draft lands in `drafts/<topic>/`, a verify screenshot or binary artifact lands in `drafts/_shots/<topic>/`, and the top level stays empty. The WHERE THINGS GO rule covered knowledge and machine files but left work-in-progress unspecified, so 560 loose files (screenshots, one-off audits, workbooks) accumulated flat and unnoticed; Tate caught it by eye on 2026-06-10, which means the system did not.

## The rule

- New draft text (md/html/notes/scripts): `drafts/<topic>/` where topic is the product, client, or workstream (`coexist/`, `chambers/`, `finance-notes/`, `fork-reports/`). No fitting topic: `drafts/notes/`.
- Binary run-evidence (png/pdf/recordings): `drafts/_shots/<topic>/`. Gitignored (`drafts/_shots/`); screenshots are regenerable, they bloat the repo and index nothing.
- Finished work gets PROMOTED out: doctrine to `patterns/` via pattern-codify, reference to `docs/`, client material to `clients/`. A draft that stopped changing months ago is either promotable or archivable to `drafts/_archive/` (excluded from the index).
- Bulk re-file is mechanical: `scripts/drafts-refile.py` (dry-run default, `--execute` to move; token-to-topic map inside).

## Why

A flat dump defeats both retrieval and review: 560 siblings make every filename unfindable by eye, and the indexer ranks workbench noise against doctrine. The knowledge-health canary now counts loose top-level files (cap 15) and alarms at session start on drift, so this regrows loudly or not at all.

## Anti-patterns

- Dumping a verify screenshot at `drafts/` top level because the turn was busy. `_shots/<topic>/` costs the same keystroke.
- Treating "drafts are work-in-progress" as "drafts need no structure" (the exact wrong call the 2026-06-10 handoff brief carried).
- Hand-moving files one by one when the refile script exists.
