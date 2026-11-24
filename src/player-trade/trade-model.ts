import type { TradeClose, TradeFrame, TradeGoods, TradeItem, TradeRefusal, TradeSide } from './trade-protocol.ts';
import { TRADE_LIMITS } from './trade-protocol.ts';

export const TRADE_MODEL = {
  changeLockMs: 1200,
  msPerSecond: 1000,
  noteMs: 4500,
} as const;

export type NoteTone = 'note' | 'done' | 'refusal';

export interface TradeNote {
  readonly text: string;
  readonly tone: NoteTone;
}

export interface Incoming {
  readonly from: string;
  readonly name: string;
  readonly expiresAt: number;
}

export interface OpenTrade {
  readonly with: string;
  readonly name: string;
  readonly revision: number;
  readonly mine: TradeSide;
  readonly theirs: TradeSide;
  readonly countdownEndsAt: number | null;
  readonly changedAt: number | null;
}

export interface TradeState {
  readonly incoming: Incoming | null;
  readonly asking: string | null;
  readonly open: OpenTrade | null;
  readonly note: TradeNote | null;
}

export const NO_TRADE: TradeState = { incoming: null, asking: null, open: null, note: null };

export type TradeCard = { readonly kind: 'none' } | { readonly kind: 'incoming'; readonly incoming: Incoming } | { readonly kind: 'asking'; readonly name: string } | { readonly kind: 'note'; readonly note: TradeNote };

export function tradeCard(state: TradeState, noteAge: number): TradeCard {
  if (state.incoming !== null) return { kind: 'incoming', incoming: state.incoming };
  if (state.open !== null) return { kind: 'none' };
  if (state.asking !== null) return { kind: 'asking', name: state.asking };
  if (state.note !== null && noteAge < TRADE_MODEL.noteMs) return { kind: 'note', note: state.note };
  return { kind: 'none' };
}

export function tradeBusy(state: TradeState): boolean {
  return state.open !== null || state.asking !== null;
}

export function askingText(name: string): string {
  return `Esperando que ${name} responda.`;
}

const EMPTY_SIDE: TradeSide = { items: [], gold: 0, confirmed: false };

const REFUSAL_TEXT: Readonly<Record<TradeRefusal, string>> = {
  unsupported: 'Todavía no puede comerciar: debe recargar el juego.',
  not_here: 'Solo se puede comerciar en el Refugio.',
  no_such_player: 'Ese jugador ya se fue.',
  self: 'No puedes comerciar contigo.',
  not_accepting: 'Ese jugador no acepta intercambios tuyos.',
  busy: 'Uno de ustedes ya está comerciando.',
  too_far: 'Acércate para comerciar.',
  slow_down: 'Demasiado rápido. Espera un momento.',
  changed: 'La oferta cambió. Revísala antes de confirmar.',
  no_trade: 'El intercambio terminó.',
  no_room: 'No tienes espacio en la mochila. Haz lugar antes de confirmar.',
  no_character: 'Necesitas un personaje para comerciar.',
  too_many: `Puedes intercambiar hasta ${String(TRADE_LIMITS.items)} objetos.`,
  repeated: 'Ese objeto ya está en la oferta.',
  not_yours: 'Ese objeto ya no es tuyo para intercambiar.',
  story: 'Los objetos de misión no se pueden intercambiar.',
  not_enough_gold: 'No tienes tanto oro.',
};

const CLOSE_TEXT: Readonly<Record<TradeClose, string>> = {
  cancelled: 'Se canceló el intercambio.',
  declined: 'Rechazaron el intercambio.',
  expired: 'La solicitud de intercambio venció.',
  walked_away: 'Se alejaron demasiado. Se canceló el intercambio.',
  left: 'Se fue. Se canceló el intercambio.',
  disconnected: 'Se perdió la conexión. Se canceló el intercambio.',
  failed: 'No se pudo completar el intercambio. No se transfirió nada.',
};

export function refusalText(reason: TradeRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function closeText(reason: TradeClose): string {
  return CLOSE_TEXT[reason];
}

function sameGoods(a: TradeGoods, b: TradeGoods): boolean {
  return a.gold === b.gold && a.items.length === b.items.length && a.items.every((item: TradeItem, index: number): boolean => item.id === b.items[index]?.id);
}

function goodsLine(goods: TradeGoods): string {
  const parts: string[] = [];
  if (goods.items.length > 0) parts.push(goods.items.length === 1 ? '1 objeto' : `${String(goods.items.length)} objetos`);
  if (goods.gold > 0) parts.push(`${String(goods.gold)} de oro`);
  return parts.length === 0 ? 'nada' : parts.join(' y ');
}

export function doneText(gave: TradeGoods, got: TradeGoods): string {
  return `Intercambio completado. Entregaste ${goodsLine(gave)} y recibiste ${goodsLine(got)}.`;
}

function withSides(state: TradeState, frame: Extract<TradeFrame, { type: 'trade_state' }>, now: number): TradeState {
  if (state.open === null) return state;
  const changed: boolean = !sameGoods(state.open.theirs, frame.theirs);
  return {
    ...state,
    open: { ...state.open, revision: frame.revision, mine: frame.mine, theirs: frame.theirs, countdownEndsAt: frame.countdownEndsAt, changedAt: changed ? now : state.open.changedAt },
    note: changed ? { text: `${state.open.name} cambió su oferta. Revísala antes de confirmar.`, tone: 'note' } : state.note,
  };
}

export function tradeStep(state: TradeState, frame: TradeFrame, now: number): TradeState {
  switch (frame.type) {
    case 'trade_asked':
      return { ...state, incoming: { from: frame.from, name: frame.name, expiresAt: frame.expiresAt } };
    case 'trade_open':
      return { incoming: null, asking: null, note: null, open: { with: frame.with, name: frame.name, revision: 0, mine: EMPTY_SIDE, theirs: EMPTY_SIDE, countdownEndsAt: null, changedAt: null } };
    case 'trade_state':
      return withSides(state, frame, now);
    case 'trade_refused':
      return { ...state, asking: state.open === null ? null : state.asking, note: { text: refusalText(frame.reason), tone: 'refusal' } };
    case 'trade_closed':
      return { incoming: null, asking: null, open: null, note: { text: closeText(frame.reason), tone: 'refusal' } };
    case 'trade_done':
      return { incoming: null, asking: null, open: null, note: { text: doneText(frame.gave, frame.got), tone: 'done' } };
  }
  return state;
}

export function asked(state: TradeState, name: string): TradeState {
  return { ...state, asking: name, note: { text: `Le propusiste un intercambio a ${name}.`, tone: 'note' } };
}

export function expire(state: TradeState, now: number): TradeState {
  if (state.incoming === null || state.incoming.expiresAt > now) return state;
  return { ...state, incoming: null };
}

export function gone(state: TradeState): TradeState {
  if (state.open === null && state.incoming === null && state.asking === null) return state;
  return { incoming: null, asking: null, open: null, note: state.open === null ? null : { text: closeText('disconnected'), tone: 'refusal' } };
}

export function parseGold(text: string): number | null {
  const trimmed: string = text.trim();
  if (trimmed === '') return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const gold: number = Number(trimmed);
  return gold <= TRADE_LIMITS.gold ? gold : null;
}

export type ConfirmBlock = 'none' | 'confirmed' | 'changed' | 'no_room' | 'empty';

export function confirmBlock(open: OpenTrade, freeSlots: number, now: number): ConfirmBlock {
  if (open.mine.confirmed) return 'confirmed';
  if (open.changedAt !== null && now - open.changedAt < TRADE_MODEL.changeLockMs) return 'changed';
  if (open.mine.items.length === 0 && open.mine.gold === 0 && open.theirs.items.length === 0 && open.theirs.gold === 0) return 'empty';
  if (freeSlots + open.mine.items.length < open.theirs.items.length) return 'no_room';
  return 'none';
}

function roomText(short: number): string {
  return `Your bags are full: make room for ${short === 1 ? '1 more item' : `${String(short)} objetos más`}.`;
}

export function blockText(block: ConfirmBlock, open: OpenTrade, freeSlots: number): string | null {
  switch (block) {
    case 'none':
      return null;
    case 'confirmed':
      return open.theirs.confirmed ? 'Ambos confirmaron.' : `Esperando que ${open.name} confirme.`;
    case 'changed':
      return 'La oferta acaba de cambiar.';
    case 'empty':
      return 'Agrega objetos u oro para intercambiar.';
    case 'no_room':
      return roomText(open.theirs.items.length - open.mine.items.length - freeSlots);
  }  return null;
}

export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / TRADE_MODEL.msPerSecond));
}
