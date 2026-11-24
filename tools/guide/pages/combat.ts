import type { BossDef, BossPhase, MonsterDef, RarityDef, SkillDef } from '../../../sim/content/types.ts';
import type { MonsterModDef } from '../../../sim/content/combat-types.ts';
import type { PackRankDef, RankModChoice, RankScale } from '../../../sim/content/rank-types.ts';
import { gapBand, gapScale } from '../../../sim/progression.ts';
import { ARMOUR_HALF_POINT, armourReduction } from '../../../sim/stats.ts';
import type { GuideData } from '../data.ts';
import { monster, skill, zone } from '../data.ts';
import { capPercent } from '../facts.ts';
import { bullets, decimal, esc, link, list, note, para, percent, section, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { gateLevel } from './start.ts';

export const COMBAT_PAGE = {
  armourSamples: [10, 25, 50, 100, 200, 300],
  gapHero: 10,
  gapSteps: [0, 4, 5, 6, 7, 8, 10],
  boss: 'timekeeper_gatekeeper',
} as const;

function times(scale: number): string {
  return `×${decimal(scale, 2)}`;
}

function more(scale: number): string {
  return scale >= 1 ? `${percent(scale - 1)} más` : `${percent(1 - scale)} menos`;
}

function rank(data: GuideData, id: string): PackRankDef {
  const found: PackRankDef | undefined = data.content.packRanks.ranks.find((entry: PackRankDef): boolean => entry.id === id);
  if (found === undefined) throw new Error(`no existe el rango de grupo ${id}`);
  return found;
}

function scaleLine(scale: RankScale): string {
  return `${more(scale.life)} de vida, ${more(scale.damage)} de daño, ${times(scale.xp)} de experiencia`;
}

function modEffect(data: GuideData, mod: MonsterModDef): string {
  const parts: string[] = [];
  if (mod.speedScale !== 1) parts.push(`se mueve ${percent(Math.abs(mod.speedScale - 1))} ${mod.speedScale > 1 ? 'más rápido' : 'más lento'}`);
  if (mod.lifeScale !== 1) parts.push(`tiene ${more(mod.lifeScale)} de vida`);
  if (mod.damageScale !== 1) parts.push(`golpea ${percent(Math.abs(mod.damageScale - 1))} ${mod.damageScale > 1 ? 'más fuerte' : 'más suave'}`);
  if (mod.sizeScale > 1) parts.push('es más grande');
  if (mod.staggerScale < 1) parts.push(`se aturde un ${percent(1 - mod.staggerScale)} menos`);
  if (mod.regen > 0) parts.push(`recupera un ${percent(mod.regen)} de vida por segundo cuando lleva un tiempo sin recibir golpes`);
  if (mod.deathSkill !== null) parts.push(`estalla un instante después de morir, donde cayó (${esc(skill(data, mod.deathSkill).name)}), así que aléjate`);
  return parts.join(', ');
}

function poolMods(data: GuideData): MonsterModDef[] {
  return data.content.packRanks.pool.map((choice: RankModChoice): MonsterModDef => {
    const found: MonsterModDef | undefined = data.content.monsterMods.get(choice.mod);
    if (found === undefined) throw new Error(`no existe el modificador de monstruo ${choice.mod}`);
    return found;
  });
}

function rarityName(data: GuideData, id: string): string {
  const found: RarityDef | undefined = data.content.rarities.find((rarity: RarityDef): boolean => rarity.id === id);
  if (found === undefined) throw new Error(`la guía menciona la rareza desconocida ${id}`);
  return found.name.toLowerCase();
}

function bossOf(data: GuideData): { readonly monster: MonsterDef; readonly boss: BossDef } {
  const found: MonsterDef = monster(data, COMBAT_PAGE.boss);
  if (found.boss === null) throw new Error(`${found.id} no es un jefe`);
  return { monster: found, boss: found.boss };
}

function phaseSkills(data: GuideData, phase: BossPhase): SkillDef[] {
  return phase.skills.map((entry): SkillDef => skill(data, entry.skill));
}

function phaseText(data: GuideData, phase: BossPhase, index: number, all: readonly BossPhase[]): string {
  const skills: readonly SkillDef[] = phaseSkills(data, phase);
  const before: ReadonlySet<string> = new Set<string>(index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).map((entry: SkillDef): string => entry.id));
  const now: ReadonlySet<string> = new Set<string>(skills.map((entry: SkillDef): string => entry.id));
  const added: SkillDef[] = skills.filter((entry: SkillDef): boolean => !before.has(entry.id));
  const dropped: SkillDef[] = index === 0 ? [] : phaseSkills(data, all[index - 1] ?? phase).filter((entry: SkillDef): boolean => !now.has(entry.id));
  const when: string = index === 0 ? 'Desde el principio' : `Por debajo del ${percent(phase.below)} de vida`;
  const what: string = added.map((entry: SkillDef): string => `<b>${esc(entry.name)}</b>: ${esc(entry.description)}`).join(' ');
  const gone: string = dropped.length === 0 ? '' : ` Deja de usar ${esc(list(dropped.map((entry: SkillDef): string => entry.name)))}.`;
  return `${when}. ${index === 0 ? 'Usa' : 'Añade'} ${what}${gone}`;
}

function typedSkills(data: GuideData, type: 'storm' | 'frost'): string[] {
  const { boss } = bossOf(data);
  const fromBoss: SkillDef[] = boss.phases.flatMap((phase: BossPhase): SkillDef[] => phaseSkills(data, phase));
  const fromMods: SkillDef[] = poolMods(data).flatMap((mod: MonsterModDef): SkillDef[] => (mod.deathSkill === null ? [] : [skill(data, mod.deathSkill)]));
  const names: string[] = [...fromBoss, ...fromMods].filter((entry: SkillDef): boolean => entry.damage.type === type).map((entry: SkillDef): string => entry.name);
  return [...new Set(names)];
}

export function gapRows(data: GuideData): string[][] {
  const gap = data.content.player.xp.gap;
  const hero: number = COMBAT_PAGE.gapHero;
  return COMBAT_PAGE.gapSteps.map((step: number): string[] => [step === 0 ? 'Tu nivel' : `${step} niveles de diferencia`, percent(gapScale(gap, hero, hero - step))]);
}

export function combatPage(data: GuideData): PageBody {
  const base = data.content.player.baseStats;
  const per = data.content.player.perLevel;
  const rules = data.content.player.resistance;
  const gap = data.content.player.xp.gap;
  const magic: PackRankDef = rank(data, 'magic');
  const rare: PackRankDef = rank(data, 'rare');
  const { monster: boss, boss: bossDef } = bossOf(data);
  const manaPerLevel: number = per.find((mod): boolean => mod.stat === 'maxMana')?.value ?? 0;
  const lifePerLevel: number = per.find((mod): boolean => mod.stat === 'maxLife')?.value ?? 0;
  return {
    kicker: 'Guía',
    title: 'Cómo funciona el combate',
    lede: 'Qué determina cuánto daño infliges, cuánto recibes y por qué algunas peleas salen mal.',
    description: 'Cómo funciona el combate en The Lost Storm: daño, golpes críticos, armadura, resistencias, maná, aturdimiento, experiencia, magia y grupos raros, además del primer jefe.',
    body: [
      section(
        'damage',
        'Daño',
        [
          para(
            'Cada habilidad que usas parte de tu arma. Cada golpe calcula un número dentro del rango de daño de tu arma, le suma tu bonificación de daño y aplica la proporción que usa la habilidad. Algunas habilidades agregan un poco de daño propio. Después, el golpe puede ser crítico.',
            'Así que un arma mejor hace que todas tus habilidades sean más fuertes, incluso los hechizos. El «daño» del árbol de habilidades y del equipo es una bonificación a todo; el «daño de habilidades con armas» o el «daño de habilidades de rayo» solo cuenta para ese tipo de habilidad.',
            `Empiezas con un rango de daño propio de ${decimal(base.damageMin, 0)} a ${decimal(base.damageMax, 0)}, que aumenta un poco con cada nivel. Tu arma aporta mucho más.`,
          ),
          subsection(
            'Golpes críticos',
            para(`Un golpe crítico multiplica el daño del impacto. Empiezas con una probabilidad del ${percent(base.critChance)} y un multiplicador de ${times(base.critMultiplier)}. La probabilidad deja de contar al llegar al ${capPercent(data, 'critChance')}; el multiplicador no tiene límite.`),
          ),
        ].join('\n'),
      ),
      section(
        'defence',
        'Armadura y resistencias',
        [
          para(`La armadura reduce cada golpe que recibes. Los primeros puntos son los que más cuentan: ${ARMOUR_HALF_POINT} de armadura reduce ${percent(armourReduction(ARMOUR_HALF_POINT, rules.armourCap))}, y ninguna cantidad puede reducir más del ${percent(rules.armourCap)}.`),
          table({ head: ['Armadura', 'Se resta de cada golpe'], rows: COMBAT_PAGE.armourSamples.map((value: number): string[] => [String(value), percent(armourReduction(value, rules.armourCap))]) }),
          para(
            `La resistencia a la tormenta y a la escarcha reduce aún más los golpes de esos tipos, después de la armadura. Tiene un máximo de ${percent(rules.cap)}. Los golpes de tormenta que encontrarás son ${esc(list(typedSkills(data, 'storm')))}; los de escarcha, ${esc(list(typedSkills(data, 'frost')))}. Todo lo demás es daño físico, que solo reduce la armadura.`,
          ),
          para(`La vida también es fundamental para sobrevivir. Empiezas con ${decimal(base.maxLife, 0)} y ganas ${decimal(lifePerLevel, 0)} con cada nivel.`),
        ].join('\n'),
      ),
      section(
        'mana',
        'Maná',
        para(
          `Las habilidades cuestan maná; ${esc(skill(data, 'cleave').name)} y ${esc(skill(data, 'dodge_roll').name)} no cuestan nada. Empiezas con ${decimal(base.maxMana, 0)}, ganas ${decimal(manaPerLevel, 0)} con cada nivel y recuperas ${decimal(base.manaRegen, 1)} por segundo. El frasco de maná en la tecla 2 lo recarga más rápido. Una configuración de hechizos se queda sin maná mucho antes de que sus habilidades terminen de recargarse, así que el maná del equipo y del árbol importa mucho.`,
        ),
      ),
      section(
        'stagger',
        'Aturdimiento y empuje',
        [
          para(
            'Cada golpe empuja un poco al enemigo hacia atrás y lo aturde por un momento. Si un enemigo aturdido estaba preparando un ataque, lo pierde. Las habilidades más pesadas empujan más lejos y aturden por más tiempo: un golpe cargado o un impacto contra el suelo puede detener un gran ataque que un corte rápido no podría.',
            'Algunos ataques potentes llegan a un punto en el que ya no pueden detenerse con un golpe ligero. En ese momento, solo uno pesado puede interrumpirlos. Los enemigos implacables se aturden menos, y el jefe nunca se aturde y apenas se mueve cuando lo golpean.',
          ),
          note(`Fíjate en cuándo prepara el ataque. Cuanto más potente sea, más tiempo tardará en prepararlo y más conviene alejarse con una Rodada evasiva o golpearlo con algo pesado antes de que impacte.`),
        ].join('\n'),
      ),
      section(
        'xp',
        'Experiencia y diferencia de nivel',
        [
          para(
            `En ${esc(zone(data, 'hall_of_time').name)} y ${esc(zone(data, 'keepers_gate').name)}, los enemigos tienen tu nivel, así que siempre te espera un combate equilibrado. Los enemigos de un nivel muy distinto, por encima o por debajo, dan menos experiencia. No hay penalización hasta una diferencia de ${gapBand(gap, COMBAT_PAGE.gapHero)} niveles (un poco más conforme subes); después, disminuye rápidamente.`,
          ),
          table({ head: ['Nivel del enemigo', 'Experiencia que obtienes'], rows: gapRows(data), caption: `Para un personaje de nivel ${COMBAT_PAGE.gapHero}` }),
          para(`Al morir pierdes el ${percent(data.content.player.deathPenalty.xpPercent)} de la experiencia que necesitas para subir al siguiente nivel. Nunca pierdes un nivel.`),
        ].join('\n'),
      ),
      section(
        'packs',
        'Grupos mágicos y raros',
        [
          para(`La mayoría de los grupos son comunes. Algunos brillan: azules para los mágicos y dorados para los raros. Cuanto más avances de nivel, más encontrarás.`),
          terms([
            [
              `<span style="color: ${esc(magic.color)}">${esc(magic.name)}</span>`,
              `Al principio, cerca del ${percent(magic.chance?.base ?? 0)} de los grupos son mágicos; puede llegar al ${percent(magic.chance?.max ?? 0)}. Cada integrante tiene ${scaleLine(magic.members)} y un rasgo de la lista. Dejan más objetos.`,
            ],
            [
              `<span style="color: ${esc(rare.color)}">${esc(rare.name)}</span>`,
              `Al principio, cerca del ${percent(rare.chance?.base ?? 0)} de los grupos son raros; puede llegar al ${percent(rare.chance?.max ?? 0)}. Sus integrantes tienen ${scaleLine(rare.members)}. El líder tiene un nombre de dos palabras, ${scaleLine(rare.leader ?? rare.members)}, ${rare.leader?.mods ?? 0} rasgos y siempre deja ${rare.leader?.items ?? 0} objetos adicionales de rareza mágica o superior.`,
            ],
          ]),
          subsection('Rasgos', bullets(poolMods(data).map((mod: MonsterModDef): string => `<b>${esc(mod.prefix)}</b>: ${modEffect(data, mod)}.`))),
        ].join('\n'),
      ),
      section(
        'boss',
        `El jefe: ${boss.name}`,
        [
          para(
            `${esc(boss.name)} te espera en ${esc(zone(data, 'keepers_gate').name)}, detrás de la puerta que se abre al nivel ${gateLevel(data)}. Es lento, te sigue y cambia su forma de luchar dos veces a medida que pierde vida. Si prefieres enfrentarlo sin saber qué te espera, deja de leer aquí.`,
          ),
          bullets(bossDef.phases.map((phase: BossPhase, index: number): string => phaseText(data, phase, index, bossDef.phases))),
          para(
            `Cada vez que cae, deja ${bossDef.drop.items} objetos de rareza ${esc(rarityName(data, bossDef.drop.floor))} o superior y algo de oro. La primera vez también te da el ${percent(bossDef.firstKill?.xpShare ?? 0)} de un nivel.`,
            `Consejos: muévete para esquivar el barrido, no te quedes quieto en el suelo que te ralentiza y rueda para atravesar las líneas que te sujetan. Cada ${link('/guide/builds/', 'configuración')} muestra con qué frecuencia venció al jefe.`,
          ),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
