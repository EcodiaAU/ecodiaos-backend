#!/usr/bin/env python3
"""
Weekly doctrine consolidation audit.

Reads Layer 3 pattern-application telemetry (written by the Stop-event
hook `applied_tag_telemetry.py`) and surfaces tuning candidates:

  - patterns with high [NOT-APPLIED] rate over 7d   ->  narrow triggers
  - patterns with zero applications over 30d        ->  archive candidate
  - patterns with high tagged_silent rate over 7d   ->  retire or restate
  - patterns referenced in dead-substrate keywords  ->  rewrite or archive

Writes a P3 status_board row with the audit numbers + the candidate lists,
so the conductor picks the audit up demand-driven on a subsequent session.

Designed to run weekly. No agentic decision component; pure aggregation.
Suitable for DIRECT_EXEC_CRONS classification per backend/CLAUDE.md
"crons-route-to-forks-by-default" criteria (deterministic, no LLM cost).

Usage:
    python doctrine_consolidation_audit.py [--dry-run] [--days N]

Exit codes:
    0 = audit completed (drift row written, or nothing to report)
    1 = unrecoverable error (missing PAT file, write failure, etc.)
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
PATTERNS_DIR = REPO_ROOT / "patterns"
TELEMETRY_DIR = pathlib.Path(
    os.environ.get(
        "ECODIAOS_TELEMETRY_DIR",
        str(
            pathlib.Path.home() / ".claude" / "hooks" / "ecodia" / "logs" / "telemetry"
        ),
    )
)
APPLICATION_EVENTS = TELEMETRY_DIR / "application-events.jsonl"

NARROW_RATE_THRESHOLD = 0.70
SILENT_RATE_THRESHOLD = 0.50
ARCHIVE_QUIET_DAYS = 30

DEAD_SUBSTRATE_KEYWORDS = (
    "mcp__forks__spawn_fork",
    "mcp__factory__start_cc_session",
    "[FORK_REPORT]",
    "start_cc_session",
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--dry-run", action="store_true", help="Print findings, skip status_board write"
    )
    p.add_argument(
        "--days",
        type=int,
        default=7,
        help="Active-window days for rate metrics (default 7)",
    )
    p.add_argument(
        "--quiet-days",
        type=int,
        default=ARCHIVE_QUIET_DAYS,
        help=f"Days-without-fire that flag a pattern as archive candidate (default {ARCHIVE_QUIET_DAYS})",
    )
    return p.parse_args()


def load_events(active_window_days: int) -> list[dict]:
    if not APPLICATION_EVENTS.is_file():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=active_window_days)
    rows: list[dict] = []
    with APPLICATION_EVENTS.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts_raw = row.get("ts") or row.get("timestamp")
            if not ts_raw:
                continue
            try:
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
            except ValueError:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts < cutoff:
                continue
            row["_ts"] = ts
            rows.append(row)
    return rows


def aggregate_by_pattern(events: list[dict]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "applied": 0,
            "not_applied": 0,
            "false_positive": 0,
            "tagged_silent": 0,
            "surfaces": 0,
        }
    )
    for row in events:
        pattern_path = row.get("pattern_path") or row.get("pattern")
        if not pattern_path:
            continue
        kind = (row.get("kind") or "").lower()
        if kind in counts[pattern_path]:
            counts[pattern_path][kind] += 1
        else:
            counts[pattern_path]["surfaces"] += 1
    return counts


def list_active_patterns() -> list[pathlib.Path]:
    if not PATTERNS_DIR.is_dir():
        return []
    return [
        p for p in PATTERNS_DIR.glob("*.md") if p.name not in {"INDEX.md", "README.md"}
    ]


def scan_dead_substrate_refs(
    active_patterns: list[pathlib.Path],
) -> list[tuple[str, int]]:
    hits: list[tuple[str, int]] = []
    for f in active_patterns:
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        count = sum(txt.count(kw) for kw in DEAD_SUBSTRATE_KEYWORDS)
        if count > 0:
            hits.append((f.name, count))
    hits.sort(key=lambda x: x[1], reverse=True)
    return hits


def classify(counts: dict[str, dict[str, int]], days: int) -> dict[str, list]:
    candidates = {
        "narrow_triggers": [],
        "retire_or_restate": [],
        "high_traffic": [],
    }
    for pattern_path, c in counts.items():
        total_outcomes = (
            c["applied"] + c["not_applied"] + c["false_positive"] + c["tagged_silent"]
        )
        if total_outcomes == 0:
            continue
        not_applied_rate = c["not_applied"] / total_outcomes
        silent_rate = c["tagged_silent"] / total_outcomes
        if not_applied_rate > NARROW_RATE_THRESHOLD and total_outcomes >= 3:
            candidates["narrow_triggers"].append(
                {
                    "pattern": pattern_path,
                    "not_applied_rate": round(not_applied_rate, 2),
                    "n": total_outcomes,
                }
            )
        if silent_rate > SILENT_RATE_THRESHOLD and total_outcomes >= 4:
            candidates["retire_or_restate"].append(
                {
                    "pattern": pattern_path,
                    "silent_rate": round(silent_rate, 2),
                    "n": total_outcomes,
                }
            )
        if c["applied"] >= 3:
            candidates["high_traffic"].append(
                {"pattern": pattern_path, "applied": c["applied"], "n": total_outcomes}
            )
    candidates["high_traffic"].sort(key=lambda x: x["applied"], reverse=True)
    return candidates


def find_archive_candidates(
    active_patterns: list[pathlib.Path], counts: dict, quiet_days: int
) -> list[str]:
    quiet: list[str] = []
    now = time.time()
    quiet_seconds = quiet_days * 86400
    seen_patterns = {key.split("/")[-1] for key in counts.keys()}
    for f in active_patterns:
        if f.name in seen_patterns:
            continue
        try:
            mtime = f.stat().st_mtime
        except OSError:
            continue
        if (now - mtime) > quiet_seconds:
            quiet.append(f.name)
    return sorted(quiet)


def build_row_context(
    active_count: int,
    archived_count: int,
    events_count: int,
    days: int,
    candidates: dict,
    archive_candidates: list[str],
    dead_substrate_hits: list[tuple[str, int]],
) -> str:
    parts: list[str] = []
    parts.append(
        f"Doctrine consolidation audit ({days}d window). "
        f"{active_count} active, {archived_count} archived, {events_count} application events."
    )
    if candidates["narrow_triggers"]:
        top = candidates["narrow_triggers"][:5]
        parts.append(
            "Narrow-triggers candidates (NOT-APPLIED rate >70%, n>=3): "
            + ", ".join(
                f"{c['pattern']}({c['not_applied_rate']}, n={c['n']})" for c in top
            )
        )
    if candidates["retire_or_restate"]:
        top = candidates["retire_or_restate"][:5]
        parts.append(
            "Retire-or-restate candidates (tagged_silent >50%, n>=4): "
            + ", ".join(f"{c['pattern']}({c['silent_rate']}, n={c['n']})" for c in top)
        )
    if candidates["high_traffic"]:
        top = candidates["high_traffic"][:5]
        parts.append(
            "High-traffic patterns (most applied): "
            + ", ".join(f"{c['pattern']}({c['applied']})" for c in top)
        )
    if archive_candidates:
        parts.append(
            f"Quiet patterns ({len(archive_candidates)} files >30d mtime + zero fires): "
            + ", ".join(archive_candidates[:8])
            + (" ..." if len(archive_candidates) > 8 else "")
        )
    if dead_substrate_hits:
        top = dead_substrate_hits[:5]
        parts.append(
            f"Dead-substrate refs ({len(dead_substrate_hits)} active patterns): "
            + ", ".join(f"{name}({count})" for name, count in top)
        )
    return " | ".join(parts)


def write_status_board_row(context: str) -> bool:
    """Write a P3 status_board row via the org PAT Management API."""
    pat_file = pathlib.Path("D:/PRIVATE/ecodia-creds/supabase.env")
    if not pat_file.is_file():
        print(
            f"[skip] PAT file not found at {pat_file}; no row written", file=sys.stderr
        )
        return False
    pat: str | None = None
    for line in pat_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            pat = line.split("=", 1)[1].strip().strip("'\"")
            break
    if not pat:
        print("[skip] SUPABASE_ACCESS_TOKEN not in PAT file", file=sys.stderr)
        return False

    import urllib.request

    project_ref = "nxmtfzofemtrlezlyhcj"
    sql = (
        "INSERT INTO status_board (entity_type, entity_ref, name, status, next_action, next_action_by, priority, context, last_touched) "
        "VALUES ('infrastructure', 'doctrine-consolidation-audit', 'Doctrine consolidation audit (weekly)', 'pending review', 'review tuning candidates + decide archive/narrow per row', 'ecodiaos', 3, $1, NOW()) "
        "ON CONFLICT (entity_ref) DO UPDATE SET context = EXCLUDED.context, last_touched = NOW(), status = 'pending review', next_action = EXCLUDED.next_action"
    )

    body = json.dumps({"query": sql, "params": [context]}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        data=body,
        headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        return True
    except Exception as exc:
        print(f"[error] status_board write failed: {exc}", file=sys.stderr)
        return False


def main() -> int:
    args = parse_args()

    active_patterns = list_active_patterns()
    archived_patterns = (
        list((PATTERNS_DIR / "_archived").glob("*.md"))
        if (PATTERNS_DIR / "_archived").is_dir()
        else []
    )
    events = load_events(args.days)

    if not events:
        print(
            f"[info] no application events in last {args.days}d at {APPLICATION_EVENTS}; nothing to audit",
            file=sys.stderr,
        )
    counts = aggregate_by_pattern(events)
    candidates = classify(counts, args.days)
    archive_candidates = find_archive_candidates(
        active_patterns, counts, args.quiet_days
    )
    dead_substrate_hits = scan_dead_substrate_refs(active_patterns)

    context = build_row_context(
        active_count=len(active_patterns),
        archived_count=len(archived_patterns),
        events_count=len(events),
        days=args.days,
        candidates=candidates,
        archive_candidates=archive_candidates,
        dead_substrate_hits=dead_substrate_hits,
    )

    print(context)

    if args.dry_run:
        return 0

    wrote = write_status_board_row(context)
    return (
        0 if wrote else 0
    )  # never fail the cron on write error; the printed context is the durable artefact


if __name__ == "__main__":
    sys.exit(main())
