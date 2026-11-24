import type { ChartGroup, Content, EmpoweredMod, ModOp, SkillMod, SkillModField, SkillTarget, StatId, StatMod } from './content/types.ts';

const RATIO_STATS: ReadonlySet<StatId> = new Set<StatId>(['damagePercent', 'attackSpeed', 'critChance', 'critMultiplier', 'goldFind', 'stormResist', 'frostResist']);
const DECIMAL_STATS: ReadonlySet<StatId> = new Set<StatId>(['lifeRegen', 'manaRegen']);

const STAT_LABELS: Readonly<Record<StatId, string>> = {
  maxLife: 'Vida máxima',
  maxMana: 'Maná máximo',
  lifeRegen: 'Vida regenerada por segundo',
  manaRegen: 'Maná regenerado por segundo',
  damageMin: 'Daño mínimo',
  damageMax: 'Daño máximo',
  damagePercent: 'Daño',
  attackSpeed: 'Velocidad de ataque',
  critChance: 'Probabilidad de golpe crítico',
  critMultiplier: 'Daño de golpe crítico',
  moveSpeed: 'Velocidad de movimiento',
  armour: 'Armadura',
  goldFind: 'Oro encontrado',
  stormResist: 'Resistencia a la Tormenta',
  frostResist: 'Resistencia al Hielo',
};

export function statLabel(stat: StatId): string {
  return STAT_LABELS[stat];
}

export function isRatio(stat: StatId, op: ModOp): boolean {
  return op === 'percent' || RATIO_STATS.has(stat);
}

export function roundStat(stat: StatId, op: ModOp, value: number): number {
  if (isRatio(stat, op)) return Math.round(value * 100) / 100;
  if (DECIMAL_STATS.has(stat)) return Math.round(value * 10) / 10;
  return Math.round(value);
}

export function describeMod(mod: StatMod): string {
  const sign: string = mod.value < 0 ? '−' : '+';
  const size: number = Math.abs(mod.value);
  if (isRatio(mod.stat, mod.op)) return `${sign}${Math.round(size * 100)}% ${statLabel(mod.stat)}`;
  return `${sign}${size} ${statLabel(mod.stat)}`;
}

export function describeExactMod(mod: StatMod): string {
  if (!isRatio(mod.stat, mod.op)) return describeMod(mod);
  const sign: string = mod.value < 0 ? '−' : '+';
  return `${sign}${Number((Math.abs(mod.value) * 100).toFixed(1))}% ${statLabel(mod.stat)}`;
}

function targetName(content: Content, target: SkillTarget): string {
  if (target.type === 'skill') return content.skills.get(target.skill)?.name ?? target.skill;
  return content.chart.groups.find((group: ChartGroup): boolean => group.id === target.group)?.name ?? target.group;
}

interface FieldWords {
  readonly word: string;
  readonly count: boolean;
}

const FIELD_WORDS: Readonly<Record<SkillModField, FieldWords>> = {
  damagePercent: { word: 'de daño', count: false },
  areaPercent: { word: 'área', count: false },
  rangePercent: { word: 'alcance', count: false },
  durationPercent: { word: 'duración', count: false },
  cooldownPercent: { word: 'recarga', count: false },
  manaCostPercent: { word: 'costo de maná', count: false },
  knockbackPercent: { word: 'retroceso', count: false },
  staggerPercent: { word: 'aturdimiento', count: false },
  projectiles: { word: 'proyectiles', count: true },
  pierce: { word: 'perforación', count: true },
  chains: { word: 'rebotes en cadena', count: true },
  chainFalloff: { word: 'pérdida por rebote', count: false },
  momentumCapPercent: { word: 'límite de impulso', count: false },
  momentumGracePercent: { word: 'margen de impulso', count: false },
  lifePerHit: { word: 'vida por golpe', count: true },
  lifeOnHit: { word: 'vida al golpear', count: true },
  leech: { word: 'robo de vida', count: false },
  echo: { word: 'eco', count: false },
  pull: { word: 'atracción', count: true },
  spread: { word: 'grados de dispersión', count: true },
};

export function describeEmpoweredMod(mod: EmpoweredMod): string {
  const sign: string = mod.value < 0 ? '-' : '+';
  const size: number = Math.abs(mod.value);
  const words: FieldWords = FIELD_WORDS[mod.field];
  const amount: string = words.count ? String(size) : `${Math.round(size * 100)}%`;
  return `${sign}${amount} ${words.word}`;
}

export function describeSkillMod(content: Content, mod: SkillMod): string {
  return `${describeEmpoweredMod(mod)} (${targetName(content, mod.target)})`;
}
