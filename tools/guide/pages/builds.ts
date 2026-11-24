import type { GuideData } from '../data.ts';
import { esc, link, para, section } from '../html.ts';
import type { PageBody } from '../layout.ts';
import type { BuildNotes } from './build-page.ts';
import { buildHref, BUILD_PAGE, comparison, mainSkillName, measuredMethod, namedMeasures } from './build-page.ts';
import { BUILD_NOTES } from './build-notes.ts';
import { measuredTable } from './measured-view.ts';

export const BUILDS_PAGE = {
  leading: 4,
} as const;

export function buildCard(data: GuideData, notes: BuildNotes): string {
  return `<li><a href="${esc(buildHref(notes.id))}"><span class="card-kind">${esc(notes.kind)} · ${esc(mainSkillName(data, notes))}</span><span class="card-name">${esc(notes.name)}</span><span class="card-line">${notes.forWho}</span></a></li>`;
}

export function buildCards(data: GuideData, all: readonly BuildNotes[]): string {
  return `<ul class="cards">${all.map((notes: BuildNotes): string => buildCard(data, notes)).join('')}</ul>`;
}

export function buildsPage(data: GuideData): PageBody {
  const top: number = Math.max(...data.spec.levels);
  const bossLevel: number = data.spec.levels[BUILD_PAGE.bossLevelIndex] ?? top;
  return {
    kicker: 'Guide',
    title: 'Builds',
    lede: 'Cinco formas de hacer crecer a un personaje: una para cada tipo de arma y otra que se adapta a lo que tengas equipado. Cada una tiene una ruta por el árbol de habilidades y estadísticas medidas en el propio juego.',
    description: 'Cinco configuraciones para The Lost Storm: bastón, arma pesada, espada, ballesta y el eco para cualquier arma. Para quién es cada una, su ruta y estadísticas medidas de velocidad, muertes y combates contra jefes.',
    body: [
      section(
        'pick',
        'Elige una',
        [
          para(
            `Each build page tells you who the build is for, how it plays, the places to take in order up to level ${top}, the skill to lean on, what to wear and what to avoid. Each one has been played many times by the game's own simulated player, so the numbers on it are measured, not guessed.`,
            'Each of the first four is one weapon, one element and one path of the Skill Tree. Most of a path answers only while its weapon is in your hands, so pick the build and the weapon together.',
          ),
          buildCards(data, BUILD_NOTES.slice(0, BUILDS_PAGE.leading)),
          para('And one that works with any weapon: it makes your main attack strike twice.'),
          buildCards(data, BUILD_NOTES.slice(BUILDS_PAGE.leading)),
        ].join('\n'),
      ),
      section(
        'numbers',
        'Side by side',
        [
          para(`How the five builds compare. Tap a build name to open its page. The boss is measured at level ${bossLevel}, the first level most players meet it at.`),
          comparison(data, ''),
          measuredTable(namedMeasures(data), data.spec.levels, bossLevel),
          measuredMethod(data),
        ].join('\n'),
      ),
      section('new', 'New to the game?', para(`Start with ${link('/guide/start/', 'Getting started')} and ${link('/guide/tree/', 'how the Skill Tree works')}. Any of these builds can be started from level 1.`)),
    ].join('\n'),
  };
}
