import type { GuideData } from '../data.ts';
import { esc, link, para, section } from '../html.ts';
import type { PageBody } from '../layout.ts';
import { BUILD_NOTES } from './build-notes.ts';
import { buildCards } from './builds.ts';

export interface GuideTopic {
  readonly href: string;
  readonly name: string;
  readonly line: string;
}

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  { href: '/guide/start/', name: 'Primeros pasos', line: 'Las teclas, los primeros diez minutos, los frascos, El Refugio, el comerciante y la casa de subastas.' },
  { href: '/guide/combat/', name: 'Cómo funciona el combate', line: 'Daño, golpes críticos, armadura, resistencias, aturdimiento, experiencia, grupos de enemigos y el primer jefe.' },
  { href: '/guide/skills/', name: 'Habilidades', line: 'Cada habilidad: qué hace, cuánto cuesta, cómo se consigue y qué la modifica.' },
  { href: '/guide/tree/', name: 'árbol de habilidades', line: 'Puntos, las cinco rutas, las piedras angulares y cuánto cuesta cambiar de opinión.' },
  { href: '/guide/items/', name: 'Objetos', line: 'Espacios, rarezas, todas las líneas de atributos aleatorios, todas las armas y los objetos legendarios.' },
  { href: '/guide/builds/', name: 'Configuraciones', line: 'Cinco configuraciones con rutas y cifras medidas, lado a lado.' },
];

function topicCard(topic: GuideTopic): string {
  return `<li><a href="${esc(topic.href)}"><span class="card-name">${esc(topic.name)}</span><span class="card-line">${esc(topic.line)}</span></a></li>`;
}

export function homePage(data: GuideData): PageBody {
  return {
    kicker: 'The Lost Storm',
    title: 'Guía del jugador',
    lede: 'Todo lo que el juego no se detiene a explicar y cinco formas de configurar un personaje, medidas dentro del propio juego.',
    description: 'La guía del jugador de The Lost Storm: cómo empezar, cómo funciona el combate, todas las habilidades, el árbol de habilidades, objetos y cinco configuraciones medidas.',
    body: [
      section('contents', 'En esta guía', `<ul class="cards">${GUIDE_TOPICS.map(topicCard).join('')}</ul>`),
      section('builds', 'Configuraciones', [para(`¿No sabes dónde poner tus puntos? Elige la configuración que más te guste y sigue su ruta. ${link('/guide/builds/', 'Compara las cinco')}.`), buildCards(data, BUILD_NOTES)].join('\n')),
      section('alpha', 'Acerca de esta guía', para('The Lost Storm está en alfa y cambia con frecuencia. Esta guía solo describe lo que hay en el juego hoy. Cada número, nombre, costo y ruta se consulta directamente en el juego cuando se genera el sitio; así que, cuando el juego cambia, la guía también.')),
    ].join('\n'),
  };
}
