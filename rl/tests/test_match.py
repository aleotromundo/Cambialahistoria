from __future__ import annotations

import argparse
from typing import Any

import pytest

from lost_storm_rl.match import DuelResult, complete, first_sits, results, score
from lost_storm_rl.train import HELD_OUT_SEED, MATCH_SEED, SEED_SPACE, check_match


def seat(env: int, seed: int, outcome: str) -> dict[str, Any]:
    return {"env": env, "seed": seed, "situation": "duel", "outcome": outcome}


def test_the_first_model_takes_the_same_seat_in_every_duel_of_a_side() -> None:
    assert first_sits(6, 0).tolist() == [True, False, True, False, True, False]
    assert first_sits(6, 1).tolist() == [False, True, False, True, False, True]


def test_each_finished_duel_is_read_from_the_first_models_side() -> None:
    finished = [seat(0, 10, "won"), seat(1, 10, "died"), seat(6, 12, "timeout"), seat(7, 12, "timeout")]
    assert results(finished, 0) == [DuelResult(10, 0, "won", "died"), DuelResult(12, 0, "timeout", "timeout")]
    assert results(finished, 1) == [DuelResult(10, 1, "died", "won"), DuelResult(12, 1, "timeout", "timeout")]


def test_a_duel_missing_its_second_seat_is_an_error() -> None:
    with pytest.raises(ValueError):
        results([seat(0, 10, "won")], 0)


def test_a_side_is_complete_only_once_every_seed_in_its_range_has_finished() -> None:
    played = [DuelResult(seed, 0, "won", "died") for seed in (100, 102, 103)]
    assert not complete(played, 100, 4)
    assert complete([*played, DuelResult(101, 0, "died", "won"), DuelResult(104, 0, "won", "died")], 100, 4)


def test_the_score_counts_wins_for_each_side_and_splits_them_by_seat() -> None:
    duels = [DuelResult(1, 0, "won", "died"), DuelResult(2, 1, "won", "died"), DuelResult(3, 1, "died", "won"), DuelResult(4, 0, "timeout", "timeout")]
    scored = score(duels)
    assert (scored["duels"], scored["first_won"], scored["second_won"], scored["undecided"]) == (4, 2, 1, 1)
    assert scored["first_share"] == pytest.approx(2 / 3)
    assert scored["by_seat"] == {"first in seat 0": {"duels": 2, "first_won": 1, "second_won": 0}, "first in seat 1": {"duels": 2, "first_won": 1, "second_won": 1}}


def test_a_match_is_played_only_on_held_out_seeds() -> None:
    parser = argparse.ArgumentParser()
    check_match(parser, 128, MATCH_SEED)
    for duels, seed in ((0, MATCH_SEED), (128, 5000), (128, HELD_OUT_SEED - 1), (128, SEED_SPACE - 100)):
        with pytest.raises(SystemExit):
            check_match(parser, duels, seed)
