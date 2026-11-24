import type { FriendsList } from '../backend/api.ts';

export const PLAYER_MENU = {
  reach: 14,
  edgeGutter: 16,
  soon: 'Próximamente',
} as const;

export type FriendStanding = 'none' | 'requested' | 'incoming' | 'friends' | 'unknown';

export type EntryId = 'profile' | 'message' | 'trade' | 'friend' | 'mute' | 'block' | 'report';

export type MenuStep = 'entries' | 'confirm_block' | 'report';

export type TradeStanding = 'ready' | 'unsupported' | 'trading' | 'elsewhere' | 'away' | 'far';

export interface TradeWatch {
  readonly supported: boolean;
  readonly trading: boolean;
  readonly inHideout: boolean;
  readonly here: boolean;
  readonly distance: number | null;
}

export interface MenuFacts {
  readonly friend: FriendStanding;
  readonly friendsAvailable: boolean;
  readonly muted: boolean;
  readonly blocked: boolean;
  readonly blocksAvailable: boolean;
  readonly reportAvailable: boolean;
  readonly canMessage: boolean;
  readonly canProfile: boolean;
  readonly trade: TradeStanding;
  readonly reported: boolean;
  readonly busy: ReadonlySet<EntryId>;
}

export interface MenuEntry {
  readonly id: EntryId;
  readonly label: string;
  readonly detail: string;
  readonly enabled: boolean;
  readonly soon: boolean;
}

export type MenuAction =
  | { readonly type: 'profile' }
  | { readonly type: 'message' }
  | { readonly type: 'trade' }
  | { readonly type: 'befriend' }
  | { readonly type: 'accept' }
  | { readonly type: 'mute' }
  | { readonly type: 'unmute' }
  | { readonly type: 'ask_block' }
  | { readonly type: 'unblock' }
  | { readonly type: 'ask_report' };

export type CloseReason = 'escape' | 'outside' | 'left' | 'far' | 'offscreen' | 'zone';

export interface Watch {
  readonly here: boolean;
  readonly inHideout: boolean;
  readonly distance: number | null;
  readonly anchor: MenuAnchor | null;
  readonly view: { readonly width: number; readonly height: number };
}

export interface MenuAnchor {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export function friendStanding(list: FriendsList | null, name: string): FriendStanding {
  if (list === null) return 'unknown';
  const key: string = name.toLowerCase();
  const same = (other: string): boolean => other.toLowerCase() === key;
  if (list.friends.some((entry): boolean => same(entry.name))) return 'friends';
  if (list.incoming.some(same)) return 'incoming';
  if (list.outgoing.some(same)) return 'requested';
  return 'none';
}

function friendEntry(facts: MenuFacts): MenuEntry {
  const busy: boolean = facts.busy.has('friend');
  const open: boolean = facts.friendsAvailable && !facts.blocked && !busy;
  switch (facts.friend) {
    case 'friends':
      return { id: 'friend', label: 'Amigos', detail: 'Son amigos', enabled: false, soon: false };
    case 'requested':
      return { id: 'friend', label: 'Solicitud enviada', detail: 'Esperando su respuesta', enabled: false, soon: false };
    case 'incoming':
      return { id: 'friend', label: 'Aceptar solicitud', detail: 'Quiere agregarte como amigo', enabled: open, soon: false };
    case 'none':
    case 'unknown':
      return { id: 'friend', label: 'Agregar amigo', detail: facts.blocked ? 'Primero desbloquea a este jugador.' : 'Enviar una solicitud de amistad', enabled: open && facts.friend === 'none', soon: false };
  }
  return { id: 'friend', label: 'Agregar amigo', detail: 'Enviar solicitud de amistad', enabled: false, soon: false };
}

export function tradeStanding(watch: TradeWatch): TradeStanding {
  if (!watch.supported) return 'unsupported';
  if (watch.trading) return 'trading';
  if (!watch.inHideout) return 'elsewhere';
  if (!watch.here) return 'away';
  if (watch.distance === null || watch.distance > PLAYER_MENU.reach) return 'far';
  return 'ready';
}

function tradeDetail(facts: MenuFacts): string {
  if (facts.trade !== 'unsupported' && facts.blocked) return 'Primero desbloquea a este jugador.';
  switch (facts.trade) {
    case 'ready':
      return 'Ofrecer objetos y oro';
    case 'unsupported':
      return PLAYER_MENU.soon;
    case 'trading':
      return 'Primero termina el intercambio actual.';
    case 'elsewhere':
      return 'Solo en El Refugio';
    case 'away':
      return 'No está en El Refugio';
    case 'far':
      return 'Acércate a este jugador.';
  }
  return PLAYER_MENU.soon;
}

function tradeEntry(facts: MenuFacts): MenuEntry {
  return { id: 'trade', label: 'Comercio', detail: tradeDetail(facts), enabled: facts.trade === 'ready' && !facts.blocked && !facts.busy.has('trade'), soon: facts.trade === 'unsupported' };
}

export function menuEntries(facts: MenuFacts): readonly MenuEntry[] {
  const busy = (id: EntryId): boolean => facts.busy.has(id);
  return [
    { id: 'profile', label: 'Perfil', detail: facts.canProfile ? 'Qué equipo lleva y hasta dónde ha llegado' : PLAYER_MENU.soon, enabled: facts.canProfile, soon: !facts.canProfile },
    { id: 'message', label: 'Mensaje', detail: facts.canMessage ? 'Escribirle en privado' : PLAYER_MENU.soon, enabled: facts.canMessage && !facts.blocked, soon: !facts.canMessage },
    tradeEntry(facts),
    friendEntry(facts),
    { id: 'mute', label: facts.muted ? 'Dejar de silenciar' : 'Silenciar', detail: facts.muted ? 'Volver a mostrar su chat' : 'Ocultar su chat', enabled: true, soon: false },
    { id: 'block', label: facts.blocked ? 'Desbloquear' : 'Bloquear', detail: facts.blocked ? 'Volver a aceptar sus solicitudes' : 'Ocultarlo y rechazar sus solicitudes', enabled: facts.blocksAvailable && !busy('block'), soon: false },
    { id: 'report', label: facts.reported ? 'Reportado' : 'Reportar', detail: facts.reported ? 'Gracias' : 'Cuéntanos sobre este jugador', enabled: facts.reportAvailable && !facts.reported && !busy('report'), soon: false },
  ];
}

export function actionOf(entry: MenuEntry, facts: MenuFacts): MenuAction | null {
  if (!entry.enabled) return null;
  switch (entry.id) {
    case 'profile':
      return { type: 'profile' };
    case 'message':
      return { type: 'message' };
    case 'trade':
      return { type: 'trade' };
    case 'friend':
      return facts.friend === 'incoming' ? { type: 'accept' } : facts.friend === 'none' ? { type: 'befriend' } : null;
    case 'mute':
      return facts.muted ? { type: 'unmute' } : { type: 'mute' };
    case 'block':
      return facts.blocked ? { type: 'unblock' } : { type: 'ask_block' };
    case 'report':
      return { type: 'ask_report' };
  }
  return null;
}

export function cycle(count: number, from: number, step: 1 | -1): number {
  if (count <= 0) return -1;
  if (from < 0) return step === 1 ? 0 : count - 1;
  return (((from + step) % count) + count) % count;
}

export function closeReason(watch: Watch): CloseReason | null {
  if (!watch.inHideout) return 'zone';
  if (!watch.here) return 'left';
  if (watch.distance !== null && watch.distance > PLAYER_MENU.reach) return 'far';
  const anchor = watch.anchor;
  if (anchor === null || anchor.x < 0 || anchor.bottom < 0 || anchor.x > watch.view.width || anchor.top > watch.view.height) return 'offscreen';
  return null;
}

export interface Placed {
  readonly left: number;
  readonly top: number;
  readonly below: boolean;
}

export function placeMenu(anchor: MenuAnchor, size: { readonly width: number; readonly height: number }, view: { readonly width: number; readonly height: number }, gap: number): Placed {
  const gutter: number = PLAYER_MENU.edgeGutter;
  const left: number = Math.min(Math.max(gutter, anchor.x - size.width / 2), Math.max(gutter, view.width - gutter - size.width));
  const above: number = anchor.top - gap - size.height;
  const roomBelow: number = view.height - gutter - (anchor.bottom + gap);
  const below: boolean = above < gutter && roomBelow >= size.height;
  const top: number = below ? anchor.bottom + gap : Math.max(gutter, Math.min(above, view.height - gutter - size.height));
  return { left, top, below };
}
