import type { Content, RarityDef } from '../../sim/content/types.ts';
import type { PlayerStats } from '../../sim/tally.ts';
import type { CharacterProfile } from '../backend/api.ts';

export const RECORD = {
  secondsPerMinute: 60,
  minutesPerHour: 60,
  msPerSecond: 1000,
  under: 'Menos de un minuto',
} as const;

export type RecordId = 'played' | 'kills' | 'bosses' | 'deaths' | 'level' | 'furthest' | 'gold' | 'found' | 'hit' | 'quests' | 'moments';

export interface RecordFigures {
  readonly playedSeconds: number;
  readonly kills: number;
  readonly bosses: number;
  readonly deaths: number;
  readonly level: number;
  readonly furthest: string;
  readonly goldLooted: number;
  readonly found: Readonly<Record<string, number>>;
  readonly biggestHit: number;
  readonly quests: number;
  readonly moments: number;
}

export type RecordValue = { readonly kind: 'count'; readonly value: number } | { readonly kind: 'time'; readonly seconds: number } | { readonly kind: 'text'; readonly text: string };

export interface RecordLine {
  readonly id: RecordId;
  readonly name: string;
  readonly value: RecordValue;
}

export interface FoundLine {
  readonly rarity: string;
  readonly name: string;
  readonly count: number;
}

const GROUPED: Intl.NumberFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

function whole(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function countText(value: number): string {
  return GROUPED.format(whole(value));
}

export function playedText(seconds: number): string {
  const minutes: number = Math.floor(whole(seconds) / RECORD.secondsPerMinute);
  if (minutes < 1) return RECORD.under;
  const hours: number = Math.floor(minutes / RECORD.minutesPerHour);
  const rest: number = minutes % RECORD.minutesPerHour;
  if (hours === 0) return `${String(rest)}m`;
  return `${countText(hours)}h ${String(rest).padStart(2, '0')}m`;
}

export function valueText(value: RecordValue): string {
  switch (value.kind) {
    case 'count':
      return countText(value.value);
    case 'time':
      return playedText(value.seconds);
    case 'text':
      return value.text;
  }
  return '';
}

export function foundTotal(found: Readonly<Record<string, number>>): number {
  return Object.values(found).reduce((sum: number, count: number): number => sum + whole(count), 0);
}

export function foundLines(content: Content, found: Readonly<Record<string, number>>): readonly FoundLine[] {
  return content.rarities.flatMap((rarity: RarityDef): FoundLine[] => {
    const count: number = whole(found[rarity.id] ?? 0);
    return count > 0 ? [{ rarity: rarity.id, name: rarity.name, count }] : [];
  });
}

export function recordLines(figures: RecordFigures): readonly RecordLine[] {
  const count = (value: number): RecordValue => ({ kind: 'count', value: whole(value) });
  return [
    { id: 'played', name: 'Tiempo jugado', value: { kind: 'time', seconds: whole(figures.playedSeconds) } },
    { id: 'kills', name: 'Monstruos derrotados', value: count(figures.kills) },
    { id: 'bosses', name: 'Jefes derrotados', value: count(figures.bosses) },
    { id: 'deaths', name: 'Muertes', value: count(figures.deaths) },
    { id: 'level', name: 'Nivel más alto', value: count(figures.level) },
    { id: 'furthest', name: 'Mayor avance', value: { kind: 'text', text: figures.furthest } },
    { id: 'hit', name: 'Golpe más fuerte', value: count(figures.biggestHit) },
    { id: 'gold', name: 'Oro saqueado', value: count(figures.goldLooted) },
    { id: 'found', name: 'Objetos encontrados', value: count(foundTotal(figures.found)) },
    { id: 'quests', name: 'Misiones completadas', value: count(figures.quests) },
    { id: 'moments', name: 'Momentos superados', value: count(figures.moments) },
  ];
}

export function ownFigures(content: Content, stats: PlayerStats): RecordFigures {
  return {
    playedSeconds: stats.played,
    kills: stats.kills,
    bosses: stats.bosses,
    deaths: stats.deaths,
    level: stats.level,
    furthest: content.zones.get(stats.furthest)?.name ?? stats.furthest,
    goldLooted: stats.goldLooted,
    found: stats.found,
    biggestHit: stats.biggestHit,
    quests: stats.quests,
    moments: stats.moments,
  };
}

export function profileFigures(profile: CharacterProfile): RecordFigures {
  const { stats } = profile;
  return {
    playedSeconds: stats.playedMs / RECORD.msPerSecond,
    kills: stats.kills,
    bosses: stats.bosses,
    deaths: stats.deaths,
    level: Math.max(stats.bestLevel, profile.level),
    furthest: profile.furthest,
    goldLooted: stats.goldLooted,
    found: stats.found,
    biggestHit: stats.biggestHit,
    quests: stats.quests,
    moments: stats.moments,
  };
}
