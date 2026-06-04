"""
Installs the 75-cron corpus from cron-corpus-spec.yaml onto the laptop-agent
scheduler (localhost:7456). Idempotent on (name): existing crons with matching
name are cancelled and recreated under the new template grammar.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
import yaml

# Make sibling-module import work both when invoked as a script and when
# imported under a package context.
sys.path.insert(0, str(Path(__file__).parent))
from cron_prompt_builder import build_prompt  # noqa: E402

AGENT_URL = os.environ.get("LAPTOP_AGENT_URL", "http://127.0.0.1:7456")
AGENT_TOKEN_PATH = Path(
    os.environ.get(
        "LAPTOP_AGENT_TOKEN",
        str(Path.home() / ".ecodiaos" / "laptop-agent.token"),
    )
)

SUPABASE_CREDS_PATH = Path(
    os.environ.get(
        "SUPABASE_CREDS_PATH",
        "D:/PRIVATE/ecodia-creds/supabase.env",
    )
)
SUPABASE_PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "nxmtfzofemtrlezlyhcj")

_DAY_NAME_TO_DOW = {
    "Sun": 0,
    "Mon": 1,
    "Tue": 2,
    "Wed": 3,
    "Thu": 4,
    "Fri": 5,
    "Sat": 6,
}

_MONTH_NAME_TO_NUM = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


class InstallerError(RuntimeError):
    """Anything that prevented a clean install."""


def _normalize_schedule(raw: str) -> str:
    """Translate YAML natural-language schedules to forms the laptop-agent
    scheduler accepts: 5-field cron, `every Nh|Nm|Nd`, or `daily HH:MM`.

    Rules apply in order, first match wins. Unrecognised grammar raises
    InstallerError to surface future surprises early.
    """
    s = raw.strip()

    # Already a 5-field cron (tokens of digits/*/,/-/// only).
    tokens = s.split()
    if len(tokens) == 5 and all(re.fullmatch(r"[0-9*,\-/]+", t) for t in tokens):
        return s

    # Already `every Nh|Nm|Nd`.
    if re.fullmatch(r"every\s+\d+\s*[hmd]", s):
        return s

    # Already `daily HH:MM`.
    if re.fullmatch(r"daily\s+\d{1,2}:\d{2}", s):
        return s

    # `weekly <Day> HH:MM`.
    m = re.fullmatch(r"weekly\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})", s)
    if m:
        day_name, hh, mm = m.group(1), int(m.group(2)), int(m.group(3))
        dow = _DAY_NAME_TO_DOW[day_name]
        return f"{mm} {hh} * * {dow}"

    # `monthly <N>(st|nd|rd|th) HH:MM`.
    m = re.fullmatch(r"monthly\s+(\d{1,2})(?:st|nd|rd|th)\s+(\d{1,2}):(\d{2})", s)
    if m:
        dom, hh, mm = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{mm} {hh} {dom} * *"

    # `quarterly <Months-list> <Day-of-month>(st|nd|rd|th) HH:MM`.
    # e.g. `quarterly Oct/Jan/Apr/Jul 28th 09:00`
    m = re.fullmatch(
        r"quarterly\s+([A-Za-z/]+)\s+(\d{1,2})(?:st|nd|rd|th)\s+(\d{1,2}):(\d{2})",
        s,
    )
    if m:
        months_part, dom, hh, mm = (
            m.group(1),
            int(m.group(2)),
            int(m.group(3)),
            int(m.group(4)),
        )
        month_nums = []
        for piece in months_part.split("/"):
            piece = piece.strip()
            if piece not in _MONTH_NAME_TO_NUM:
                raise InstallerError(
                    f"unrecognised month token {piece!r} in schedule {raw!r}"
                )
            month_nums.append(_MONTH_NAME_TO_NUM[piece])
        month_field = ",".join(str(n) for n in sorted(month_nums))
        return f"{mm} {hh} {dom} {month_field} *"

    # `annually <Mon> <Day> HH:MM`. e.g. `annually Aug 30 12:00`
    m = re.fullmatch(r"annually\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})", s)
    if m:
        mon, dom, hh, mm = (
            m.group(1),
            int(m.group(2)),
            int(m.group(3)),
            int(m.group(4)),
        )
        if mon not in _MONTH_NAME_TO_NUM:
            raise InstallerError(
                f"unrecognised month token {mon!r} in schedule {raw!r}"
            )
        return f"{mm} {hh} {dom} {_MONTH_NAME_TO_NUM[mon]} *"

    raise InstallerError(f"unrecognised schedule grammar: {raw!r}")


def install_corpus(
    spec_path: Path,
    dry_run: bool = False,
    skip_cdp_dependent: bool = False,
    sleep_between_calls_s: float = 0.5,
    expected_count: int | None = 75,
) -> dict[str, int]:
    spec = yaml.safe_load(Path(spec_path).read_text(encoding="utf-8"))
    entries = spec["crons"]
    if expected_count is not None and len(entries) != expected_count:
        raise InstallerError(f"expected {expected_count} entries, found {len(entries)}")

    # Map name -> list of existing rows (handles pre-existing duplicates so we
    # cancel ALL rows under that name, not just one).
    existing: dict[str, list[dict[str, Any]]] = {}
    if not dry_run:
        for row in _list_existing():
            existing.setdefault(row["name"], []).append(row)

    summary = {
        "would_create": 0,
        "created": 0,
        "paused": 0,
        "cancelled_for_recreate": 0,
        "skipped_cdp": 0,
    }

    for entry in entries:
        if skip_cdp_dependent and entry.get("cdp_dependent"):
            summary["skipped_cdp"] += 1
            continue

        body = build_prompt(
            name=entry["name"],
            intent_summary=entry["intent_summary"],
            phase=entry["phase"],
            lm_layer=entry["lm_layer"],
            schedule=entry["schedule"],
            context_addendum=entry["context_addendum"],
        )

        if dry_run:
            summary["would_create"] += 1
            print(f"[dry-run] would create {entry['name']} ({len(body)} chars)")
            continue

        for stale in existing.get(entry["name"], []):
            _post_tool("scheduler.schedule_cancel", {"id": stale["id"]})
            summary["cancelled_for_recreate"] += 1
            if sleep_between_calls_s:
                time.sleep(sleep_between_calls_s)

        result = _post_tool(
            "scheduler.schedule_cron",
            {
                "name": entry["name"],
                "schedule": _normalize_schedule(entry["schedule"]),
                "tz": entry["tz"],
                "prompt": body,
            },
        )
        # Unwrap the laptop-agent envelope: {"ok": true, "result": {...}}
        inner = (
            result["result"]
            if isinstance(result, dict) and isinstance(result.get("result"), dict)
            else result
        )
        new_id = inner.get("id") or inner.get("taskId")
        if not new_id:
            raise InstallerError(
                f"schedule_cron returned no id for {entry['name']}: {result}"
            )
        summary["created"] += 1
        if sleep_between_calls_s:
            time.sleep(sleep_between_calls_s)

        _post_tool("scheduler.schedule_pause", {"id": new_id})
        summary["paused"] += 1
        if sleep_between_calls_s:
            time.sleep(sleep_between_calls_s)

    return summary


def _list_existing() -> list[dict[str, Any]]:
    """Read every active task on the scheduler.

    The laptop-agent's `scheduler.schedule_list` filters paused rows. We bypass
    that by querying Postgres directly via the Supabase Management API, which
    runs as superuser and returns ground truth.
    """
    return _list_existing_from_postgres()


def _list_existing_from_postgres() -> list[dict[str, Any]]:
    """Query Postgres directly via the Supabase Management API to enumerate
    every active (archived_at IS NULL) row in os_scheduled_tasks, regardless of
    last_status (paused/active/failed/...)."""
    token = _read_supabase_access_token()
    url = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_REF}/database/query"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    query = (
        "SELECT id, name, last_status, archived_at "
        "FROM os_scheduled_tasks "
        "WHERE archived_at IS NULL ORDER BY name"
    )
    response = requests.post(url, headers=headers, json={"query": query}, timeout=30)
    if response.status_code >= 400:
        raise InstallerError(
            f"supabase query returned HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )
    data = response.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "result" in data:
        return data["result"]
    raise InstallerError(f"unexpected supabase query response shape: {str(data)[:300]}")


def _read_supabase_access_token() -> str:
    if not SUPABASE_CREDS_PATH.exists():
        raise InstallerError(f"supabase creds file not found at {SUPABASE_CREDS_PATH}")
    for line in SUPABASE_CREDS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip() == "SUPABASE_ACCESS_TOKEN":
            return value.strip().strip('"').strip("'")
    raise InstallerError(f"SUPABASE_ACCESS_TOKEN not found in {SUPABASE_CREDS_PATH}")


def _post_tool(tool: str, params: dict[str, Any]) -> Any:
    token = (
        AGENT_TOKEN_PATH.read_text(encoding="utf-8").strip()
        if AGENT_TOKEN_PATH.exists()
        else ""
    )
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    response = requests.post(
        f"{AGENT_URL}/api/tool",
        headers=headers,
        json={"tool": tool, "params": params},
        timeout=120,
    )
    if response.status_code >= 400:
        raise InstallerError(
            f"laptop-agent {tool} returned HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )
    return response.json()


def main():
    parser = argparse.ArgumentParser(description="Install the EcodiaOS cron corpus.")
    parser.add_argument(
        "--spec",
        type=Path,
        default=Path(__file__).parent / "cron-corpus-spec.yaml",
        help="path to cron-corpus-spec.yaml",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="render only, no HTTP calls"
    )
    parser.add_argument(
        "--skip-cdp-dependent",
        action="store_true",
        help="skip crons marked cdp_dependent (use until Mac mini ready)",
    )
    args = parser.parse_args()

    try:
        summary = install_corpus(
            args.spec,
            dry_run=args.dry_run,
            skip_cdp_dependent=args.skip_cdp_dependent,
        )
    except FileNotFoundError as exc:
        print(f"install failed: spec file not found: {exc}", file=sys.stderr)
        sys.exit(1)
    except yaml.YAMLError as exc:
        print(f"install failed: spec YAML malformed: {exc}", file=sys.stderr)
        sys.exit(1)
    except InstallerError as exc:
        print(f"install failed: {exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
