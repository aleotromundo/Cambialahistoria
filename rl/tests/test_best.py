from __future__ import annotations

import argparse
import csv
import math
from fractions import Fraction
from pathlib import Path
from typing import Any

import pytest

from lost_storm_rl.best import BEST_HEADER, BestCheck, BestKeeper, best_check, note_best, saved_rate
from lost_storm_rl.train import BEST_SEED, HELD_OUT_SEED, SEED_SPACE, check_best, check_training_seed


def report(model: float, bot: float, high: dict[str, float] | None) -> dict[str, Any]:
    by_level = {} if high is None else {"levels 9-12": {"episodes": 20, **high}}
    return {"paired": 64, "model_won": model, "bot_won": bot, "bot_only": 0, "model_only": 0, "by_level": by_level}


def test_a_check_is_due_on_every_nth_update_and_never_when_switched_off() -> None:
    assert [update for update in range(1, 601) if BestKeeper(200).due(update)] == [200, 400, 600]
    assert not any(BestKeeper(0).due(update) for update in range(1, 601))


def check(update: int, wins: int, played: int = 64) -> BestCheck:
    return BestCheck(update, wins, played, round(wins / played, 3), 0.9, 0.6, 0.7)


def test_only_a_model_with_more_wins_is_kept() -> None:
    keeper = BestKeeper(200)
    assert keeper.offer(check(200, 51))
    assert not keeper.offer(check(400, 51))
    assert not keeper.offer(check(600, 45))
    assert keeper.offer(check(800, 54))
    assert keeper.best == Fraction(54, 64)


def test_one_more_win_is_kept_even_when_the_rounded_rates_match() -> None:
    keeper = BestKeeper(200)
    assert keeper.offer(check(200, 500, 1001))
    assert keeper.offer(check(400, 501, 1001))
    assert check(200, 500, 1001).model_won == check(400, 501, 1001).model_won


def test_the_first_check_is_kept_even_when_the_model_won_nothing() -> None:
    assert BestKeeper(200).offer(check(200, 0))


def test_a_check_reads_the_high_levels_and_leaves_them_unknown_when_none_were_played() -> None:
    read = best_check(400, 58, report(0.906, 0.89, {"model_won": 0.8, "bot_won": 0.75}))
    assert read == BestCheck(400, 58, 64, 0.906, 0.89, 0.8, 0.75)
    missing = best_check(400, 58, report(0.906, 0.89, None))
    assert math.isnan(missing.model_high) and math.isnan(missing.bot_high)


def test_each_check_is_written_under_one_header(tmp_path: Path) -> None:
    path = tmp_path / "best.csv"
    note_best(path, check(200, 51), True)
    note_best(path, check(400, 45), False)
    with path.open(newline="") as handle:
        rows = list(csv.reader(handle))
    assert rows == [BEST_HEADER, ["200", "51", "64", "0.797", "0.9", "0.6", "0.7", "1"], ["400", "45", "64", "0.703", "0.9", "0.6", "0.7", "0"]]


def test_a_rerun_must_beat_the_score_saved_inside_best_pt() -> None:
    assert saved_rate({}) == -1
    assert saved_rate({"best": {"wins": "60", "played": 64}}) == -1
    keeper = BestKeeper(200, saved_rate({"best": {"update": 400, "wins": 60, "played": 64}}))
    assert keeper.best == Fraction(60, 64)
    assert not keeper.offer(check(200, 58))
    assert not keeper.offer(check(200, 93, 100))
    assert keeper.offer(check(400, 94, 100))


def test_training_never_reaches_the_held_out_seeds_the_check_picks_from() -> None:
    parser = argparse.ArgumentParser()
    check_best(parser, 200, 64, BEST_SEED)
    check_training_seed(parser, 1, 100_000, 16, 2, 128, 16, 0.5)
    check_training_seed(parser, 1, 250_000, 16, 1, 128, 16, 0.0)
    assert HELD_OUT_SEED <= BEST_SEED < SEED_SPACE
    for bad in ((200, 64, 7000), (200, 64, 2**38 + 1_000_000), (200, 64, SEED_SPACE - 10), (-1, 64, BEST_SEED), (200, 0, BEST_SEED)):
        with pytest.raises(SystemExit):
            check_best(parser, *bad)
    for seed, updates, workers, steps, envs in ((HELD_OUT_SEED, 1, 2, 128, 16), (1, 250_000, 2, 128, 16), (1, 199_000, 12, 128, 16), (1, 90_000, 2, 4096, 16)):
        with pytest.raises(SystemExit):
            check_training_seed(parser, seed, updates, 16, workers, steps, envs, 0.5)
