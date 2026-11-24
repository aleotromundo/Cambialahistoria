import { ITEM_SLOTS } from '../../sim/content/types.ts';
import type { LedgerItem } from '../../sim/world/ledger.ts';
import type { ListRefusal } from '../../sim/world/purse.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { AuctionFilters, AuctionRefusal, AuctionRules, AuctionSort, MyAuction, PriceBasis, PublicSale, Sale } from '../backend/auction-api.ts';

export type AuctionTab = 'browse' | 'sell' | 'mine' | 'history';

export const AUCTION_TABS: readonly AuctionTab[] = ['browse', 'sell', 'mine', 'history'];

export const TAB_NAMES: Readonly<Record<AuctionTab, string>> = { browse: 'Explorar', sell: 'Vender', mine: 'Mis publicaciones', history: 'Historial' };

export type SalesView = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly sales: readonly PublicSale[] } | { readonly kind: 'missing' };

export const AUCTION_WATCH: { readonly everyMs: number } = {
  everyMs: 120_000,
};

export function peekDue(peekedAt: number | null, now: number, mine: MyAuction | null): boolean {
  if (peekedAt === null) return true;
  if (mine === null) return now - peekedAt >= AUCTION_WATCH.everyMs;
  return mine.listings.length > 0 && now - peekedAt >= AUCTION_WATCH.everyMs;
}

export type LineTone = 'note' | 'done' | 'refusal';

export interface AuctionLine {
  readonly text: string;
  readonly tone: LineTone;
}

export type ChoiceField = 'slot' | 'rarity' | 'sort';

export const SORTS: readonly AuctionSort[] = ['price', 'newest'];

export function choiceFilter(field: ChoiceField, value: string): Partial<AuctionFilters> {
  if (field === 'slot') return { slot: ITEM_SLOTS.find((each: string): boolean => each === value) ?? null };
  if (field === 'rarity') return { rarity: value === '' ? null : value };
  return { sort: SORTS.find((each: AuctionSort): boolean => each === value) ?? 'price' };
}

export const FIRST_PAGE: AuctionFilters = { slot: null, rarity: null, minLevel: null, maxLevel: null, maxPrice: null, sort: 'price', page: 1 };

const MS_PER_MINUTE: number = 60_000;
const MINUTES_PER_HOUR: number = 60;
const PERCENT: number = 100;

const REFUSAL_LINES: Readonly<Record<AuctionRefusal, string>> = {
  bad_request: 'El subastador no pudo completar esa acción.',
  bad_price: 'Ese precio no está permitido.',
  no_such_listing: 'Esa publicación no existe.',
  listing_gone: 'Esa publicación ya no está disponible.',
  price_changed: 'El precio cambió. Revisa la publicación otra vez.',
  own_listing: 'Esa es tu propia publicación.',
  not_enough_gold: 'No tienes suficiente oro.',
  not_listable: 'Ese objeto no se puede publicar.',
  no_character: 'La casa de subastas requiere un personaje guardado.',
  too_many_listings: 'Ya tienes abiertas todas las publicaciones que permite la casa de subastas.',
  level_too_low: 'Aún no tienes suficiente nivel para vender.',
  rate_limited: 'Espera un momento antes de volver a intentarlo.',
  unauthorized: 'Tu sesión terminó. Recarga la página para continuar.',
};

const PICK_LINES: Readonly<Record<ListRefusal, string>> = {
  empty: 'Elige un objeto de tus bolsas o alijo.',
  unverified: 'Este objeto nunca se registró, así que no se puede vender. Las compras al comerciante y algunos hallazgos tempranos o sin conexión no se registran.',
  story: 'Este objeto no se puede vender.',
  unidentified: 'No se pueden publicar objetos sin identificar. Primero identifícalo.',
};

export const RECORDING_LINE: AuctionLine = { text: 'Este objeto aún se está registrando. Inténtalo de nuevo en un momento.', tone: 'note' };

export const AUCTION_LINES: {
  readonly closed: AuctionLine;
  readonly failed: AuctionLine;
  readonly noRoom: AuctionLine;
  readonly listed: AuctionLine;
  readonly bought: AuctionLine;
  readonly cancelled: AuctionLine;
  readonly nothing: AuctionLine;
  readonly pick: AuctionLine;
} = {
  closed: { text: 'La casa de subastas está cerrada.', tone: 'refusal' },
  failed: { text: 'El subastador no respondió. No hubo cambios.', tone: 'refusal' },
  noRoom: { text: 'Haz espacio primero en tus bolsas o alijo.', tone: 'refusal' },
  listed: { text: 'Publicado.', tone: 'done' },
  bought: { text: 'Comprado.', tone: 'done' },
  cancelled: { text: 'Te devolvieron el objeto.', tone: 'done' },
  nothing: { text: 'No hay nada pendiente.', tone: 'note' },
  pick: { text: PICK_LINES.empty, tone: 'note' },
};

export function refusalLine(code: AuctionRefusal, rules: AuctionRules | null): AuctionLine {
  if (code === 'level_too_low' && rules !== null && rules.sellLevel > 0) return { text: `Necesitas nivel ${rules.sellLevel} para vender.`, tone: 'refusal' };
  if (code === 'too_many_listings' && rules !== null) return { text: `Tienes tus ${rules.maxListings} publicaciones abiertas. Cancela una o espera a que se venda algo.`, tone: 'refusal' };
  return { text: REFUSAL_LINES[code], tone: 'refusal' };
}

export function suggestionLine(basis: PriceBasis): string {
  if (basis.kind === 'default') return 'Precio sugerido: todavía no hay objetos similares';
  return basis.count === 1 ? 'Sugerido a partir de 1 objeto similar' : `Sugerido a partir de ${basis.count} objetos similares`;
}

export function listedLine(open: number, rules: AuctionRules): string {
  return `${Math.min(open, rules.maxListings)} de ${rules.maxListings} publicados`;
}

export const UNSELLABLE_HINT: string = "No se puede vender aquí: nunca se registró";

export function pickLine(reason: ListRefusal): AuctionLine {
  return { text: PICK_LINES[reason], tone: reason === 'empty' ? 'note' : 'refusal' };
}

export function priceLine(rules: AuctionRules | null): AuctionLine {
  return rules === null ? { text: 'Fija un precio en una cantidad entera de oro.', tone: 'refusal' } : { text: `Fija un precio de ${rules.minPrice} a ${rules.maxPrice} de oro.`, tone: 'refusal' };
}

export function collectedLine(gold: number, items: number): AuctionLine {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold} de oro`);
  if (items > 0) parts.push(items === 1 ? '1 objeto' : `${items} objetos`);
  return parts.length === 0 ? AUCTION_LINES.nothing : { text: `Retiraste ${parts.join(' y ')}.`, tone: 'done' };
}

export function parsePrice(text: string, rules: AuctionRules | null): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const price: number = Number(trimmed);
  if (!Number.isSafeInteger(price) || price < 1) return null;
  if (rules !== null && (price < rules.minPrice || price > rules.maxPrice)) return null;
  return price;
}

export function parseLevel(text: string): number | null {
  const trimmed: string = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const level: number = Number(trimmed);
  return Number.isSafeInteger(level) && level >= 1 ? level : null;
}

export function timeLeft(endsAt: string, now: number): string {
  const minutes: number = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / MS_PER_MINUTE));
  if (minutes <= 0) return 'Finaliza';
  if (minutes < MINUTES_PER_HOUR) return `Quedan ${minutes} min`;
  const hours: number = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest: number = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `Quedan ${hours} h` : `Quedan ${hours} h ${rest} min`;
}

export function termsLine(rules: AuctionRules): string {
  const cut: number = Math.round(rules.cut * PERCENT);
  const hours: string = `Las publicaciones duran ${rules.lifeHours} horas.`;
  return cut > 0 ? `La casa de subastas se queda con el ${cut}% de cada venta. ${hours}` : hours;
}

export function proceeds(price: number, rules: AuctionRules | null): number {
  return rules === null ? price : price - Math.floor(price * rules.cut);
}

export function saleLine(sale: Sale): string {
  if (sale.outcome === 'cancelled') return 'Cancelada';
  if (sale.outcome === 'expired') return sale.collected ? 'Vencida · devuelto' : 'Vencida · pendiente';
  return sale.collected ? `Vendida por ${sale.price} · recibiste ${sale.proceeds}` : `Vendida por ${sale.price} · ${sale.proceeds} pendientes de retiro`;
}

const SOMEONE: string = 'Alguien';
const MINUTES_PER_DAY: number = 1440;

export function agoLine(at: string, now: number): string {
  const minutes: number = Math.max(0, Math.floor((now - Date.parse(at)) / MS_PER_MINUTE));
  if (minutes < 1) return 'hace un momento';
  if (minutes < MINUTES_PER_HOUR) return `hace ${minutes} min`;
  if (minutes < MINUTES_PER_DAY) return `hace ${Math.floor(minutes / MINUTES_PER_HOUR)} h`;
  return `hace ${Math.floor(minutes / MINUTES_PER_DAY)} días`;
}

export function tradeLine(sale: PublicSale): string {
  const seller: string = sale.seller ?? SOMEONE;
  const buyer: string = sale.buyer ?? SOMEONE;
  if (sale.you === 'seller') return `Le vendiste a ${buyer}`;
  if (sale.you === 'buyer') return `Le compraste a ${seller}`;
  return `${seller} le vendió a ${buyer}`;
}

export function waitingCue(gold: number): string {
  return gold > 0 ? `${gold} de oro por retirar en la casa de subastas` : '';
}

export interface ShownItems {
  shown(item: LedgerItem): ItemInstance;
}

export function createShownItems(): ShownItems {
  const uids: Map<string, number> = new Map<string, number>();
  return {
    shown(item: LedgerItem): ItemInstance {
      const known: number | undefined = uids.get(item.id);
      const uid: number = known ?? -(uids.size + 1);
      if (known === undefined) uids.set(item.id, uid);
      return { uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: item.id };
    },
  };
}
