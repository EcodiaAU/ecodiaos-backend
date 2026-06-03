"""
Installs the 75-cron corpus from cron-corpus-spec.yaml onto the laptop-agent
scheduler (localhost:7456). Idempotent on (name): existing crons with matching
name are cancelled and recreated under the new template grammar.
"""

from __future__ import annotations

import argparse
import json
import os
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


class InstallerError(RuntimeError):
    """Anything that prevented a clean install."""


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

    existing = {} if dry_run else {t["name"]: t for t in _list_existing()}

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

        if entry["name"] in existing:
            _post_tool(
                "schedule_cancel",
                {"taskId": existing[entry["name"]]["id"]},
            )
            summary["cancelled_for_recreate"] += 1
            if sleep_between_calls_s:
                time.sleep(sleep_between_calls_s)

        result = _post_tool(
            "schedule_cron",
            {
                "name": entry["name"],
                "schedule": entry["schedule"],
                "tz": entry["tz"],
                "prompt": body,
            },
        )
        new_id = result.get("id") or result.get("taskId")
        if not new_id:
            raise InstallerError(
                f"schedule_cron returned no id for {entry['name']}: {result}"
            )
        summary["created"] += 1
        if sleep_between_calls_s:
            time.sleep(sleep_between_calls_s)

        _post_tool("schedule_pause", {"taskId": new_id})
        summary["paused"] += 1
        if sleep_between_calls_s:
            time.sleep(sleep_between_calls_s)

    return summary


def _list_existing() -> list[dict[str, Any]]:
    """Read every active task on the scheduler."""
    result = _post_tool("schedule_list", {})
    if isinstance(result, list):
        return result
    if isinstance(result, dict) and "tasks" in result:
        return result["tasks"]
    if isinstance(result, dict) and "content" in result:
        # MCP envelope shape
        return json.loads(result["content"][0]["text"])
    return []


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
        timeout=30,
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

    summary = install_corpus(
        args.spec,
        dry_run=args.dry_run,
        skip_cdp_dependent=args.skip_cdp_dependent,
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
