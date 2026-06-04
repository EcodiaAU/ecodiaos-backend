import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from cron_prompt_builder import build_prompt, ValidationError


def test_minimal_valid_inputs_render_all_five_sections():
    body = build_prompt(
        name="gmail-inbox-poll",
        intent_summary="Triage both code@ and tate@ unread, label and autoarchive vendor, status_board on actionable.",
        phase=1,
        lm_layer="CAPTURE",
        schedule="every 2h",
        context_addendum=(
            "Replaces the dead emailArrival file-watcher listener "
            "(status_board row 5129c018)."
        ),
    )
    assert "You are EcodiaOS. Cron: gmail-inbox-poll." in body
    assert "CONTEXT (cold-start safe" in body
    assert "OBJECTIVE:" in body
    assert "AGENCY:" in body
    assert "HARD CONSTRAINTS" in body
    assert "DELIVERABLE:" in body
    assert "QUALITY BAR:" in body
    assert "Phase 1" in body
    assert "CAPTURE" in body
    assert "every 2h" in body
    assert "Triage both code@ and tate@" in body


def test_em_dash_in_intent_summary_raises_validation_error():
    with pytest.raises(ValidationError, match="em-dash"):
        build_prompt(
            name="x",
            intent_summary="A bad intent — with em-dash.",
            phase=1,
            lm_layer="CAPTURE",
            schedule="every 1h",
            context_addendum="ok",
        )


def test_unknown_phase_raises_validation_error():
    with pytest.raises(ValidationError, match="phase"):
        build_prompt(
            name="x",
            intent_summary="ok",
            phase=4,
            lm_layer="CAPTURE",
            schedule="every 1h",
            context_addendum="ok",
        )


def test_unknown_lm_layer_raises_validation_error():
    with pytest.raises(ValidationError, match="lm_layer"):
        build_prompt(
            name="x",
            intent_summary="ok",
            phase=1,
            lm_layer="OBSERVE",  # OBSERVE is OODA, not a learning-machine layer
            schedule="every 1h",
            context_addendum="ok",
        )


def test_name_with_uppercase_raises_validation_error():
    with pytest.raises(ValidationError, match="kebab-case"):
        build_prompt(
            name="GmailInboxPoll",
            intent_summary="ok",
            phase=1,
            lm_layer="CAPTURE",
            schedule="every 1h",
            context_addendum="ok",
        )


def test_kv_store_pointer_in_context_raises_validation_error():
    with pytest.raises(ValidationError, match="cold-start"):
        build_prompt(
            name="x",
            intent_summary="ok",
            phase=1,
            lm_layer="CAPTURE",
            schedule="every 1h",
            context_addendum="See `kv_store.get('foo.brief')` for the brief.",
        )


def test_word_count_below_200_raises_validation_error():
    with pytest.raises(ValidationError, match="too short"):
        # All sections rendered but intent + addendum so terse the body is < 200 words
        build_prompt(
            name="x",
            intent_summary="a",
            phase=1,
            lm_layer="CAPTURE",
            schedule="every 1h",
            context_addendum="b",
            _skip_static_sections=True,  # test hook to elide static QUALITY BAR
        )


def test_quality_bar_carries_load_bearing_strings():
    """The runtime canonical QUALITY BAR is in cron_prompt_builder._QUALITY_BAR.
    The pattern file at patterns/cron-worker-prompt-template.md only excerpts the
    first two sentences and points here. If anyone narrows the QUALITY BAR text
    in the builder and drops a load-bearing reference, this test fires loudly.
    """
    import cron_prompt_builder

    bar = cron_prompt_builder._QUALITY_BAR
    assert "refuse mediocrity" in bar.lower()
    assert "Investigate thoroughly" in bar
    assert "recursive-improvement-is-substrate-driven" in bar
    assert "ocd-ambition-refuse-mediocrity" in bar
    assert "verify-deployed-state-against-narrated-state" in bar
    assert "ballistic-mode-under-guardrails-equals-depth-not-action" in bar
    assert "action-over-plans-honesty-redeems-mistakes" in bar


def test_quality_bar_appears_in_rendered_body():
    """And the bar must actually reach the rendered prompt body, not be dead code."""
    body = build_prompt(
        name="x",
        intent_summary="ok " * 30,
        phase=1,
        lm_layer="CAPTURE",
        schedule="every 1h",
        context_addendum="ok " * 100,
    )
    assert "refuse mediocrity" in body.lower()
    assert "Investigate thoroughly" in body
