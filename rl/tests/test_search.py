from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from lost_storm_rl.search import Candidate, Score, SearchPlan, build_key, ranked, read_log, search


class FakeBuilds:
    def __init__(self) -> None:
        self.mutations = 0

    def random(self, level: int, seeds: list[int]) -> list[dict[str, Any]]:
        return [{"name": "Tree build", "weapon": "w", "skills": [], "route": [f"r{seed}"], "hero": None} for seed in seeds]

    def mutate(self, level: int, seed: int, builds: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.mutations += 1
        return [{**build, "route": [*build["route"], f"m{seed}-{index}"]} for index, build in enumerate(builds)]

    def problems(self, level: int, builds: list[dict[str, Any]]) -> list[list[str]]:
        return [["illegal"] if build["name"] == "Bad" else [] for build in builds]


def strength(build: dict[str, Any]) -> Score:
    return Score(len(build["route"]), 10, 0, 0)


def quiet(line: str) -> None:
    return None


def test_the_search_ranks_by_score_and_mutates_the_best(tmp_path: Path) -> None:
    examples = [{"name": "Good", "weapon": "w", "skills": [], "route": ["a", "b"]}, {"name": "Bad", "weapon": "w", "skills": [], "route": []}]
    found = search(FakeBuilds(), SearchPlan(20, 8, 2, 2, 1), examples, strength, tmp_path / "search.csv", quiet)
    assert len(found) == 8
    assert [candidate.score.value for candidate in found] == sorted((candidate.score.value for candidate in found), reverse=True)
    assert found[0].origin.startswith("mutation")
    assert all(candidate.origin != "example Bad" for candidate in found)
    assert len({build_key(candidate.build) for candidate in found}) == 8


def test_the_search_resumes_from_its_log_without_scoring_twice(tmp_path: Path) -> None:
    log = tmp_path / "search.csv"
    search(FakeBuilds(), SearchPlan(20, 4, 3, 2, 1), [], strength, log, quiet)
    scored: list[dict[str, Any]] = []

    def counting(build: dict[str, Any]) -> Score:
        scored.append(build)
        return strength(build)

    found = search(FakeBuilds(), SearchPlan(20, 6, 3, 2, 1), [], counting, log, quiet)
    assert len(found) == 6
    assert len(scored) == 2
    assert len(read_log(log)) == 6
    assert [candidate.index for candidate in read_log(log)] == [1, 2, 3, 4, 5, 6]


def test_ties_go_to_the_better_measured_and_then_the_earlier() -> None:
    first = Candidate(1, "a", {}, Score(1, 2, 0, 0))
    wider = Candidate(2, "b", {}, Score(2, 4, 0, 0))
    later = Candidate(3, "c", {}, Score(2, 4, 0, 0))
    assert [candidate.index for candidate in ranked([later, first, wider])] == [2, 3, 1]


def test_a_score_counts_duels_and_arenas_together() -> None:
    assert Score(3, 4, 1, 4).value == pytest.approx(0.5)
    assert Score(0, 0, 0, 0).value == 0
