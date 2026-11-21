import type { DuelLivesView } from '../watch/duel-lives-view.ts';
import { createDuelLivesView } from '../watch/duel-lives-view.ts';
import playCss from './rival-play.css?inline';

export function openRivalLives(hud: HTMLElement): DuelLivesView {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = playCss;
  document.head.append(style);
  return createDuelLivesView(hud, { hideHud: false });
}
