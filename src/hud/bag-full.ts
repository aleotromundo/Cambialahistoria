import { el, label, retrigger } from './dom.ts';

export const BAG_FULL = {
  shownMs: 1900,
  rootClass: 'bag-full',
  shakeClass: 'shake',
  title: 'Inventory full',
  line: 'Make room to pick this up',
} as const;

export interface BagFull {
  readonly element: HTMLElement;
  show(): void;
}

export function createBagFull(root: HTMLElement): BagFull {
  const element: HTMLDivElement = el('div', 'bag-full-warning', root);
  element.setAttribute('role', 'status');
  label('bag-full-title', BAG_FULL.title, element);
  label('bag-full-line', BAG_FULL.line, element);
  let timer: number | null = null;
  return {
    element,
    show(): void {
      element.classList.add('on');
      root.classList.add(BAG_FULL.rootClass);
      retrigger(element, BAG_FULL.shakeClass);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout((): void => {
        element.classList.remove('on');
        root.classList.remove(BAG_FULL.rootClass);
        timer = null;
      }, BAG_FULL.shownMs);
    },
  };
}
