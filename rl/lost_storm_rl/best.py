from __future__ import annotations

import csv
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

BEST_HEADER = ["update", "wins", "played", "model_won", "bot_won", "model_high", "bot_high", "kept"]
HIGH_BAND = "levels 9-12"


@dataclass(frozen=True)
class BestCheck:
    update: int
    wins: int
    played: int
    model_won: float
    bot_won: float
    model_high: float
    bot_high: float


@dataclass
class BestKeeper:
    every: int
    best: Fraction = Fraction(-1)

    def due(self, update: int) -> bool:
        return self.every > 0 and update % self.every == 0

    def offer(self, check: BestCheck) -> bool:
        rate = Fraction(check.wins, max(1, check.played))
        if rate <= self.best:
            return False
        self.best = rate
        return True


def high_band(report: dict[str, Any]) -> str:
    named = report.get("high")
    return named if isinstance(named, str) else HIGH_BAND


def band(report: dict[str, Any], key: str) -> float:
    levels = report["by_level"].get(high_band(report))
    return float(levels[key]) if isinstance(levels, dict) else float("nan")


def best_check(update: int, wins: int, report: dict[str, Any]) -> BestCheck:
    return BestCheck(update, wins, int(report["paired"]), float(report["model_won"]), float(report["bot_won"]), band(report, "model_won"), band(report, "bot_won"))


def saved_rate(extra: dict[str, Any]) -> Fraction:
    best = extra.get("best")
    if not isinstance(best, dict) or not isinstance(best.get("wins"), int) or not isinstance(best.get("played"), int):
        return Fraction(-1)
    return Fraction(best["wins"], max(1, best["played"]))


def note_best(path: Path, check: BestCheck, kept: bool) -> None:
    fresh = not path.exists()
    with path.open("a", newline="") as handle:
        writer = csv.writer(handle)
        if fresh:
            writer.writerow(BEST_HEADER)
        writer.writerow([check.update, check.wins, check.played, check.model_won, check.bot_won, check.model_high, check.bot_high, int(kept)])
