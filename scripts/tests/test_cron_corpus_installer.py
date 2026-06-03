import pytest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))
from cron_corpus_installer import install_corpus, InstallerError


def _fake_spec_path(tmp_path, entries):
    import yaml

    p = tmp_path / "spec.yaml"
    p.write_text(yaml.safe_dump({"crons": entries}))
    return p


def _fake_existing_tasks(*names_and_ids):
    return [{"name": n, "id": i, "archived_at": None} for n, i in names_and_ids]


@patch("cron_corpus_installer._post_tool")
@patch("cron_corpus_installer._list_existing")
def test_install_creates_new_cron_then_pauses(mock_list, mock_post, tmp_path):
    mock_list.return_value = []
    mock_post.side_effect = [
        {"id": "new-task-id-1"},  # schedule_cron returns id
        {"ok": True},  # schedule_pause returns ok
    ]
    spec_path = _fake_spec_path(
        tmp_path,
        [
            {
                "name": "gmail-inbox-poll",
                "phase": 1,
                "schedule": "every 2h",
                "tz": "Australia/Brisbane",
                "lm_layer": "CAPTURE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": False,
            }
        ],
    )
    summary = install_corpus(
        spec_path, dry_run=False, expected_count=None, sleep_between_calls_s=0
    )
    assert summary["created"] == 1
    assert summary["paused"] == 1
    assert summary["cancelled_for_recreate"] == 0
    assert mock_post.call_count == 2


@patch("cron_corpus_installer._post_tool")
@patch("cron_corpus_installer._list_existing")
def test_install_cancels_existing_carryover_before_recreate(
    mock_list, mock_post, tmp_path
):
    mock_list.return_value = _fake_existing_tasks(
        ("gmail-inbox-poll", "old-task-id-1"),
    )
    mock_post.side_effect = [
        {"ok": True},  # schedule_cancel on old
        {"id": "new-task-id-1"},  # schedule_cron creates new
        {"ok": True},  # schedule_pause on new
    ]
    spec_path = _fake_spec_path(
        tmp_path,
        [
            {
                "name": "gmail-inbox-poll",
                "phase": 1,
                "schedule": "every 2h",
                "tz": "Australia/Brisbane",
                "lm_layer": "CAPTURE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": False,
            }
        ],
    )
    summary = install_corpus(
        spec_path, dry_run=False, expected_count=None, sleep_between_calls_s=0
    )
    assert summary["cancelled_for_recreate"] == 1
    assert summary["created"] == 1
    assert summary["paused"] == 1
    assert mock_post.call_count == 3


@patch("cron_corpus_installer._post_tool")
@patch("cron_corpus_installer._list_existing")
def test_dry_run_makes_no_post_calls(mock_list, mock_post, tmp_path):
    mock_list.return_value = []
    spec_path = _fake_spec_path(
        tmp_path,
        [
            {
                "name": "gmail-inbox-poll",
                "phase": 1,
                "schedule": "every 2h",
                "tz": "Australia/Brisbane",
                "lm_layer": "CAPTURE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": False,
            }
        ],
    )
    summary = install_corpus(
        spec_path, dry_run=True, expected_count=None, sleep_between_calls_s=0
    )
    assert summary["would_create"] == 1
    assert mock_post.call_count == 0


@patch("cron_corpus_installer._post_tool")
@patch("cron_corpus_installer._list_existing")
def test_skip_cdp_dependent_when_skip_cdp_true(mock_list, mock_post, tmp_path):
    mock_list.return_value = []
    spec_path = _fake_spec_path(
        tmp_path,
        [
            {
                "name": "app-store-review-watch",
                "phase": 2,
                "schedule": "every 4h",
                "tz": "Australia/Brisbane",
                "lm_layer": "NONE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": True,
            },
        ],
    )
    summary = install_corpus(
        spec_path,
        dry_run=False,
        skip_cdp_dependent=True,
        expected_count=None,
        sleep_between_calls_s=0,
    )
    assert summary["skipped_cdp"] == 1
    assert summary["created"] == 0
    assert mock_post.call_count == 0


@patch("cron_corpus_installer._post_tool")
@patch("cron_corpus_installer._list_existing")
def test_post_failure_aborts_installer_with_partial_summary(
    mock_list, mock_post, tmp_path
):
    mock_list.return_value = []
    mock_post.side_effect = [
        {"id": "new-task-id-1"},
        {"ok": True},
        InstallerError("HTTP 500 from laptop-agent"),
    ]
    spec_path = _fake_spec_path(
        tmp_path,
        [
            {
                "name": "a",
                "phase": 1,
                "schedule": "every 2h",
                "tz": "Australia/Brisbane",
                "lm_layer": "CAPTURE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": False,
            },
            {
                "name": "b",
                "phase": 1,
                "schedule": "every 2h",
                "tz": "Australia/Brisbane",
                "lm_layer": "CAPTURE",
                "intent_summary": "x" * 50,
                "context_addendum": "y" * 200,
                "cdp_dependent": False,
            },
        ],
    )
    with pytest.raises(InstallerError, match="HTTP 500"):
        install_corpus(
            spec_path, dry_run=False, expected_count=None, sleep_between_calls_s=0
        )
