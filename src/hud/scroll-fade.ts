import type { EdgeFade } from './auction-layout.ts';
import { edgeFade } from './auction-layout.ts';
import { setClass } from './dom.ts';

export interface ScrollFade {
  update(): void;
}

export function watchScrollFade(scroller: HTMLElement): ScrollFade {
  scroller.classList.add('hud-scroll');
  const update = (): void => {
    const fade: EdgeFade = edgeFade(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight);
    setClass(scroller, 'fade-top', fade.top);
    setClass(scroller, 'fade-bottom', fade.bottom);
    setClass(scroller, 'scrolls', fade.top || fade.bottom);
  };
  scroller.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(scroller);
  return { update };
}
