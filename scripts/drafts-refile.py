#!/usr/bin/env python3
"""Re-file the flat dump at backend/drafts/ into topic dirs.

Rules (mechanical, deterministic):
- Binary artifacts (png/jpg/jpeg/gif/pdf/mov/mp4/webp) -> drafts/_shots/<topic>/
  (verify-run evidence; not indexed, kept out of git via .gitignore)
- Text files (md/html/txt/py/json/sh/sql/csv/js/ps1) -> drafts/<topic>/
- <topic> = mapped first filename token; tokens with no mapping and <4 files
  land in drafts/notes/.
- Existing subdirectories are left untouched.
Dry-run by default; --execute performs the moves (plain mv; git detects renames
of tracked files at commit time).
"""
import re
import sys
import shutil
from collections import Counter
from pathlib import Path

DRAFTS = Path("/Users/ecodia/.code/ecodiaos/backend/drafts")
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".mov", ".mp4", ".webp"}

# first-token -> topic dir. Anything unmapped with >=4 sibling files keeps its
# token as the dir name; the long tail goes to notes/.
TOKEN_MAP = {
    "play": "play-console",
    "coexist": "coexist",
    "algorithmic": "algorithmic-manager-kit",
    "glovebox": "glovebox",
    "chambers": "chambers",
    "fork": "fork-reports",
    "ecodia": "ecodia",
    "claude": "claude-md-audits",
    "meeting": "meetings",
    "cp": "conservation-platform",
    "phase": "phase-audits",
    "becs": "becs-payments",
    "status": "status-board-audits",
    "cortex": "cortex",
    "travel": "travel",
    "scheduler": "scheduler-notes",
    "resonaverde": "resonaverde",
    "roam": "roam",
    "preview": "previews",
    "zernio": "zernio",
    "bas": "finance-notes",
    "bookkeeping": "finance-notes",
    "invoice": "finance-notes",
    "xero": "finance-notes",
    "locals": "locals",
    "woodfordia": "woodfordia",
    "goodreach": "goodreach",
    "tg": "telegram",
    "hook": "hook-audits",
    "knowledge": "knowledge-notes",
    "inner": "inner-life",
    "asc": "asc-notes",
    "ios": "ios-notes",
    "android": "android-notes",
    "mcp": "mcp-notes",
    "voice": "voice-notes",
    "wave": "wave-killer",
    "moss": "moss-projects",
    "crystal": "crystal-waters",
    "climate": "climate-disclosure",
}


def token_of(name: str) -> str:
    m = re.match(r"([a-zA-Z0-9]+)", name)
    return m.group(1).lower() if m else "notes"


def main() -> None:
    execute = "--execute" in sys.argv
    loose = [p for p in DRAFTS.iterdir() if p.is_file() and not p.name.startswith(".")]
    counts = Counter(token_of(p.name) for p in loose)
    plan = []
    for p in loose:
        tok = token_of(p.name)
        topic = TOKEN_MAP.get(tok) or (tok if counts[tok] >= 4 else "notes")
        base = DRAFTS / "_shots" / topic if p.suffix.lower() in BINARY_EXT else DRAFTS / topic
        plan.append((p, base / p.name))

    by_dir = Counter(str(dst.parent.relative_to(DRAFTS)) for _, dst in plan)
    print(f"{len(plan)} files -> {len(by_dir)} dirs" + (" [EXECUTING]" if execute else " [dry-run]"))
    for d, n in sorted(by_dir.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d}  {d}")

    if not execute:
        return
    moved = 0
    for src, dst in plan:
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            print(f"  SKIP (exists): {dst}")
            continue
        shutil.move(str(src), str(dst))
        moved += 1
    print(f"moved {moved}/{len(plan)}")


if __name__ == "__main__":
    main()
