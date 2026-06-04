"""End-to-end cron-corpus integration test.

Walks every entry in cron-corpus-spec.yaml, runs each schedule through the
installer's `_normalize_schedule`, and parses the result with `croniter`.
Asserts every entry produces a valid cron expression that fires within the
next 366 days.

This is the test that would have caught the 2026-06-03 `every 2160h -> daily`
silent-misfire bug. It is an integration test (rather than a unit test)
because it consumes the actual YAML plus the actual normalize logic.

Pass-through forms `every Nh|Nm` and `daily HH:MM` are translated to 5-field
crons inside this test before croniter parsing, since the laptop-agent
scheduler itself accepts them but croniter does not.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).parent.parent))
from cron_corpus_installer import _normalize_schedule  # noqa: E402

try:
    from croniter import croniter
except ImportError:
    pytest.skip("croniter not installed", allow_module_level=True)

SPEC_PATH = Path(__file__).parent.parent / "cron-corpus-spec.yaml"
EXPECTED_ENTRY_COUNT = 75


def _to_five_field_cron(s: str) -> str:
    """Translate the laptop-agent's pass-through grammar (`every Nh`, `every Nm`,
    `daily HH:MM`) into a 5-field cron expression croniter can parse.

    All other grammars (`weekly`, `monthly`, `quarterly`, `annually`) are already
    converted to 5-field cron by `_normalize_schedule` before this runs.
    """
    s = s.strip()

    # Already 5-field cron
    tokens = s.split()
    if len(tokens) == 5:
        return s

    m = re.fullmatch(r"every\s+(\d+)\s*h", s)
    if m:
        n = int(m.group(1))
        return f"0 */{n} * * *"

    m = re.fullmatch(r"every\s+(\d+)\s*m", s)
    if m:
        n = int(m.group(1))
        return f"*/{n} * * * *"

    m = re.fullmatch(r"daily\s+(\d{1,2}):(\d{2})", s)
    if m:
        hh, mm = int(m.group(1)), int(m.group(2))
        return f"{mm} {hh} * * *"

    raise AssertionError(f"unsupported schedule form for croniter translation: {s!r}")


def _load_entries():
    spec = yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))
    return spec["crons"]


def test_spec_yaml_loads_and_has_expected_count():
    entries = _load_entries()
    assert len(entries) == EXPECTED_ENTRY_COUNT, (
        f"spec drifted: expected {EXPECTED_ENTRY_COUNT} entries, found {len(entries)}"
    )


@pytest.mark.parametrize("entry", _load_entries(), ids=lambda e: e["name"])
def test_schedule_normalises_and_parses_with_croniter(entry):
    """Every entry's schedule passes through _normalize_schedule cleanly, then
    parses with croniter, then fires within the next 366 days."""
    raw_schedule = entry["schedule"]
    normalised = _normalize_schedule(raw_schedule)
    cron_expr = _to_five_field_cron(normalised)

    # croniter parse - raises on malformed
    base = datetime(2026, 6, 4, 12, 0, 0)
    it = croniter(cron_expr, base)
    next_fire = it.get_next(datetime)

    # Sanity bound: must fire within the next 366 days
    horizon = base + timedelta(days=366)
    assert next_fire <= horizon, (
        f"{entry['name']!r} schedule {raw_schedule!r} -> cron {cron_expr!r} "
        f"next fire {next_fire.isoformat()} exceeds 366-day horizon "
        f"(would silently never run)"
    )

    # Must fire AFTER base (not in the past) - sanity that base resolution works
    assert next_fire > base, (
        f"{entry['name']!r} next fire {next_fire.isoformat()} is not strictly "
        f"after base {base.isoformat()}"
    )


def test_every_nh_with_n_ge_24_rejected_at_normalise():
    """Direct guard test: the bug class that motivated this file. The
    installer must refuse `every 2160h` because cron-parser silently treats
    `0 */2160 * * *` as "fires at 00:00 daily" instead of "fires every 2160
    hours". The annual/quarterly grammar exists exactly to express those
    cadences cleanly. Verifies _normalize_schedule still rejects the foot-gun.
    """
    from cron_corpus_installer import InstallerError

    with pytest.raises(InstallerError, match="every 2160h"):
        _normalize_schedule("every 2160h")
    with pytest.raises(InstallerError, match="every 8760h"):
        _normalize_schedule("every 8760h")
