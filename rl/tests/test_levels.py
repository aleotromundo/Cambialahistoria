from __future__ import annotations

import argparse

import pytest

from lost_storm_rl.anchor import level_bands, paired
from lost_storm_rl.best import best_check, high_band
from lost_storm_rl.bridge import hello
from lost_storm_rl.train import parse_span


def test_level_bands_cover_the_arena_levels_and_grow_with_the_highest_level_played() -> None:
    assert level_bands(5) == [(1, 4), (5, 8), (9, 12)]
    assert level_bands(12) == [(1, 4), (5, 8), (9, 12)]
    assert level_bands(17) == [(1, 4), (5, 8), (9, 12), (13, 16), (17, 20)]


def test_the_best_check_reads_the_top_band_played() -> None:
    model = [{"seed": 1, "outcome": "won"}, {"seed": 2, "outcome": "died"}]
    bot = [{"seed": 1, "level": 18, "outcome": "won"}, {"seed": 2, "level": 3, "outcome": "won"}]
    report = paired(model, bot)
    assert high_band(report) == "levels 17-20"
    assert report["by_level"]["levels 17-20"] == {"episodes": 1, "model_won": 1.0, "bot_won": 1.0}
    assert best_check(10, 1, report).model_high == 1.0
    assert high_band(paired([], [])) == "levels 9-12"


def test_hello_asks_for_a_level_and_a_range_only_when_given() -> None:
    plain = hello(1, 2, 1, 0.2, 1, 0, [], None, None, None)
    assert "buildLevel" not in plain and "levelRange" not in plain
    asked = hello(1, 2, 1, 0.2, 1, 0, [], None, None, None, 20, (1, 20))
    assert asked["buildLevel"] == 20
    assert asked["levelRange"] == {"min": 1, "max": 20}


def test_a_level_range_reads_low_dash_high() -> None:
    assert parse_span("1-20") == (1, 20)
    for bad in ("20", "0-5", "9-3", "a-b", "1-"):
        with pytest.raises(argparse.ArgumentTypeError):
            parse_span(bad)
