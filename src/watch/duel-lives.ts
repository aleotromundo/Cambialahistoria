import type { ArenaOutcome } from '../../sim/rl/arena.ts';

export const DUEL_LIVES = {
  names: ['First model', 'Second model'],
  tags: ['First', 'Second'],
  firstSeat: /(?:^|[^a-z])first([0-9]+)(?:[^0-9]|$)/i,
} as const;

export interface SeatLife {
  readonly life: number;
  readonly maxLife: number;
  readonly outcome: ArenaOutcome;
}

export type LifeStanding = 'fighting' | 'won' | 'down' | 'time';

export interface LifeRow {
  readonly name: string;
  readonly tag: string;
  readonly side: number;
  readonly fraction: number;
  readonly standing: LifeStanding;
  readonly result: string;
}

export function firstSeatOf(label: string, seats: number): number {
  const found: RegExpExecArray | null = DUEL_LIVES.firstSeat.exec(label);
  const seat: number = found === null ? 0 : Number(found[1]);
  return Number.isInteger(seat) && seat >= 0 && seat < seats ? seat : 0;
}

function sideOf(seat: number, first: number): number {
  if (seat === first) return 0;
  return seat < first ? seat + 1 : seat;
}

const STANDING_OF: Readonly<Record<ArenaOutcome, LifeStanding>> = { running: 'fighting', won: 'won', died: 'down', timeout: 'time' };

const RESULT_OF: Readonly<Record<LifeStanding, string>> = { fighting: '', won: 'Wins', down: 'Down', time: 'Time' };

function fractionOf(seat: SeatLife): number {
  if (!(seat.maxLife > 0) || !Number.isFinite(seat.life)) return 0;
  return Math.min(1, Math.max(0, seat.life / seat.maxLife));
}

function nameOf(side: number, names: readonly string[]): string {
  return names[side] ?? `Model ${side + 1}`;
}

export function duelLives(label: string, seats: readonly SeatLife[]): LifeRow[] {
  const first: number = firstSeatOf(label, seats.length);
  return seats.map((seat: SeatLife, index: number): LifeRow => {
    const side: number = sideOf(index, first);
    const standing: LifeStanding = STANDING_OF[seat.outcome];
    return { name: nameOf(side, DUEL_LIVES.names), tag: nameOf(side, DUEL_LIVES.tags), side, fraction: fractionOf(seat), standing, result: RESULT_OF[standing] };
  });
}

export function duelVerdict(rows: readonly LifeRow[]): string | null {
  if (rows.length === 0 || rows.some((row: LifeRow): boolean => row.standing === 'fighting')) return null;
  const winners: LifeRow[] = rows.filter((row: LifeRow): boolean => row.standing === 'won');
  const winner: LifeRow | undefined = winners[0];
  if (winners.length === 1 && winner !== undefined) return `${winner.name} wins`;
  if (rows.every((row: LifeRow): boolean => row.standing === 'down')) return 'Both fell';
  return 'No winner, time ran out';
}
