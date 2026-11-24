import { el, label } from './dom.ts';
import { TREE_NODES } from './tree-nodes.ts';

export interface TreeHead {
  readonly points: HTMLDivElement;
  readonly pointCount: HTMLSpanElement;
  readonly pointWord: HTMLSpanElement;
  readonly search: HTMLInputElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomIn: HTMLButtonElement;
  readonly recentre: HTMLButtonElement;
  readonly restart: HTMLButtonElement;
}

export function createTreeHead(element: HTMLDivElement, title: string, close: () => void): TreeHead {
  element.style.setProperty('--socket', `${TREE_NODES.minor}px`);
  element.style.setProperty('--notable', `${TREE_NODES.notable}px`);
  element.style.setProperty('--keystone', `${TREE_NODES.keystone}px`);
  element.style.setProperty('--ability', `${TREE_NODES.ability}px`);
  element.style.setProperty('--ability-rim', `${TREE_NODES.abilityRim}px`);
  element.style.setProperty('--variant-rim', `${TREE_NODES.variantRim}px`);
  const head: HTMLDivElement = el('div', 'tree-head', element);
  label('tree-title', title, head);
  const points: HTMLDivElement = el('div', 'tree-points', head);
  const pointCount: HTMLSpanElement = el('span', 'tree-points-count', points);
  const pointWord: HTMLSpanElement = el('span', 'tree-points-word', points);
  const search: HTMLInputElement = el('input', 'chart-search', head);
  search.type = 'search';
  search.placeholder = 'Buscar un lugar';
  search.setAttribute('aria-label', 'Buscar un lugar en el Árbol de habilidades');
  const zoomOut: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomOut.type = 'button';
  zoomOut.textContent = '−';
  zoomOut.setAttribute('aria-label', 'Alejar');
  const zoomIn: HTMLButtonElement = el('button', 'chart-zoom', head);
  zoomIn.type = 'button';
  zoomIn.textContent = '+';
  zoomIn.setAttribute('aria-label', 'Acercar');
  const recentre: HTMLButtonElement = el('button', 'chart-zoom chart-centre', head);
  recentre.type = 'button';
  recentre.textContent = 'Centrar';
  recentre.setAttribute('aria-label', 'Centrar el árbol de habilidades en tu ubicación');
  const restart: HTMLButtonElement = el('button', 'chart-restart', head);
  restart.type = 'button';
  const shut: HTMLButtonElement = el('button', 'chart-close', head);
  shut.type = 'button';
  shut.textContent = '×';
  shut.setAttribute('aria-label', 'Cerrar el árbol de habilidades');
  shut.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    close();
  });
  return { points, pointCount, pointWord, search, zoomOut, zoomIn, recentre, restart };
}
