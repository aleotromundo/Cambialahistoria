from __future__ import annotations

from lost_storm_rl.anchor import LevelCurriculum


def test_a_lean_weights_the_draw_toward_high_levels() -> None:
    weights = LevelCurriculum(1, 30, mix=0.5, lean=1.0).weights()
    assert len(weights) == 30
    assert abs(sum(weights) - 1) < 1e-4
    assert weights[29] > weights[19] > weights[0] > 0


def test_a_lean_without_the_curriculum_still_sends_weights() -> None:
    weights = LevelCurriculum(1, 30, mix=0.0, lean=2.0).weights()
    assert len(weights) == 30
    assert weights[29] > 100 * weights[0]


def test_no_lean_keeps_the_even_share() -> None:
    weights = LevelCurriculum(1, 4, mix=0.5).weights()
    assert max(weights) - min(weights) < 1e-6
