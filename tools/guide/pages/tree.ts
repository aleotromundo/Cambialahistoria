import type { ChartPath, SkillTreeNodeDef, TreeNodeKind } from '../../../sim/content/types.ts';
import { isStartingPlace } from '../../../sim/progression.ts';
import type { GuideData } from '../data.ts';
import { pointsAtLevel, respecCost, skill } from '../data.ts';
import { esc, kbd, link, list, para, section, table } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { treePicture } from '../tree-picture.ts';

export const TREE_PAGE = {
  pointLevels: [2, 5, 8, 10, 15, 20],
  respecLevels: [5, 10, 15, 20],
} as const;

function count(data: GuideData, kind: TreeNodeKind): number {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.kind === kind).length;
}

function pathPlaces(data: GuideData, pathId: string): readonly SkillTreeNodeDef[] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === pathId);
}

function pathRow(data: GuideData, entry: ChartPath): string[] {
  const places: readonly SkillTreeNodeDef[] = pathPlaces(data, entry.id);
  const start: string = places.filter(isStartingPlace).map((node: SkillTreeNodeDef): string => node.name).join(', ');
  const keystone: string = places.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string => node.name).join(', ');
  const unlocks: string[] = places.flatMap((node: SkillTreeNodeDef): string[] => (node.unlock === null ? [] : [skill(data, node.unlock).name]));
  return [`<span style="color: ${esc(entry.tint)}">${esc(entry.name)}</span>`, esc(entry.description), esc(start), esc(list(unlocks)), esc(keystone)];
}

function keystoneRows(data: GuideData): string[][] {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.kind === 'keystone').map((node: SkillTreeNodeDef): string[] => [esc(node.name), esc(node.description)]);
}

function sharedChanges(data: GuideData): string[] {
  const bySkill: Map<string, string[]> = new Map<string, string[]>();
  for (const node of data.content.skillTree) {
    for (const variant of node.variants) {
      const names: string[] = bySkill.get(variant.skill) ?? [];
      names.push(node.name);
      bySkill.set(variant.skill, names);
    }
  }
  return [...bySkill.entries()].filter(([, names]: [string, string[]]): boolean => names.length > 1).map(([skillId, names]: [string, string[]]): string => `<b>${esc(skill(data, skillId).name)}</b>: ${esc(list(names))}`);
}

function variantCount(data: GuideData): number {
  return data.content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.variants.length > 0).length;
}

export function treePage(data: GuideData): PageBody {
  const per: number = data.content.chart.pointsPerLevel;
  const grants: number = data.content.chart.grants.reduce((sum: number, grant): number => sum + grant.points, 0);
  const respec = data.content.chart.respec;
  const minors: number = count(data, 'minor');
  const notables: number = count(data, 'notable');
  const keystones: number = count(data, 'keystone');
  return {
    kicker: 'Guía',
    title: 'Árbol de habilidades',
    lede: 'A dónde van tus puntos, cómo encajan los cinco caminos y cuánto cuesta cambiar de opinión.',
    description: 'Cómo funciona el árbol de habilidades de The Lost Storm: puntos por nivel, los cinco caminos, los nodos notables y las piedras angulares, la única regla para cambiar una habilidad y cuánto cuesta redistribuir los puntos.',
    body: [
      section(
        'whole',
        'Todo el árbol',
        [
          `<figure class="tree">${treePicture(data.content, [], 'El árbol de habilidades completo')}<figcaption>Cada lugar del árbol. Los círculos grandes son nodos notables; los más grandes son piedras angulares.</figcaption></figure>`,
          para(`Presiona ${kbd('T')} para abrirlo en el juego. Tiene ${minors + notables + keystones} lugares: ${minors} pequeños que aportan un poco, ${notables} notables que enseñan o modifican una habilidad y ${keystones} piedras angulares que cambian tu forma de jugar, siempre con algún costo.`),
        ].join('\n'),
      ),
      section(
        'points',
        'Puntos',
        [
          para(`Recibes ${per} puntos con cada nivel. Obtienes ${grants} más al principio, al superar tu primer momento y recibir la primera lección del Guardián. Gastar un punto equivale a elegir un lugar; no hay nada más en qué gastarlos, así que úsalos conforme los recibas.`),
          table({ head: ['Nivel', 'Puntos acumulados'], rows: TREE_PAGE.pointLevels.map((level: number): string[] => [String(level), String(pointsAtLevel(data.content, level))]) }),
        ].join('\n'),
      ),
      section(
        'paths',
        'Las cinco rutas',
        [
          para('El árbol tiene cinco rutas alrededor de un centro. Cada ruta empieza con un nodo notable que enseña una habilidad; puedes comenzar por cualquiera. Después, solo puedes elegir lugares junto a los que ya tienes, así que una configuración avanza hacia afuera y a veces se ramifica hacia la siguiente ruta.'),
          table({ head: ['Ruta', 'Para qué sirve', 'Habilidad inicial', 'Habilidades que enseña', 'Piedra angular'], rows: data.content.chart.paths.map((entry: ChartPath): string[] => pathRow(data, entry)), className: 'wide' }),
          para('Entre las rutas vecinas hay pequeños lugares de conexión que permiten pasar de una a otra.'),
        ].join('\n'),
      ),
      section(
        'keystones',
        'Piedras angulares',
        [para('Una piedra angular está al final de su ruta. Cada una te da mucho, pero también te quita algo. Lee el costo antes de elegirla.'), table({ head: ['Piedra angular', 'Efecto'], rows: keystoneRows(data) })].join('\n'),
      ),
      section(
        'one-change',
        'Un cambio por habilidad',
        [
          para(`${variantCount(data)} notables convierten una habilidad en otra cosa. Cada habilidad solo puede ser modificada por uno de estos lugares a la vez: cuando eliges uno, los demás que modifican esa misma habilidad quedan bloqueados hasta que lo devuelvas. Estos lugares comparten una habilidad:`),
          `<ul>${sharedChanges(data).map((line: string): string => `<li>${line}</li>`).join('')}</ul>`,
          para(`Cada cambio aparece junto con su habilidad en la página de ${link('/guide/skills/', 'habilidades')}.`),
        ].join('\n'),
      ),
      section(
        'respec',
        'Cambiar de opinión',
        [
          para(`Puedes devolver un solo lugar, siempre que los demás sigan conectados, o reiniciar todo el árbol de una vez. En ambos casos cuesta oro: ${respec.goldPerPoint} por punto, más ${respec.goldPerLevel} por cada punto y por cada nivel que tengas. Recuperas los puntos para volver a gastarlos.`),
          table({
            head: ['Nivel', 'Un lugar', 'Todo el árbol'],
            rows: TREE_PAGE.respecLevels.map((level: number): string[] => [String(level), `${respecCost(data, level, 1)} de oro`, `${respecCost(data, level, pointsAtLevel(data.content, level))} de oro`]),
          }),
        ].join('\n'),
      ),
    ].join('\n'),
  };
}
