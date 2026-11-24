import type { DuelLivesView } from '../watch/duel-lives-view.ts';
import { createDuelLivesView } from '../watch/duel-lives-view.ts';
import type { ScreenBox } from '../watch/duel-frame.ts';
import type { HudCovers, ScreenSize } from './hud-covers.ts';
import { createHudCovers } from './hud-covers.ts';
import type { RivalHud } from './rival-play.ts';
import playCss from './rival-play.css?inline';
import resignCss from './rival-resign.css?inline';

export const RIVAL_HUD = {
  shownClass: 'on',
  label: 'Rendirse',
  touchLayerClass: 'tc',
  labelLayer: '#overlays',
} as const;

function groundAt(canvas: HTMLElement, x: number, y: number): boolean {
  const hit: Element | null = document.elementFromPoint(x, y);
  return hit === canvas || (hit !== null && (hit.classList.contains(RIVAL_HUD.touchLayerClass) || hit.closest(RIVAL_HUD.labelLayer) !== null));
}

export function openRivalLives(hud: HTMLElement): DuelLivesView {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = playCss;
  document.head.append(style);
  return createDuelLivesView(hud, { hideHud: false });
}

export function openRivalHud(panel: HTMLElement, canvas: HTMLElement, resign: () => void): RivalHud {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = resignCss;
  document.head.append(style);
  const button: HTMLButtonElement = document.createElement('button');
  button.type = 'button';
  button.className = 'rival-resign';
  button.textContent = RIVAL_HUD.label;
  button.tabIndex = -1;
  button.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    if (button.classList.contains(RIVAL_HUD.shownClass)) resign();
  });
  panel.append(button);
  const covers: HudCovers = createHudCovers({
    size: (): ScreenSize => ({ width: window.innerWidth, height: window.innerHeight }),
    clickable: (x: number, y: number): boolean => groundAt(canvas, x, y),
  });
  let shown: boolean = false;
  return {
    covers: (): readonly ScreenBox[] => covers.covers(),
    resignable: (wanted: boolean): void => {
      if (wanted === shown) return;
      shown = wanted;
      button.classList.toggle(RIVAL_HUD.shownClass, wanted);
    },
  };
}

export interface RivalViews {
  readonly openLives: () => DuelLivesView;
  readonly openHud: (resign: () => void) => RivalHud;
}

export function rivalViews(hud: HTMLElement, canvas: HTMLElement): RivalViews {
  let panel: HTMLElement = hud;
  return {
    openLives: (): DuelLivesView => {
      const opened: DuelLivesView = openRivalLives(hud);
      panel = opened.panel;
      return opened;
    },
    openHud: (resign: () => void): RivalHud => openRivalHud(panel, canvas, resign),
  };
}
