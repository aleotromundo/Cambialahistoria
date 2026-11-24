import type { ArenaOutcome } from '../../sim/rl/arena.ts';
import type { RivalOutcome } from '../../sim/rl/rival.ts';
import type { PlayerState } from '../../sim/world/types.ts';
import type { LifeRow, SeatLife, SeatNames } from '../watch/duel-lives.ts';
import { duelLives } from '../watch/duel-lives.ts';

export const RIVAL_LIVES: SeatNames = {
  names: ['Tú', 'Rival'],
  tags: ['Tú', 'Rival'],
};

interface Ending {
  readonly you: ArenaOutcome;
  readonly rival: ArenaOutcome;
  readonly verdict: string | null;
}

const ENDINGS: Readonly<Record<RivalOutcome, Ending>> = {
  fighting: { you: 'running', rival: 'running', verdict: null },
  won: { you: 'won', rival: 'died', verdict: 'Ganaste' },
  lost: { you: 'died', rival: 'won', verdict: 'El rival ganó' },
  resigned: { you: 'running', rival: 'won', verdict: 'Te rendiste' },
  left: { you: 'running', rival: 'running', verdict: null },
};

function lifeOf(hero: PlayerState | null, outcome: ArenaOutcome): SeatLife {
  if (hero === null) return { life: 0, maxLife: 1, outcome };
  return { life: hero.alive ? hero.life : 0, maxLife: hero.maxLife, outcome };
}

export function rivalLives(outcome: RivalOutcome, you: PlayerState, rival: PlayerState | null): LifeRow[] {
  const ending: Ending = ENDINGS[outcome];
  return duelLives('', [lifeOf(you, ending.you), lifeOf(rival, ending.rival)], RIVAL_LIVES);
}

export function rivalVerdict(outcome: RivalOutcome): string | null {
  return ENDINGS[outcome].verdict;
}
