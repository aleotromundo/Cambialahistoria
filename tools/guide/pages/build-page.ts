import { emptyEquipment } from '../../../sim/items.ts';
import { computeStats } from '../../../sim/stats.ts';
import { ANY_WEAPON } from '../../../sim/weapons.ts';
import type { DropLean, ItemBaseDef, RarityDef, SkillTreeNodeDef, StatBlock } from '../../../sim/content/types.ts';
import type { SkillPolicy } from '../../simulate-policies.ts';
import { namedSkill } from '../builds.ts';
import type { GuideData } from '../data.ts';
import { buildMeasure, focusSkill, levelForPlace, measuredNow, path, place, route, topLevel } from '../data.ts';
import { SLOT_NAMES } from '../facts.ts';
import { bullets, decimal, esc, list, minutes, note, para, percent, section, signedPercent, table } from '../html.ts';
import type { LegendaryPlaces } from '../legendaries.ts';
import { legendary, legendaryShare, placesFor } from '../legendaries.ts';
import { signatureSection } from '../signature.ts';
import { treePicture } from '../tree-picture.ts';
import type { NamedMeasure } from './measured-view.ts';
import { barChart, bossAt, levelMinutes, measuredTable } from './measured-view.ts';

export interface BuildName {
  readonly name: string;
  readonly kind: string;
}

export const BUILD_NAMES: Readonly<Record<string, BuildName>> = {
  stormcaller: { name: 'Stormcaller', kind: 'Bastón y relámpago' },
  bulwark: { name: 'Emberwarden', kind: 'Arma pesada y fuego' },
  whirlwind: { name: 'Maelstrom', kind: 'Espada y agua' },
  windrunner: { name: 'Nightshot', kind: 'Ballesta y sombra' },
  'echo-weaver': { name: 'The Echo', kind: 'Cualquier arma, recibir dos golpes' },
};

export function buildName(id: string): BuildName {
  const found: BuildName | undefined = BUILD_NAMES[id];
  if (found === undefined) throw new Error(`la configuración ${id} no tiene nombre en la guía`);
  return found;
}

export interface LegendaryNote {
  readonly item: string;
  readonly changes: string;
}

export interface BuildNotes {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly forWho: string;
  readonly plays: readonly string[];
  readonly lean: readonly string[];
  readonly lookFor: readonly string[];
  readonly avoid: readonly string[];
  readonly legendaries: readonly LegendaryNote[];
  readonly chase: string;
  readonly strengths: readonly string[];
  readonly weakSpots: readonly string[];
  readonly thin: readonly string[];
  readonly mainSkill: string | null;
  readonly marks: Readonly<Record<string, string>>;
  readonly afterRoute: string;
}

export const BUILD_PAGE = {
  bossLevelIndex: 0,
  levelIndex: 1,
} as const;

export function buildHref(id: string): string {
  return `/guide/builds/${id}/`;
}

function kindLabel(node: SkillTreeNodeDef): string {
  switch (node.kind) {
    case 'minor':
      return '';
    case 'notable':
      return '<span class="tag notable">Destacado</span>';
    case 'keystone':
      return '<span class="tag keystone">Piedra angular</span>';
  }
  return '';
}

function pathsOf(data: GuideData, order: readonly string[]): string[] {
  const counts: Map<string, number> = new Map<string, number>();
  for (const id of order) {
    const node: SkillTreeNodeDef = place(data, id);
    counts.set(node.path, (counts.get(node.path) ?? 0) + 1);
  }
  return [...counts].toSorted((a: [string, number], b: [string, number]): number => b[1] - a[1]).map(([id, count]: [string, number]): string => `${path(data, id).name} (${count})`);
}

function routeList(data: GuideData, order: readonly string[], notes: BuildNotes): string {
  let shownLevel: number = 0;
  const items: string[] = order.map((id: string, index: number): string => {
    const node: SkillTreeNodeDef = place(data, id);
    const level: number = levelForPlace(data.content, index + 1);
    const levelMark: string = level === shownLevel ? '' : `<span class="at-level">Nivel ${level}</span>`;
    shownLevel = level;
    const mark: string | undefined = notes.marks[id];
    return `<li class="${node.kind}" style="--tint:${esc(path(data, node.path).tint)}">${levelMark}<span class="step">${index + 1}</span><span class="what"><b>${esc(node.name)}</b> ${kindLabel(node)}<span class="does">${esc(node.description)}</span>${mark === undefined ? '' : `<span class="why">${mark}</span>`}</span></li>`;
  });
  return `<ol class="route">\n${items.join('\n')}\n</ol>`;
}

function treeStats(data: GuideData, order: readonly string[], level: number): StatBlock {
  return computeStats(data.content, level, emptyEquipment(), order, [], ANY_WEAPON);
}

function glance(data: GuideData, notes: BuildNotes, order: readonly string[]): string {
  const level: number = topLevel(data.spec);
  const bare: StatBlock = treeStats(data, [], level);
  const built: StatBlock = treeStats(data, order, level);
  const keystones: string[] = order.map((id: string): SkillTreeNodeDef => place(data, id)).filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string => esc(node.name));
  const rows: readonly (readonly [string, string])[] = [
    ['Rutas', esc(list(pathsOf(data, order)))],
    ['Habilidad principal', esc(mainSkillName(data, notes))],
    ['Piedras angulares', keystones.length === 0 ? 'Ninguna' : list(keystones)],
    [`Vida en el nivel ${level}`, `${Math.round(built.maxLife)} <span class="vs">(${Math.round(bare.maxLife)} sin nodos asignados)</span>`],
    ['Armadura del árbol', `${Math.round(built.armour)}`],
    ['Golpe crítico', `${percent(built.critChance)} de probabilidad, ×${decimal(built.critMultiplier, 2)} de daño`],
    ['Daño del árbol', signedPercent(built.damagePercent)],
    ['Velocidad de ataque', `×${decimal(built.attackSpeed, 2)}`],
  ];
  return `<dl class="glance">${rows.map(([term, value]: readonly [string, string]): string => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>
<p class="small">La vida, la armadura y las demás estadísticas son las que otorgan los nodos de la ruta a un personaje de nivel ${level} sin equipo. El equipo aumenta todas ellas.</p>`;
}

function capitalised(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function withArticle(name: string): string {
  return name.startsWith('The ') ? name : `el objeto ${name}`;
}

export function whereLikely(places: LegendaryPlaces): string {
  const leaning: DropLean[] = [...places.family, ...places.weapon];
  const boss: string[] = places.boss.filter((lean: DropLean): boolean => !leaning.includes(lean)).map((lean: DropLean): string => lean.name);
  if (leaning.length === 0) return capitalised(boss.length === 0 ? 'igual en cualquier lugar' : `en cualquier lugar por igual, y con más frecuencia en ${list(boss)}`);
  return capitalised(list([...leaning.map((lean: DropLean): string => lean.name), ...boss]));
}

function legendaryRow(data: GuideData, entry: LegendaryNote): string[] {
  const base: ItemBaseDef = legendary(data.content, entry.item);
  return [`<b>${esc(base.name)}</b>`, base.slot === null ? '' : esc(capitalised(SLOT_NAMES[base.slot])), esc(base.power?.text ?? ''), esc(entry.changes), esc(whereLikely(placesFor(data.content, base)))];
}

function legendariesSection(data: GuideData, notes: BuildNotes): string {
  const rarity: RarityDef | undefined = data.content.rarities.find((entry: RarityDef): boolean => entry.powers);
  const share: number = legendaryShare(data.content, null, null);
  const first: LegendaryNote | undefined = notes.legendaries[0];
  const firstName: string = first === undefined ? '' : esc(legendary(data.content, first.item).name);
  return section(
    'legendaries',
    'Legendarios',
    [
      para(
        `Aproximadamente uno de cada ${Math.round(1 / share)} objetos que caen es legendario, y puedes llevar ${rarity?.wornLimit ?? 0} a la vez. Estos son los que mejor van con esta configuración. Cada uno es útil por sí solo, y juntos cambian la forma de jugarla.`,
        'En cada zona puede caer cualquier objeto legendario. La última columna indica dónde es más probable encontrar cada uno: en esas zonas suelen caer con más frecuencia los objetos de ese tipo.',
      ),
      table({ head: ['Objeto', 'Ranura', 'Poder', 'Qué cambia', 'Dónde es más probable'], rows: notes.legendaries.map((entry: LegendaryNote): string[] => legendaryRow(data, entry)), className: 'wide' }),
      first === undefined ? '' : para(`Prioriza conseguir ${withArticle(firstName)}. ${notes.chase}`),
    ].join('\n'),
  );
}

export function namedMeasures(data: GuideData): NamedMeasure[] {
  return data.spec.builds.map((build): NamedMeasure => ({ id: build.id, name: buildName(build.id).name, href: buildHref(build.id), measure: buildMeasure(data, build.id) }));
}

export function comparison(data: GuideData, current: string): string {
  const entries: NamedMeasure[] = namedMeasures(data);
  const level: number = data.spec.levels[BUILD_PAGE.levelIndex] ?? topLevel(data.spec);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? topLevel(data.spec);
  return [
    `<div class="charts">`,
    barChart(entries, { title: `Tiempo para llegar al nivel ${level}`, hint: 'menos tiempo es más rápido', value: (measure): number | null => levelMinutes(measure.steady, level), show: (value: number): string => `${Math.round(value)} min`, lowerIsBetter: true }, current),
    barChart(entries, { title: `Jefe en el nivel ${bossLevel}`, hint: 'segundos para vencerlo; cuanto menos, mejor', value: (measure): number | null => bossAt(measure.steady, bossLevel)?.seconds ?? null, show: (value: number): string => `${Math.round(value)} s`, lowerIsBetter: true }, current),
    barChart(entries, { title: `Jefe en el nivel ${bossLevel}, jugando sin cuidado`, hint: 'porcentaje de peleas ganadas', value: (measure): number | null => bossAt(measure.careless, bossLevel)?.winShare ?? null, show: (value: number): string => percent(value), lowerIsBetter: false }, current),
    barChart(entries, { title: 'Muertes por hora, jugando sin cuidado', hint: 'menos es más seguro', value: (measure): number | null => measure.careless.deathsPerHour, show: (value: number): string => decimal(value, 1), lowerIsBetter: true }, current),
    `</div>`,
  ].join('\n');
}

function drinks(policy: SkillPolicy): string {
  return policy.flaskAt === null ? 'nunca usa un frasco' : `usa un frasco de vida al ${percent(policy.flaskAt)} de vida`;
}

function habits(policy: SkillPolicy): string {
  const dodge: string = policy.habits.dodges ? 'esquiva los ataques que alcanza a ver venir' : 'nunca esquiva nada';
  return `${dodge}, ${drinks(policy)} y ${policy.rolls ? 'rueda para apartarse del peligro' : 'nunca rueda'}`;
}

export function measuredMethod(data: GuideData): string {
  return para(
    `Estas cifras se obtienen con las reglas del propio juego: un jugador simulado juega ${data.measured.runs} veces cada configuración con un personaje nuevo. El jugador constante ${habits(namedSkill(data.policies, data.spec.skill))}. El jugador despreocupado ${habits(namedSkill(data.policies, data.spec.careless))}. Ambos siguen la ruta de esta página y usan el equipo que más aumenta su daño y resistencia.`,
    'El jugador simulado va directo al siguiente combate y nunca se detiene a leer un objeto, así que una persona tarda más en alcanzar cada nivel. Compara las configuraciones entre sí, no con tu propio tiempo.',
    measuredNow(data) ? `Se midieron con el estado actual del juego, equilibrio ${data.balance}.` : `Se midieron con el equilibrio ${data.measured.fingerprint}. El equilibrio actual del juego es ${data.balance}.`,
  );
}

export function staleNotice(data: GuideData): string {
  return measuredNow(data) ? '' : note(`El equilibrio del juego ha cambiado desde que se midieron estas cifras, así que muestran cómo era el juego, no cómo es ahora. Se vuelven a medir cuando los cambios se estabilizan.`);
}

function deaths(perHour: number): string {
  return perHour === 0 ? 'nunca murió' : `murió ${decimal(perHour, 1)} veces por hora`;
}

export function summaryLine(data: GuideData, id: string): string {
  const measure = buildMeasure(data, id);
  const top: number = topLevel(data.spec);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top;
  const reached: number | null = levelMinutes(measure.steady, top);
  const climb: string = reached === null ? `llegó al nivel ${top} solo en algunas partidas` : `llegó al nivel ${top} en aproximadamente ${minutes(reached)} de juego`;
  const won: string = percent(bossAt(measure.careless, bossLevel)?.winShare ?? 0);
  return `Jugando de forma constante, esta configuración ${climb} y ${deaths(measure.steady.deathsPerHour)}. Jugando sin cuidado ${deaths(measure.careless.deathsPerHour)} y ganó ${won} de sus combates contra el jefe de nivel ${bossLevel}.`;
}

export function mainSkillName(data: GuideData, notes: BuildNotes): string {
  return notes.mainSkill ?? focusSkill(data, notes.id).name;
}

export function buildPage(data: GuideData, notes: BuildNotes): string {
  const order: readonly string[] = route(data, notes.id);
  const top: number = topLevel(data.spec);
  return [
    section('glance', 'De un vistazo', glance(data, notes, order)),
    signatureSection(data, notes.id),
    section('plays', 'Cómo juega', para(...notes.plays)),
    section(
      'route',
      'La ruta',
      [
        para(`Asigna los nodos en este orden. Obtienes dos puntos por cada nivel después del primero, y los dos primeros llegan pronto en El Salón del Tiempo, así que la lista indica el nivel en el que puedes asignar cada nodo. La ruta llega hasta el nivel ${top}, donde El Salón del Tiempo deja de aumentar la dificultad.`),
        `<figure class="tree">${treePicture(data.content, order, `Ruta de ${notes.name} en el árbol de habilidades`)}<figcaption>Los nodos rellenos están en la ruta. Los números indican los nodos notables y las piedras angulares en el orden en que los alcanzas.</figcaption></figure>`,
        routeList(data, order, notes),
        para(notes.afterRoute),
      ].join('\n'),
    ),
    section('lean', `Apóyate en ${esc(mainSkillName(data, notes))}`, para(...notes.lean)),
    legendariesSection(data, notes),
    section('gear', 'Equipo', `<div class="two"><div><h3>Busca</h3>${bullets(notes.lookFor)}</div><div><h3>Evita</h3>${bullets(notes.avoid)}</div></div>`),
    section('strengths', 'Fortalezas y puntos débiles', `<div class="two"><div><h3>Fuerte en</h3>${bullets(notes.strengths)}</div><div><h3>Débil en</h3>${bullets(notes.weakSpots)}</div></div>`),
    notes.thin.length === 0 ? '' : section('thin', 'Escasean por ahora', para(...notes.thin)),
    section(
      'numbers',
      'Mediciones',
      [
        para(summaryLine(data, notes.id)),
        comparison(data, notes.id),
        measuredTable(namedMeasures(data), data.spec.levels, data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top),
        measuredMethod(data),
      ].join('\n'),
    ),
  ].join('\n');
}
