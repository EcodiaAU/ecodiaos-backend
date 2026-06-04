"""Unit tests for _normalize_schedule in cron_corpus_installer.

Covers each schedule-grammar translation rule + the raise-on-unrecognised
case. The installer rejects unrecognised grammars early so future YAML
surprises surface at install time, not weeks later at the first fire.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from cron_corpus_installer import InstallerError, _normalize_schedule


# --- pass-through rules --------------------------------------------------


def test_five_field_cron_passes_through():
    assert _normalize_schedule("0 20 * * 0") == "0 20 * * 0"
    assert _normalize_schedule("0 9 28 1,4,7,10 *") == "0 9 28 1,4,7,10 *"
    assert _normalize_schedule("*/15 * * * *") == "*/15 * * * *"


def test_every_nh_passes_through():
    assert _normalize_schedule("every 2h") == "every 2h"
    assert _normalize_schedule("every 6h") == "every 6h"
    # Largest in-range value: 23 (hours field is 0-23).
    assert _normalize_schedule("every 23h") == "every 23h"


def test_every_nm_passes_through():
    assert _normalize_schedule("every 30m") == "every 30m"
    assert _normalize_schedule("every 15m") == "every 15m"
    # Largest in-range value: 59 (minutes field is 0-59).
    assert _normalize_schedule("every 59m") == "every 59m"


# --- guard: out-of-range `every Nh|Nm` and unsupported `every Nd` --------


def test_every_24h_raises_validation_error():
    # N=24 in the hours field crosses the cron range boundary; cron-parser
    # silently re-interprets `*/24` as "hour 0 only" -> fires DAILY at 00:00
    # instead of every 24 hours. This was the 2026-06-03 bug shape.
    with pytest.raises(InstallerError, match="not a valid scheduler cron expression"):
        _normalize_schedule("every 24h")


def test_every_2160h_raises_validation_error():
    # bas-quarterly-prep / quarterly-business-review used `every 2160h` and
    # would have fired daily at 00:00 UTC (10:00 AEST). Guard surfaces the
    # quarterly grammar as the right path.
    with pytest.raises(InstallerError, match="quarterly/annually grammar"):
        _normalize_schedule("every 2160h")


def test_every_8760h_raises_validation_error():
    # annual-asic-and-wyoming-renewals used `every 8760h`. Same daily-fire
    # bug. Guard surfaces the annually grammar as the right path.
    with pytest.raises(InstallerError, match="quarterly/annually grammar"):
        _normalize_schedule("every 8760h")


def test_every_60m_raises_validation_error():
    # N=60 in the minutes field has the same silent-reinterpret failure as
    # the hours case.
    with pytest.raises(InstallerError, match="not a valid scheduler cron expression"):
        _normalize_schedule("every 60m")


def test_every_nd_raises_unsupported_error():
    # The laptop-agent's parseSchedule accepts only [mh]; `every Nd` would
    # fall through to the cron-parser branch and fail with a confusing
    # downstream error. Surface here with actionable guidance.
    with pytest.raises(InstallerError, match="not supported"):
        _normalize_schedule("every 3d")


def test_daily_hh_mm_passes_through():
    assert _normalize_schedule("daily 09:00") == "daily 09:00"
    assert _normalize_schedule("daily 22:30") == "daily 22:30"
    assert _normalize_schedule("daily 02:00") == "daily 02:00"


# --- weekly translation --------------------------------------------------


def test_weekly_sunday_translates_to_cron():
    assert _normalize_schedule("weekly Sun 20:00") == "0 20 * * 0"


def test_weekly_every_day_translates_correctly():
    assert _normalize_schedule("weekly Mon 09:00") == "0 9 * * 1"
    assert _normalize_schedule("weekly Tue 10:00") == "0 10 * * 2"
    assert _normalize_schedule("weekly Wed 11:00") == "0 11 * * 3"
    assert _normalize_schedule("weekly Thu 12:00") == "0 12 * * 4"
    assert _normalize_schedule("weekly Fri 16:00") == "0 16 * * 5"
    assert _normalize_schedule("weekly Sat 22:00") == "0 22 * * 6"


def test_weekly_preserves_minutes():
    assert _normalize_schedule("weekly Sun 21:45") == "45 21 * * 0"
    assert _normalize_schedule("weekly Sun 22:30") == "30 22 * * 0"


# --- monthly translation -------------------------------------------------


def test_monthly_first_translates_to_cron():
    assert _normalize_schedule("monthly 1st 09:00") == "0 9 1 * *"


def test_monthly_various_days_translate_correctly():
    assert _normalize_schedule("monthly 5th 10:00") == "0 10 5 * *"
    assert _normalize_schedule("monthly 15th 14:00") == "0 14 15 * *"
    assert _normalize_schedule("monthly 28th 14:00") == "0 14 28 * *"


# --- quarterly translation -----------------------------------------------


def test_quarterly_bas_translates_to_multi_month_cron():
    assert (
        _normalize_schedule("quarterly Oct/Jan/Apr/Jul 28th 09:00")
        == "0 9 28 1,4,7,10 *"
    )


def test_quarterly_sorts_months():
    # Months in input order should be reordered ascending for readability.
    assert (
        _normalize_schedule("quarterly Mar/Jun/Sep/Dec 31st 14:00")
        == "0 14 31 3,6,9,12 *"
    )


def test_quarterly_unknown_month_raises():
    with pytest.raises(InstallerError, match="unrecognised month"):
        _normalize_schedule("quarterly Foo/Bar 1st 09:00")


# --- annually translation ------------------------------------------------


def test_annually_translates_to_yearly_cron():
    assert _normalize_schedule("annually Aug 30 12:00") == "0 12 30 8 *"


def test_yaml_corpus_fixed_grammars_translate_correctly():
    # Confirms the three rows fixed in the 2026-06-04 cron-corpus repair land
    # on explicit-multi-month / explicit-yearly cron expressions, not the
    # buggy `0 */N * * *` shape that fires daily.
    assert (
        _normalize_schedule("quarterly Oct/Jan/Apr/Jul 28th 09:00")
        == "0 9 28 1,4,7,10 *"
    )
    assert (
        _normalize_schedule("quarterly Mar/Jun/Sep/Dec 28th 14:00")
        == "0 14 28 3,6,9,12 *"
    )
    assert _normalize_schedule("annually Aug 30 09:00") == "0 9 30 8 *"


def test_annually_unknown_month_raises():
    with pytest.raises(InstallerError, match="unrecognised month"):
        _normalize_schedule("annually Xyz 30 12:00")


# --- error case ----------------------------------------------------------


def test_unrecognised_grammar_raises():
    with pytest.raises(InstallerError, match="unrecognised schedule grammar"):
        _normalize_schedule("whenever I feel like it")


def test_empty_string_raises():
    with pytest.raises(InstallerError, match="unrecognised schedule grammar"):
        _normalize_schedule("")


def test_close_but_wrong_grammar_raises():
    # "weekly Sunday" (not "Sun") - 3-letter day required.
    with pytest.raises(InstallerError, match="unrecognised schedule grammar"):
        _normalize_schedule("weekly Sunday 20:00")
