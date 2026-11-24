import type { AffixDef, DropLean, MonsterDef, FamilyDef, ItemBaseDef, ItemSlot, RarityDef, SkillDef, StatId, WeaponGroup, ZoneDef } from '../../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../../sim/content/types.ts';
import { statLabel } from '../../../sim/stat-text.ts';
import { ARMOUR_HALF_POINT, armourReduction } from '../../../sim/stats.ts';
import type { GuideData } from '../data.ts';
import { capPercent, SLOT_NAMES, statAmount, statCap } from '../facts.ts';
import { decimal, esc, link, list, para, percent, section, table } from '../html.ts';
import { familyPieces, leanWeapons, leanZones, legendaryShare, placesFor } from '../legendaries.ts';
import { whereLikely } from './build-page.ts';
import type { PageBody } from '../layout.ts';

const STAT_MEANINGS: Readonly<Record<StatId, string>> = {
  maxLife: 'Cuánto puedes soportar antes de caer.',
  maxMana: 'Cuánto puedes gastar en habilidades antes de tener que esperar.',
  lifeRegen: 'La vida que recuperas cada segundo, en combate o fuera de él.',
  manaRegen: 'El maná que recuperas cada segundo.',
  damageMin: 'El extremo inferior del rango de daño. Se suma a cada golpe de cada habilidad.',
  damageMax: 'El extremo superior del rango de daño. Se suma a cada golpe de cada habilidad.',
  damagePercent: 'Una bonificación a todo tu daño, de todas tus habilidades.',
  attackSpeed: 'Qué tan rápido blandes armas y disparas. Esto no hace que los hechizos se lancen más rápido.',
  critChance: 'La probabilidad de que un golpe sea un golpe crítico.',
  critMultiplier: 'Qué tan fuerte impacta un golpe crítico.',
  moveSpeed: 'Qué tan rápido caminas.',
  armour: 'Reduce una parte del daño de cada golpe que recibes.',
  goldFind: 'Más oro de cada montón.',
  stormResist: 'Reduce una parte del daño de los golpes de tormenta, después de la armadura.',
  frostResist: 'Reduce una parte del daño de los golpes de escarcha, después de la armadura.',
};

function capNote(data: GuideData, stat: StatId): string {
  if (stat === 'armour') return `Reduce hasta ${percent(data.content.player.resistance.armourCap)}; ${ARMOUR_HALF_POINT} de armadura reduce ${percent(armourReduction(ARMOUR_HALF_POINT, data.content.player.resistance.armourCap))}`;
  if (stat === 'stormResist' || stat === 'frostResist') return `Tiene un máximo de ${percent(data.content.player.resistance.cap)}`;
  const cap: number | null = statCap(data, stat);
  if (cap === null) return '';
  if (stat === 'moveSpeed') return 'Tiene una velocidad máxima';
  return `Tiene un máximo de ${capPercent(data, stat)}`;
}

function rarityRows(data: GuideData): string[][] {
  const total: number = data.content.rarities.reduce((sum: number, rarity: RarityDef): number => sum + rarity.weight, 0);
  return data.content.rarities.map((rarity: RarityDef): string[] => [
    `<span style="color: ${esc(rarity.color)}">${esc(rarity.name)}</span>`,
    percent(rarity.weight / total),
    rarity.affixMax === 0 ? 'Ninguno' : rarity.affixMin === rarity.affixMax ? String(rarity.affixMin) : `${rarity.affixMin} a ${rarity.affixMax}`,
  ]);
}

function familyName(data: GuideData, id: string): string {
  return data.content.families.get(id)?.name ?? '';
}

function legendaryRows(data: GuideData): string[][] {
  return [...data.content.families.values()].flatMap((family: FamilyDef): string[][] =>
    familyPieces(data.content, family.id).map((base: ItemBaseDef): string[] => [esc(familyName(data, family.id)), `<b>${esc(base.name)}</b>`, base.slot === null ? '' : SLOT_NAMES[base.slot], esc(base.power?.text ?? ''), esc(whereLikely(placesFor(data.content, base)))]),
  );
}

function favouredWeapons(data: GuideData, lean: DropLean): string {
  const groups: string[] = leanWeapons(data.content, lean).map((group: WeaponGroup): string => group.needs);
  const slots: string[] = lean.slots.map((slot: ItemSlot): string => `${SLOT_NAMES[slot]}: objetos`);
  return esc(list([...groups, ...slots]));
}

function favouredFamilies(data: GuideData, lean: DropLean): string {
  return esc(list(lean.families.map((id: string): string => familyName(data, id))));
}

function levelsOf(data: GuideData, lean: DropLean): string {
  const levels: number[] = leanZones(data.content, lean).map((zone: ZoneDef): number => zone.level);
  const low: number = Math.min(...levels);
  const high: number = Math.max(...levels);
  return low === high ? String(low) : `${low} a ${high}`;
}

function leanRows(data: GuideData): string[][] {
  return data.content.leans.map((lean: DropLean): string[] => [
    esc(`${lean.name.charAt(0).toUpperCase()}${lean.name.slice(1)}`),
    levelsOf(data, lean),
    lean.share > 1 ? favouredWeapons(data, lean) : '',
    lean.share > 1 ? favouredFamilies(data, lean) : '',
    lean.legendary > 1 ? `×${decimal(lean.legendary, 0)} objetos legendarios` : '',
  ]);
}

function bossLine(data: GuideData): string {
  const court: DropLean | undefined = data.content.leans.find((lean: DropLean): boolean => lean.legendary > 1);
  if (court === undefined) return '';
  const floorId: string | undefined = [...data.content.monsters.values()].find((monster: MonsterDef): boolean => monster.boss !== null)?.boss?.drop.floor;
  const floor: RarityDef | undefined = data.content.rarities.find((rarity: RarityDef): boolean => rarity.id === floorId);
  const floorName: string = floor?.name.toLowerCase() ?? 'rare';
  return `En ${esc(court.name)}, la probabilidad de obtener un objeto legendario es ${decimal(court.legendary, 0)} veces mayor que en cualquier otro lugar. Un jefe siempre deja objetos ${esc(floorName)} o mejores; allí, el ${percent(legendaryShare(data.content, court, floor?.id ?? null))} son legendarios, frente al ${percent(legendaryShare(data.content, null, floor?.id ?? null))} en otros lugares.`;
}

function shareWord(data: GuideData): string {
  const shares: number[] = [...new Set(data.content.leans.filter((lean: DropLean): boolean => lean.share > 1).map((lean: DropLean): number => lean.share))];
  return shares.length === 1 ? `${decimal(shares[0] ?? 1, 1)} veces` : 'varias veces';
}

function affixRows(data: GuideData): string[][] {
  return [...data.content.affixes.values()].map((affix: AffixDef): string[] => [
    esc(affix.label),
    esc(affix.op === 'percent' ? `más ${statLabel(affix.stat)}` : statLabel(affix.stat)),
    `De +${statAmount(affix.stat, affix.op, affix.min)} a +${statAmount(affix.stat, affix.op, affix.max)}`,
    esc(list(affix.slots.map((slot: ItemSlot): string => SLOT_NAMES[slot]))),
  ]);
}

function statsInPlay(data: GuideData): StatId[] {
  const seen: Set<StatId> = new Set<StatId>();
  for (const affix of data.content.affixes.values()) seen.add(affix.stat);
  for (const base of data.content.itemBases.values()) for (const mod of base.implicit) seen.add(mod.stat);
  return [...seen];
}

function weaponRows(data: GuideData): string[][] {
  return [...data.content.itemBases.values()]
    .filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.dropWeight > 0 && base.power === null)
    .toSorted((a: ItemBaseDef, b: ItemBaseDef): number => a.minLevel - b.minLevel)
    .map((base: ItemBaseDef): string[] => {
      const low: number = base.implicit.find((mod): boolean => mod.stat === 'damageMin')?.value ?? 0;
      const high: number = base.implicit.find((mod): boolean => mod.stat === 'damageMax')?.value ?? 0;
      const speed: number = base.implicit.find((mod): boolean => mod.stat === 'attackSpeed')?.value ?? 0;
      const changes: string = base.variants.map((variant): string => data.content.skills.get(variant.becomes)?.name ?? '').filter((name: string): boolean => name.length > 0).join(', ');
      return [esc(base.name), String(base.minLevel), `${low} a ${high}`, speed === 0 ? '' : `${speed > 0 ? '+' : '−'}${percent(Math.abs(speed))}`, changes.length === 0 ? '' : `Tajo se convierte en ${esc(changes)}`];
    });
}

function powered(data: GuideData): RarityDef | undefined {
  return data.content.rarities.find((rarity: RarityDef): boolean => rarity.powers);
}

export function itemsPage(data: GuideData): PageBody {
  const legendary: RarityDef | undefined = powered(data);
  const families: readonly FamilyDef[] = [...data.content.families.values()];
  const growth: string = percent(data.content.itemScaling.implicitPerLevel);
  const quarrel: SkillDef | undefined = data.content.skills.get('quarrel');
  return {
    kicker: 'Guía',
    title: 'Objetos',
    lede: 'Qué puedes usar, qué tan raros son los objetos y qué hace cada línea de un objeto por ti.',
    description: 'Objetos en The Lost Storm: espacios, rarezas y probabilidades de aparición, todos los afijos y armas, los legendarios por familia, dónde aparece más cada tipo y qué hace cada estadística.',
    body: [
      section(
        'slots',
        'Lo que usas',
        para(
          `Tienes ${ITEM_SLOTS.length} espacios: ${esc(list(ITEM_SLOTS.map((slot: ItemSlot): string => SLOT_NAMES[slot])))}. Tu arma determina tu rango de daño, y todas tus habilidades parten de él, por eso es el espacio más importante. Los demás aportan vida, armadura, velocidad y otros atributos.`,
          `Cada objeto tiene un nivel, más o menos igual al tuyo cuando apareció. Sus atributos propios (los que tiene cada objeto de ese tipo) aumentan ${growth} por cada nivel por encima del primero; lo mismo ocurre con los atributos aleatorios. Una desventaja, como el golpe más lento de un arma pesada o el paso más lento de una armadura de placas, no cambia con el nivel. Una espada de nivel 15 es mucho mejor que una de nivel 2.`,
        ),
      ),
      section(
        'weapons',
        'Armas',
        [
          para(`Las armas más pesadas se blandan más despacio, pero golpean más fuerte. ${quarrel === undefined ? '' : `Una ballesta convierte Tajo en ${esc(quarrel.name)}, un disparo.`} El daño de abajo corresponde a un objeto de nivel 1; aumenta con su nivel.`),
          table({ head: ['Arma', 'Desde el nivel', 'Daño', 'Velocidad de ataque', 'Cambios'], rows: weaponRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'rarity',
        'Rareza',
        [
          para('La mayoría de los objetos que aparecen son comunes. Los objetos mágicos y raros pueden tener atributos aleatorios adicionales, además de los que trae cada objeto de su tipo. Los grupos mágicos y raros dejan más botín, y el líder de un grupo raro siempre deja al menos un objeto mágico.'),
          table({ head: ['Rareza', 'Proporción de objetos', 'Atributos aleatorios'], rows: rarityRows(data) }),
        ].join('\n'),
      ),
      section(
        'legendary',
        'Legendarios',
        [
          para(
            `Un objeto ${esc(legendary?.name.toLowerCase() ?? 'legendario')} es una de unas pocas piezas con nombre propio, cada una con un poder único. Puedes llevar como máximo ${legendary?.wornLimit ?? 0} a la vez. Hay ${families.length} familias: ${esc(list(families.map((family: FamilyDef): string => family.name)))}; los poderes de cada familia se complementan.`,
          ),
          table({ head: ['Familia', 'Objeto', 'Espacio', 'Poder', 'Más probable en'], rows: legendaryRows(data), className: 'wide' }),
          para(`Cada ${link('/guide/builds/', 'configuración')} indica qué objetos legendarios están pensados para ella, qué cambia cada uno y cuál conviene buscar primero.`),
        ].join('\n'),
      ),
      section(
        'where',
        'Dónde aparecen los objetos',
        [
          para(
            `En todas las zonas puede aparecer cualquier objeto. Algunas favorecen ciertos tipos: allí, cada tipo de arma favorecido aparece aproximadamente ${shareWord(data)} veces más que en otras zonas, en comparación con los demás tipos; lo mismo ocurre con los legendarios de las familias favorecidas. Ninguna zona deja más objetos ni objetos de mayor rareza, salvo que la tabla indique lo contrario.`,
            bossLine(data),
          ),
          table({ head: ['Zona', 'Nivel de los monstruos', 'Favorece', 'Legendarios favorecidos', 'Objetos más raros'], rows: leanRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'affixes',
        'Atributos aleatorios',
        [
          para('Estos son los atributos aleatorios que puede tener un objeto mágico, raro o legendario. El rango corresponde a un objeto de nivel 1; los objetos de mayor nivel pueden obtener valores más altos. Ningún objeto puede tener dos veces el mismo atributo.'),
          table({ head: ['Atributo', 'Efecto', 'Rango en nivel 1', 'Puede aparecer en'], rows: affixRows(data), className: 'wide' }),
        ].join('\n'),
      ),
      section(
        'stats',
        'Qué hace cada atributo',
        [
          table({ head: ['Atributo', 'Efecto', 'Límite'], rows: statsInPlay(data).map((stat: StatId): string[] => [esc(statLabel(stat)), esc(STAT_MEANINGS[stat]), esc(capNote(data, stat))]) }),
          para(`En la página de ${link('/guide/combat/', 'combate')} se explica cómo interactúan el daño, la armadura y las resistencias.`),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
