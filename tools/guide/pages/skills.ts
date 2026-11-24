import type { ChartGroup, ItemBaseDef, SkillDef, SkillMod, SkillTreeNodeDef, SkillVariant } from '../../../sim/content/types.ts';
import type { SkillUnlock } from '../../../sim/content/shape-types.ts';
import type { GuideData } from '../data.ts';
import { path, playerSkills, skill, unlockPlace } from '../data.ts';
import { decimal, esc, link, list, para, section, table } from '../html.ts';
import type { PageBody } from '../layout.ts';

export interface SkillChange {
  readonly source: string;
  readonly becomes: SkillDef;
}

export function mergedChanges(changes: readonly SkillChange[]): SkillChange[] {
  const merged: Map<string, string[]> = new Map<string, string[]>();
  const skills: Map<string, SkillDef> = new Map<string, SkillDef>();
  for (const change of changes) {
    merged.set(change.becomes.id, [...(merged.get(change.becomes.id) ?? []), change.source]);
    skills.set(change.becomes.id, change.becomes);
  }
  return [...merged.entries()].flatMap(([id, sources]: [string, string[]]): SkillChange[] => {
    const becomes: SkillDef | undefined = skills.get(id);
    return becomes === undefined ? [] : [{ source: list(sources), becomes }];
  });
}

function cost(entry: SkillDef): string {
  return entry.manaCost === 0 ? 'None' : `${decimal(entry.manaCost, 1)} mana`;
}

function wait(entry: SkillDef): string {
  return entry.cooldown === 0 ? 'None' : `${decimal(entry.cooldown, 2)} s`;
}

export function groupsOf(data: GuideData, skillId: string): ChartGroup[] {
  return data.content.chart.groups.filter((group: ChartGroup): boolean => group.skills.includes(skillId));
}

export function howToGet(data: GuideData, entry: SkillDef): string {
  const place: SkillTreeNodeDef | null = unlockPlace(data, entry.id);
  if (place !== null) return `Take ${esc(place.name)} on ${esc(path(data, place.path).name)}`;
  const book: SkillUnlock | undefined = data.content.player.skillBook.find((own: SkillUnlock): boolean => own.skill === entry.id);
  if (book !== undefined) return book.when.length === 0 ? 'Empiezas con esta habilidad' : 'Se aprende en El Salón del Tiempo';
  const weapon: ItemBaseDef | undefined = variantSources(data, entry.id)[0];
  return weapon === undefined ? 'Todavía no está en el juego' : 'Sostén una ballesta';
}

function variantSources(data: GuideData, becomes: string): ItemBaseDef[] {
  return [...data.content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.variants.some((variant: SkillVariant): boolean => variant.becomes === becomes));
}

export function placeChanges(data: GuideData, skillId: string): SkillChange[] {
  return data.content.skillTree.flatMap((node: SkillTreeNodeDef): SkillChange[] =>
    node.variants.filter((variant: SkillVariant): boolean => variant.skill === skillId).map((variant: SkillVariant): SkillChange => ({ source: `${node.name} (${path(data, node.path).name})`, becomes: skill(data, variant.becomes) })),
  );
}

export function itemChanges(data: GuideData, skillId: string): SkillChange[] {
  return [...data.content.itemBases.values()].flatMap((base: ItemBaseDef): SkillChange[] => {
    const own: readonly SkillVariant[] = [...base.variants, ...(base.power?.variants ?? [])];
    return own.filter((variant: SkillVariant): boolean => variant.skill === skillId).map((variant: SkillVariant): SkillChange => ({ source: base.power === null ? base.name : `${base.name}, a legendary`, becomes: skill(data, variant.becomes) }));
  });
}

function strengthenedBy(data: GuideData, skillId: string): SkillTreeNodeDef[] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.skillMods.some((mod: SkillMod): boolean => mod.target.type === 'skill' && mod.target.skill === skillId));
}

function changeLine(change: SkillChange): string {
  const costs: string = change.becomes.manaCost === 0 && change.becomes.cooldown === 0 ? '' : ` <span class="small">(${[change.becomes.manaCost === 0 ? '' : `${decimal(change.becomes.manaCost, 1)} mana`, change.becomes.cooldown === 0 ? '' : `${decimal(change.becomes.cooldown, 2)} s wait`].filter((part: string): boolean => part.length > 0).join(', ')})</span>`;
  return `<li><b>${esc(change.becomes.name)}</b>, from ${esc(change.source)}: ${esc(change.becomes.description)}${costs}</li>`;
}

function skillCard(data: GuideData, entry: SkillDef): string {
  const groups: string[] = groupsOf(data, entry.id).map((group: ChartGroup): string => group.name);
  const changes: SkillChange[] = mergedChanges([...placeChanges(data, entry.id), ...itemChanges(data, entry.id)]);
  const stronger: string[] = strengthenedBy(data, entry.id).map((node: SkillTreeNodeDef): string => node.name);
  const facts: string[] = [
    `<div><dt>Cost</dt><dd>${cost(entry)}</dd></div>`,
    `<div><dt>Wait</dt><dd>${wait(entry)}</dd></div>`,
    `<div><dt>Cómo conseguirla</dt><dd>${howToGet(data, entry)}</dd></div>`,
    `<div><dt>Cuenta como</dt><dd>${groups.length === 0 ? 'Nothing else' : esc(list(groups))}</dd></div>`,
  ];
  const changed: string = changes.length === 0 ? '' : `<p class="label">Qué puede modificarla</p><ul class="changes">${changes.map(changeLine).join('')}</ul>`;
  const helped: string = stronger.length === 0 ? '' : `<p class="label">Lugares hechos para ello</p><p>${esc(list(stronger))}</p>`;
  return `<article class="skill" id="${esc(entry.id.replace(/_/g, '-'))}">
<h3>${esc(entry.name)}</h3>
<p>${esc(entry.description)}</p>
<dl class="facts">${facts.join('')}</dl>
${changed}
${helped}
</article>`;
}

export function skillsPage(data: GuideData): PageBody {
  const skills: SkillDef[] = [...playerSkills(data), skill(data, 'quarrel')];
  return {
    kicker: 'Guide',
    title: 'Skills',
    lede: 'Todas las habilidades que puedes usar hoy: qué hacen, cuánto cuestan, cómo las consigues y qué puede modificarlas.',
    description: 'Todas las habilidades de The Lost Storm: qué hacen, cuánto cuestan de maná y su tiempo de recarga, dónde las consigues en el árbol de habilidades y todos los lugares y objetos que las modifican.',
    body: [
      section(
        'how',
        'Cómo funcionan las habilidades',
        para(
          `You start with ${esc(skill(data, 'cleave').name)} and learn ${esc(skill(data, 'dodge_roll').name)} in the Hall of Time. Every other skill is a place on the ${link('/guide/tree/', 'Skill Tree')}: take it and the skill goes on your first empty slot.`,
          'Una habilidad puede convertirse en otra cosa por un lugar del árbol o por el arma que sostienes. Solo un lugar del árbol puede modificar una habilidad a la vez. El cambio del arma se suma: sostén una ballesta y Tajo se convierte en Perno, sin importar qué más tengas.',
          '«Cuenta como» indica a qué tipos de habilidad pertenece. Un lugar que diga «daño para habilidades de relámpago» beneficia a todas las habilidades que cuentan como habilidades de relámpago.',
        ),
      ),
      section(
        'table',
        'De un vistazo',
        table({ head: ['Skill', 'Cost', 'Wait', 'Cómo conseguirla'], rows: skills.map((entry: SkillDef): string[] => [`<a href="#${esc(entry.id.replace(/_/g, '-'))}">${esc(entry.name)}</a>`, cost(entry), wait(entry), howToGet(data, entry)]) }),
      ),
      section('all', 'Todas las habilidades', skills.map((entry: SkillDef): string => skillCard(data, entry)).join('\n')),
    ].join('\n'),
  };
}
