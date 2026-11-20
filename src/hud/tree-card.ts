export interface CardState {
  readonly open: boolean;
  readonly hovered: string | null;
  readonly pinned: string | null;
}

export type CardEvent =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'clear' }
  | { readonly type: 'point'; readonly node: string | null }
  | { readonly type: 'settle'; readonly node: string | null }
  | { readonly type: 'pin'; readonly node: string };

export const CLOSED_CARD: CardState = { open: false, hovered: null, pinned: null };

const OPEN_CARD: CardState = { ...CLOSED_CARD, open: true };

function point(state: CardState, node: string | null): CardState {
  if (node === null) return { ...state, hovered: null, pinned: null };
  return { ...state, hovered: node, pinned: node === state.pinned ? state.pinned : null };
}

export function stepCard(state: CardState, event: CardEvent): CardState {
  switch (event.type) {
    case 'open':
      return OPEN_CARD;
    case 'close':
      return CLOSED_CARD;
    case 'clear':
      return state.open ? OPEN_CARD : CLOSED_CARD;
    case 'point':
      return state.open ? point(state, event.node) : state;
    case 'settle':
      return state.open && event.node !== null ? point(state, event.node) : { ...state, hovered: null };
    case 'pin':
      return state.open ? { ...state, hovered: null, pinned: event.node } : state;
  }
  return state;
}

export function cardNode(state: CardState): string | null {
  return state.open ? (state.hovered ?? state.pinned) : null;
}

export const CARD_PRESENCE = {
  stillMs: 280,
  fadeMs: 120,
} as const;

export interface CardPresence {
  readonly node: string | null;
  readonly visible: boolean;
}

export interface CardWish {
  readonly now: number;
  readonly open: boolean;
  readonly wanted: string | null;
  readonly movedAt: number;
}

export const HIDDEN_PRESENCE: CardPresence = { node: null, visible: false };

export function viewIsMoving(now: number, movedAt: number): boolean {
  return now - movedAt < CARD_PRESENCE.stillMs;
}

export function stepPresence(state: CardPresence, wish: CardWish): CardPresence {
  if (!wish.open) return HIDDEN_PRESENCE;
  const moving: boolean = viewIsMoving(wish.now, wish.movedAt);
  if (wish.wanted !== null) {
    if (moving) return { node: state.node ?? wish.wanted, visible: false };
    return { node: wish.wanted, visible: true };
  }
  return { node: state.node, visible: false };
}

export function glidesFrom(before: CardPresence, hiddenAt: number, now: number, movedAt: number): boolean {
  if (viewIsMoving(now, movedAt)) return false;
  return before.visible || now - hiddenAt < CARD_PRESENCE.fadeMs;
}
