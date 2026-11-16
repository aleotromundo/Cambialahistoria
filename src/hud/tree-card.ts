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
  | { readonly type: 'pin'; readonly node: string };

export const CLOSED_CARD: CardState = { open: false, hovered: null, pinned: null };

const OPEN_CARD: CardState = { ...CLOSED_CARD, open: true };

function point(state: CardState, node: string | null): CardState {
  if (node === null) return { ...state, hovered: null };
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
    case 'pin':
      return state.open ? { ...state, hovered: null, pinned: event.node } : state;
  }
  return state;
}

export function cardNode(state: CardState): string | null {
  return state.open ? (state.hovered ?? state.pinned) : null;
}
