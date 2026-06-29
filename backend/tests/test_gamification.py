"""Points / level / reputation maths - thesis-critical, tested as pure functions."""
import pytest

from app.services.gamification import compute_reputation, level_for_points
from app.services.antispam import decide_moderation


# --- levels -----------------------------------------------------------------
@pytest.mark.parametrize(
    "points,level",
    [(0, 1), (49, 1), (50, 2), (199, 2), (200, 3), (450, 4)],
)
def test_level_curve(points, level):
    assert level_for_points(points) == level


# --- reputation -------------------------------------------------------------
def test_new_user_reputation_is_50():
    # all-zero history -> Bayesian prior 0.5 across all three rates -> 50.
    assert compute_reputation(0, 0, 0, 0, 0, 0) == 50.0


def test_good_history_raises_reputation_above_neutral():
    # many confirmed + agreeing reports, no flags.
    rep = compute_reputation(confirmed=18, eligible=20, agreed=18, labelled=20, flagged=0, total=20)
    assert rep > 75


def test_flags_lower_reputation():
    clean = compute_reputation(10, 20, 5, 10, 0, 20)
    flagged = compute_reputation(10, 20, 5, 10, 12, 20)
    assert flagged < clean


def test_reputation_bounded_0_100():
    assert 0 <= compute_reputation(0, 5, 0, 5, 5, 5) <= 100
    assert 0 <= compute_reputation(50, 50, 50, 50, 0, 50) <= 100


# --- moderation decision (pure) --------------------------------------------
# Policy (2026-07-08, verification-first): every clean report enters peer confirmation EXCEPT
# from a highly-trusted reporter (reputation >= 75), who earns a reputation-weighted fast-track.
def test_trusted_reporter_publishes_immediately():
    state, reasons = decide_moderation(
        reputation=85, account_age_hours=100, spam_score=0.1,
        is_duplicate=False, over_rate_limit=False,
    )
    assert state == "published"
    assert any("trusted" in r for r in reasons)


def test_low_reputation_is_held():
    state, reasons = decide_moderation(40, 100, 0.1, False, False)
    assert state == "pending_confirmation"
    assert any("reputation" in r for r in reasons)


def test_mid_reputation_is_held_for_confirmation():
    # Reputation 70 is below the trusted threshold, so a clean report is held for the community
    # to confirm (it publishes automatically once it reaches the confirmation threshold).
    state, reasons = decide_moderation(70, 100, 0.1, False, False)
    assert state == "pending_confirmation"
    assert any("confirmation" in r for r in reasons)


def test_new_account_with_spam_signal_is_held():
    state, reasons = decide_moderation(70, 2, 0.1, is_duplicate=True, over_rate_limit=False)
    assert state == "pending_confirmation"
    assert any("new account" in r for r in reasons)


def test_high_spam_score_holds_regardless_of_reputation():
    state, reasons = decide_moderation(95, 500, 0.8, False, False)
    assert state == "pending_confirmation"
    assert any("spam score" in r for r in reasons)


def test_duplicate_is_held():
    state, reasons = decide_moderation(95, 500, 0.0, True, False)
    assert state == "pending_confirmation"
    assert any("duplicate" in r for r in reasons)
