#!/usr/bin/env python3
"""Apply semantic placement judgements (JSONL) to backend/drafts/.

Input lines: {"file": <rel>, "action": move|archive|promote-doctrine|promote-reference, "dest"?: <dir>, "reason"?: str}
- move: drafts/<dest>/<basename>
- archive: drafts/_archive/<original-parent>/<basename>
- promote-*: NOT moved here (needs authored frontmatter); listed for the conductor.
Dry-run by default; --execute moves.
"""
import json
import sys
import shutil
from pathlib import Path

DRAFTS = Path("/Users/ecodia/.code/ecodiaos/backend/drafts")


def main() -> None:
    execute = "--execute" in sys.argv
    jsonl = [a for a in sys.argv[1:] if not a.startswith("--")][0]
    moves, promotes, missing = [], [], []
    for line in Path(jsonl).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        src = DRAFTS / d["file"]
        if not src.exists():
            missing.append(d["file"])
            continue
        if d["action"] == "move":
            moves.append((src, DRAFTS / d["dest"] / src.name))
        elif d["action"] == "archive":
            moves.append((src, DRAFTS / "_archive" / src.parent.name / src.name))
        else:
            promotes.append((d["file"], d["action"], d.get("reason", "")))

    print(f"{len(moves)} moves, {len(promotes)} promote-candidates, {len(missing)} missing"
          + (" [EXECUTING]" if execute else " [dry-run]"))
    for f, a, r in promotes:
        print(f"  PROMOTE {a}: {f}  ({r})")
    for f in missing:
        print(f"  MISSING: {f}")
    if not execute:
        return
    done = 0
    for src, dst in moves:
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            print(f"  SKIP (exists): {dst}")
            continue
        shutil.move(str(src), str(dst))
        done += 1
    print(f"moved {done}/{len(moves)}")


if __name__ == "__main__":
    main()
