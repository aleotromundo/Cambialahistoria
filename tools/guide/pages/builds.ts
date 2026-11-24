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
    kicker: 'Guía',
    title: 'Configuraciones',
    lede: 'Cinco formas de hacer crecer a un personaje: una para cada tipo de arma y otra que se adapta a lo que tengas equipado. Cada una tiene una ruta por el árbol de habilidades y estadísticas medidas en el propio juego.',
    description: 'Cinco configuraciones para The Lost Storm: bastón, arma pesada, espada, ballesta y el eco para cualquier arma. Para quién es cada una, su ruta y estadísticas medidas de velocidad, muertes y combates contra jefes.',
    body: [
      section(
        'pick',
        'Elige una',
        [
          para(
            `Cada página explica para quién es la configuración, cómo se juega, qué lugares tomar en orden hasta el nivel ${top}, en qué habilidad apoyarte, qué equipo usar y qué evitar. El jugador simulado del propio juego probó cada una muchas veces, así que sus cifras son medidas, no estimadas.`,
            'Cada una de las primeras cuatro usa un arma, un elemento y una ruta del árbol de habilidades. La mayoría de los efectos de una ruta solo funcionan mientras tienes su arma en las manos, así que elige juntos la configuración y el arma.',
          ),
          buildCards(data, BUILD_NOTES.slice(0, BUILDS_PAGE.leading)),
          para('Y una que funciona con cualquier arma: hace que tu ataque principal golpee dos veces.'),
          buildCards(data, BUILD_NOTES.slice(BUILDS_PAGE.leading)),
        ].join('\n'),
      ),
      section(
        'numbers',
        'Comparación',
        [
          para(`Comparación de las cinco configuraciones. Toca un nombre para abrir su página. El jefe se mide en el nivel ${bossLevel}, el primero en que la mayoría se enfrenta a él.`),
          comparison(data, ''),
          measuredTable(namedMeasures(data), data.spec.levels, bossLevel),
          measuredMethod(data),
        ].join('\n'),
      ),
      section('new', '¿Nuevo en el juego?', para(`Empieza por ${link('/guide/start/', 'Primeros pasos')} y ${link('/guide/tree/', 'cómo funciona el árbol de habilidades')}. Puedes comenzar cualquiera de estas configuraciones desde el nivel 1.`)),
    ].join('\n'),
  };
}
