from __future__ import annotations

import csv
import json
import subprocess
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import torch

from .bridge import REPO, ArenaEnvs
from .match import play_match
from .model import Policy

BUILD_TOOL = REPO / "tools" / "rl" / "build-tool.ts"
SEARCH_HEADER = ["candidate", "origin", "score", "duel_won", "duel_played", "arena_won", "arena_played", "build"]
RANDOM_SEED = 1
MUTATE_SEED = 1_000_003
ARENA_OFFSET = 100_000_000
MAX_WORKERS = 2
BUILD_FIELDS = ("name", "weapon", "skills", "route", "hero")


class BuildSource(Protocol):
    def random(self, level: int, seeds: list[int]) -> list[dict[str, Any]]: ...

    def mutate(self, level: int, seed: int, builds: list[dict[str, Any]]) -> list[dict[str, Any]]: ...

    def problems(self, level: int, builds: list[dict[str, Any]]) -> list[list[str]]: ...


class BuildToolError(RuntimeError):
    pass


class NodeBuilds:
    def ask(self, request: dict[str, Any]) -> dict[str, Any]:
        done = subprocess.run(["node", str(BUILD_TOOL)], cwd=REPO, input=json.dumps(request).encode("utf-8"), capture_output=True, check=False)
        if done.returncode != 0:
            raise BuildToolError(done.stderr.decode("utf-8", "replace").strip())
        answer = json.loads(done.stdout.decode("utf-8"))
        if not isinstance(answer, dict):
            raise BuildToolError("the build tool answered something that is not an object")
        return answer

    def random(self, level: int, seeds: list[int]) -> list[dict[str, Any]]:
        return list(self.ask({"action": "random", "level": level, "seeds": seeds})["builds"])

    def mutate(self, level: int, seed: int, builds: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return list(self.ask({"action": "mutate", "level": level, "seed": seed, "builds": builds})["builds"])

    def problems(self, level: int, builds: list[dict[str, Any]]) -> list[list[str]]:
        return [list(found) for found in self.ask({"action": "check", "level": level, "builds": builds})["problems"]]


@dataclass(frozen=True)
class Score:
    duel_won: int
    duel_played: int
    arena_won: int
    arena_played: int

    @property
    def value(self) -> float:
        return (self.duel_won + self.arena_won) / max(1, self.duel_played + self.arena_played)


@dataclass(frozen=True)
class Candidate:
    index: int
    origin: str
    build: dict[str, Any]
    score: Score


Scorer = Callable[[dict[str, Any]], Score]


def plain(build: dict[str, Any]) -> dict[str, Any]:
    return {key: build[key] for key in BUILD_FIELDS if key in build and key != "name"}


def build_key(build: dict[str, Any]) -> str:
    return json.dumps(plain(build), sort_keys=True)


def read_log(path: Path) -> list[Candidate]:
    if not path.exists():
        return []
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [Candidate(int(row["candidate"]), row["origin"], json.loads(row["build"]), Score(int(row["duel_won"]), int(row["duel_played"]), int(row["arena_won"]), int(row["arena_played"]))) for row in rows]


def note(path: Path, candidate: Candidate) -> None:
    fresh = not path.exists()
    with path.open("a", newline="") as handle:
        writer = csv.writer(handle)
        if fresh:
            writer.writerow(SEARCH_HEADER)
        score = candidate.score
        writer.writerow([candidate.index, candidate.origin, round(score.value, 4), score.duel_won, score.duel_played, score.arena_won, score.arena_played, json.dumps(candidate.build, sort_keys=True)])


def ranked(candidates: list[Candidate]) -> list[Candidate]:
    return sorted(candidates, key=lambda candidate: (-candidate.score.value, -(candidate.score.duel_played + candidate.score.arena_played), candidate.index))


def named(build: dict[str, Any], name: str) -> dict[str, Any]:
    return {**plain(build), "name": name}


@dataclass(frozen=True)
class SearchPlan:
    level: int
    budget: int
    randoms: int
    keep: int
    workers: int


def opening(source: BuildSource, plan: SearchPlan, examples: list[dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    legal = [build for build, found in zip(examples, source.problems(plan.level, examples)) if not found] if examples else []
    drawn = source.random(plan.level, [RANDOM_SEED + index for index in range(plan.randoms)]) if plan.randoms > 0 else []
    return [(f"example {build['name']}", build) for build in legal] + [(f"random {RANDOM_SEED + index}", build) for index, build in enumerate(drawn)]


def search(source: BuildSource, plan: SearchPlan, examples: list[dict[str, Any]], scorer: Scorer, log: Path, said: Callable[[str], None] = print) -> list[Candidate]:
    done = read_log(log)
    seen = {build_key(candidate.build) for candidate in done}
    if done:
        said(f"resuming from {len(done)} candidates in {log}")

    def run(batch: list[tuple[str, dict[str, Any]]]) -> None:
        fresh: list[tuple[str, dict[str, Any]]] = []
        for origin, build in batch:
            key = build_key(build)
            if key in seen or len(done) + len(fresh) >= plan.budget:
                continue
            seen.add(key)
            fresh.append((origin, build))
        with ThreadPoolExecutor(max_workers=max(1, min(plan.workers, MAX_WORKERS))) as pool:
            scores = list(pool.map(lambda entry: scorer(named(entry[1], "Candidate")), fresh))
        for (origin, build), score in zip(fresh, scores):
            candidate = Candidate(len(done) + 1, origin, named(build, f"Candidate {len(done) + 1}"), score)
            done.append(candidate)
            note(log, candidate)
            said(f"candidate {candidate.index}/{plan.budget} ({origin}): {score.value:.1%} won, duels {score.duel_won}/{score.duel_played}, arenas {score.arena_won}/{score.arena_played}")

    run(opening(source, plan, examples))
    stalled = 0
    while len(done) < plan.budget and stalled < plan.budget:
        before = len(done)
        parents = ranked(done)[: max(1, plan.keep)]
        run([(f"mutation of {parent.index}", child) for parent, child in zip(parents, source.mutate(plan.level, MUTATE_SEED + len(done) + stalled, [parent.build for parent in parents]))])
        stalled = stalled + 1 if len(done) == before else 0
    return ranked(done)


def arena_wins(policy: Policy, build: dict[str, Any], level: int, seed: int, episodes: int, jitter: float, waves: int) -> tuple[int, int]:
    envs = ArenaEnvs(1, min(episodes, 16), seed, jitter, waves, build=build, level=level)
    finished: dict[int, dict[str, Any]] = {}
    try:
        envs.tag("search")
        batch = envs.reset()
        while not all(seed + index in finished for index in range(episodes)):
            with torch.no_grad():
                action, _, _ = policy.act(torch.from_numpy(batch.obs), torch.from_numpy(batch.mask), greedy=True)
            batch = envs.step(action.numpy())
            for episode in batch.finished:
                if seed <= int(episode["seed"]) < seed + episodes:
                    finished[int(episode["seed"])] = episode
    finally:
        envs.close()
    return sum(1 for episode in finished.values() if episode["outcome"] == "won"), episodes


def model_scorer(policy: Policy, rivals: list[dict[str, Any]], level: int, seed: int, duels: int, arenas: int, jitter: float, waves: int) -> Scorer:
    def score(build: dict[str, Any]) -> Score:
        won = 0
        played = 0
        for rival in rivals:
            for duel in play_match(policy, policy, duels, seed, jitter, True, None, build, rival, level):
                played += 1
                won += 1 if duel.first == "won" else 0
        arena_won, arena_played = arena_wins(policy, build, level, seed + ARENA_OFFSET, arenas, jitter, waves) if arenas > 0 else (0, 0)
        return Score(won, played, arena_won, arena_played)

    return score


def seeds_needed(duels: int, arenas: int) -> int:
    return max(ARENA_OFFSET + arenas, duels + 16)
