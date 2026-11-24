import type { CreateRefusal } from '../backend/characters-api.ts';
import type { RemoveOutcome } from '../backend/roster-store.ts';
import { ROSTER } from '../backend/roster.ts';
import type { Roster, Slot } from '../backend/roster.ts';
import { NAME_MESSAGES } from './lobby-model.ts';

export const STRIP_TEXT = {
  heading: 'Personajes',
  unnamed: 'Quien despertó',
  fresh: 'Aún no ha despertado',
  levelLabel: 'Nivel',
  newCharacter: 'Nuevo personaje',
  newDetail: 'Un nombre y luego elegir quién despierta',
  firstFirst: 'Primero juega con tu primer personaje o ponle un nombre.',
  offAccount: 'No está en tu cuenta: no hay espacios libres',
  create: 'Crear',
  cancel: 'Cancelar',
  choose: 'Elegir por mí',
  placeholder: 'Su nombre',
  full: 'Esta cuenta ya tiene tres personajes.',
  unreachable: 'No se pudo conectar con el servidor. Inténtalo de nuevo en un momento.',
  deleteLabel: 'Eliminar personaje',
  deleteYes: 'Eliminar para siempre',
  startOverYes: 'Borrar y volver a empezar',
  keep: 'Conservar este personaje',
  listed: 'aún tiene operaciones pendientes en la casa de subastas. Primero cancela sus publicaciones y retira lo que está pendiente.',
  offline: 'No se pudo conectar con el servidor, así que no se eliminó nada. Inténtalo de nuevo en un momento.',
} as const;

export interface HeroNames {
  readonly name: (id: string) => string | null;
}

export type CardView =
  | { readonly kind: 'character'; readonly key: string; readonly name: string; readonly detail: string; readonly active: boolean; readonly note: string | null }
  | { readonly kind: 'empty'; readonly key: string; readonly name: string; readonly detail: string; readonly open: boolean; readonly note: string | null };

export interface LiveCharacter {
  readonly name: string | null;
  readonly hero: string | null;
  readonly level: number | null;
}

export interface StripFacts {
  readonly roster: Roster;
  readonly heroes: HeroNames;
  readonly firstOnServer: boolean;
  readonly accountFull: boolean;
  readonly live: LiveCharacter;
}

export const EMPTY_KEY: string = 'new';

function shownSlot(slot: Slot, facts: StripFacts): Slot {
  if (slot.key !== facts.roster.active) return slot;
  return { ...slot, name: facts.live.name ?? slot.name, hero: facts.live.hero, level: facts.live.level };
}

function detailOf(slot: Slot, heroes: HeroNames): string {
  const hero: string | null = slot.hero === null ? null : heroes.name(slot.hero);
  if (slot.level === null) return hero === null ? STRIP_TEXT.fresh : `${STRIP_TEXT.fresh} · ${hero}`;
  return hero === null ? `${STRIP_TEXT.levelLabel} ${slot.level}` : `${STRIP_TEXT.levelLabel} ${slot.level} · ${hero}`;
}

export function canCreate(facts: StripFacts): boolean {
  return facts.roster.slots.length < ROSTER.max && facts.firstOnServer;
}

export function stripCards(facts: StripFacts): readonly CardView[] {
  const cards: CardView[] = facts.roster.slots.map((stored: Slot): CardView => {
    const slot: Slot = shownSlot(stored, facts);
    return {
      kind: 'character',
      key: slot.key,
      name: slot.name ?? STRIP_TEXT.unnamed,
      detail: detailOf(slot, facts.heroes),
      active: slot.key === facts.roster.active,
      note: slot.id === null && !slot.legacy && facts.accountFull ? STRIP_TEXT.offAccount : null,
    };
  });
  if (facts.roster.slots.length < ROSTER.max) {
    const open: boolean = canCreate(facts);
    cards.push({ kind: 'empty', key: EMPTY_KEY, name: STRIP_TEXT.newCharacter, detail: STRIP_TEXT.newDetail, open, note: open ? null : STRIP_TEXT.firstFirst });
  }
  return cards;
}

export function sameCards(left: readonly CardView[] | null, right: readonly CardView[]): boolean {
  if (left === null || left.length !== right.length) return false;
  return left.every((card: CardView, index: number): boolean => {
    const other: CardView | undefined = right[index];
    if (other === undefined || card.kind !== other.kind) return false;
    if (card.key !== other.key || card.name !== other.name || card.detail !== other.detail || card.note !== other.note) return false;
    if (card.kind === 'character' && other.kind === 'character') return card.active === other.active;
    if (card.kind === 'empty' && other.kind === 'empty') return card.open === other.open;
    return false;
  });
}

export function createRefusalText(reason: CreateRefusal): string {
  return reason === 'character_limit' ? STRIP_TEXT.full : NAME_MESSAGES[reason];
}

export interface DeleteWording {
  readonly ask: string;
  readonly yes: string;
}

export function deleteWording(name: string, only: boolean): DeleteWording {
  if (only) return { ask: `¿Volver a empezar? ${name} y todo lo que lleva desaparecerán para siempre.`, yes: STRIP_TEXT.startOverYes };
  return { ask: `¿Eliminar a ${name}? Este personaje y todo lo que lleva desaparecerán para siempre.`, yes: STRIP_TEXT.deleteYes };
}

export function removeRefusalText(outcome: RemoveOutcome, name: string): string | null {
  if (outcome === 'removed') return null;
  return outcome === 'listed' ? `${name} ${STRIP_TEXT.listed}` : STRIP_TEXT.offline;
}
