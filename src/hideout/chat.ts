import type { FriendResult, NameResult, ReportResult } from '../backend/api.ts';
import { NAME_MESSAGES } from '../lobby/lobby-model.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { ChatLine, ChatRefusal, WhisperDirection, WhisperRefusal } from '../backend/live-protocol.ts';
import type { ChatCommand } from './chat-command.ts';
import { nameKey } from './chat-command.ts';

export const CHAT = { keep: 120, names: 200 } as const;

export const CHAT_DAYS = {
  today: 'Hoy',
  yesterday: 'Ayer',
  months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
} as const;

export const CHAT_WORDS = {
  general: 'General',
  hint: 'Susurrá con /dm nombre, respondé con /r y volvé a General con /g.',
  help: '/dm nombre mensaje susurra a un jugador. /r mensaje responde al último susurro. /g vuelve a General. Poné entre comillas los nombres con espacios.',
  noWhispers: 'Los susurros todavía no están disponibles.',
  noReply: 'Nadie te susurró todavía.',
} as const;

export type NoteKind = 'plain' | 'name' | 'hint';

export type ChatScope = 'everyone' | 'hideout';

export type ChatTarget = { readonly kind: 'general' } | { readonly kind: 'whisper'; readonly name: string };

export const GENERAL: ChatTarget = { kind: 'general' };

export type ChatEntry =
  | { readonly kind: 'line'; readonly key: string; readonly line: ChatLine; readonly own: boolean }
  | { readonly kind: 'whisper'; readonly key: string; readonly line: ChatLine; readonly dir: WhisperDirection; readonly with: string }
  | { readonly kind: 'note'; readonly key: string; readonly text: string; readonly note: NoteKind };

export interface ChatState {
  readonly entries: readonly ChatEntry[];
  readonly you: string | null;
  readonly me: string | null;
  readonly notes: number;
  readonly scope: ChatScope | null;
  readonly target: ChatTarget;
  readonly replyTo: string | null;
  readonly names: readonly string[];
}

export const EMPTY_CHAT: ChatState = { entries: [], you: null, me: null, notes: 0, scope: null, target: GENERAL, replyTo: null, names: [] };

export type ChatAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'whisper'; readonly to: string; readonly text: string };

export interface ChatStep {
  readonly state: ChatState;
  readonly action: ChatAction;
  readonly keepOpen: boolean;
}

const REFUSAL_TEXT: Readonly<Record<ChatRefusal, string>> = {
  slow_down: 'Demasiado rápido. Esperá un momento.',
  blocked: 'No se envió esa línea.',
  name_needed: 'Elegí un nombre para hablar.',
  bad_text: 'No se puede enviar esa línea.',
};

const REPORT_TEXT: Readonly<Record<ReportResult, string>> = {
  reported: 'Denunciado. Gracias.',
  gone: 'Esa línea ya no está.',
  own: 'Esa es tu propia línea.',
  slow: 'Demasiadas denuncias. Probá de nuevo más tarde.',
  unsupported: 'Las denuncias no están disponibles acá.',
  failed: 'No se pudo enviar la denuncia.',
};

export function refusalText(reason: ChatRefusal): string {
  return REFUSAL_TEXT[reason];
}

export function unsentText(reason: WhisperRefusal, to: string): string {
  switch (reason) {
    case 'no_such_player':
      return `No existe nadie llamado ${to}. Poné entre comillas los nombres con espacios: /dm "Ash Walker" hola`;
    case 'offline':
      return `${to} no está conectado.`;
    case 'ignored':
      return `${to} no está recibiendo tus susurros.`;
    case 'self':
      return 'Ese sos vos.';
    case 'slow_down':
      return 'Demasiado rápido. Esperá un momento.';
    case 'blocked':
      return 'No se envió ese susurro.';
    case 'bad_text':
      return 'No se puede enviar ese susurro.';
    case 'name_needed':
      return 'Elegí un nombre para susurrar.';
  }
  return 'No se envió ese susurro.';
}

export function reportText(result: ReportResult): string {
  return REPORT_TEXT[result];
}

export function friendText(result: FriendResult, name: string): string {
  switch (result.kind) {
    case 'ok':
      return result.state === 'friends' ? `Vos y ${name} son amigos.` : `Solicitud de amistad enviada a ${name}.`;
    case 'unsupported':
      return 'Los amigos no están disponibles acá.';
    case 'failed':
      return 'No se pudo enviar la solicitud.';
    case 'refused':
      switch (result.reason) {
        case 'name_needed':
          return 'Elegí un nombre primero.';
        case 'own_name':
          return 'Ese sos vos.';
        case 'no_such_character':
          return `No existe nadie llamado ${name}.`;
        case 'friend_limit':
          return 'Tu lista de amigos está llena.';
        case 'no_such_request':
          return `${name} no tiene una solicitud pendiente.`;
      }
  }
  return 'No se pudo enviar la solicitud.';
}

export function renameText(result: NameResult): string {
  switch (result.kind) {
    case 'ok':
      return `Ahora sos ${result.name}. Decilo otra vez.`;
    case 'invalid':
      return NAME_MESSAGES[result.reason];
    case 'limited':
      return NAME_MESSAGES.limited;
    case 'unauthorized':
    case 'refused':
    case 'retry':
      return NAME_MESSAGES.unavailable;
  }
  return NAME_MESSAGES.unavailable;
}

interface Day {
  readonly year: number;
  readonly month: number;
  readonly date: number;
}

function dayOf(ms: number): Day {
  const moment: Date = new Date(ms);
  return { year: moment.getFullYear(), month: moment.getMonth(), date: moment.getDate() };
}

function sameDay(left: Day, right: Day): boolean {
  return left.year === right.year && left.month === right.month && left.date === right.date;
}

function stampOf(at: string | null): number | null {
  if (at === null) return null;
  const parsed: number = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dayLabel(at: number, now: number): string {
  const day: Day = dayOf(at);
  const today: Day = dayOf(now);
  if (sameDay(day, today)) return CHAT_DAYS.today;
  const before: Date = new Date(today.year, today.month, today.date - 1);
  if (sameDay(day, dayOf(before.getTime()))) return CHAT_DAYS.yesterday;
  const named: string = `${String(day.date)} ${CHAT_DAYS.months[day.month] ?? ''}`;
  return day.year === today.year ? named : `${named} ${String(day.year)}`;
}

export function dayDivider(previous: string | null, at: string | null, now: number): string | null {
  const stamp: number | null = stampOf(at);
  if (stamp === null) return null;
  const earlier: number | null = stampOf(previous);
  if (earlier === null ? sameDay(dayOf(stamp), dayOf(now)) : sameDay(dayOf(stamp), dayOf(earlier))) return null;
  return dayLabel(stamp, now);
}

export function readers(state: ChatState): string {
  if (state.target.kind === 'whisper') return `Solo vos y ${state.target.name} leen esto.`;
  return state.scope === 'hideout' ? 'Todos en el refugio leen esto.' : 'Todos los jugadores conectados leen esto.';
}

export function destination(aim: ChatTarget): string {
  return aim.kind === 'whisper' ? `Para ${aim.name}` : `Para ${CHAT_WORDS.general}`;
}

export function isResidentName(name: string, line: ChatLine | null, known: ReadonlySet<string>): boolean {
  return line?.resident === true || known.has(name.toLowerCase());
}

function isOwn(line: ChatLine, state: ChatState): boolean {
  if (line.own !== null) return line.own;
  return line.from !== null && (line.from === state.you || line.from === state.me);
}

function kept(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  return entries.slice(-CHAT.keep);
}

export function withName(state: ChatState, name: string): ChatState {
  const key: string = nameKey(name);
  if (key === '') return state;
  const others: readonly string[] = state.names.filter((known: string): boolean => nameKey(known) !== key);
  return { ...state, names: [...others, name].slice(-CHAT.names) };
}

function withEntries(state: ChatState, fresh: readonly ChatEntry[]): ChatState {
  const known: ReadonlySet<string> = new Set<string>(state.entries.map((entry: ChatEntry): string => entry.key));
  const added: readonly ChatEntry[] = fresh.filter((entry: ChatEntry): boolean => !known.has(entry.key));
  if (added.length === 0) return state;
  let next: ChatState = { ...state, entries: kept([...state.entries, ...added]) };
  for (const entry of added) if (entry.kind !== 'note') next = withName(next, entry.kind === 'whisper' ? entry.with : entry.line.name);
  return next;
}

function withLines(state: ChatState, lines: readonly ChatLine[]): ChatState {
  return withEntries(
    state,
    lines.map((line: ChatLine): ChatEntry => ({ kind: 'line', key: `line-${String(line.id)}`, line, own: isOwn(line, state) })),
  );
}

export function addNote(state: ChatState, text: string, note: NoteKind = 'plain'): ChatState {
  const notes: number = state.notes + 1;
  return { ...state, notes, entries: kept([...state.entries, { kind: 'note', key: `note-${String(notes)}`, text, note }]) };
}

export function receive(state: ChatState, event: LiveEvent): ChatState {
  switch (event.type) {
    case 'welcome':
      return withLines({ ...state, me: event.you, scope: 'everyone' }, event.chat);
    case 'present':
      return event.chat === null ? state : withLines({ ...state, you: event.you, scope: state.scope ?? 'hideout' }, event.chat);
    case 'said':
      return withLines(state, [event.line]);
    case 'whisper': {
      const entry: ChatEntry = { kind: 'whisper', key: `whisper-${String(event.line.id)}`, line: event.line, dir: event.dir, with: event.with };
      const next: ChatState = withEntries(state, [entry]);
      return event.dir === 'from' && next !== state ? { ...next, replyTo: event.with } : next;
    }
    case 'unsent':
      return addNote(state, unsentText(event.reason, event.to), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'refused':
      return addNote(state, refusalText(event.reason), event.reason === 'name_needed' ? 'name' : 'plain');
    case 'joined':
      return withName(state, event.player.name);
    case 'look':
      return event.name === null ? state : withName(state, event.name);
    case 'left':
    case 'moves':
    case 'friends':
    case 'trade':
    case 'away':
    case 'gone':
      return state;
  }
  return state;
}

export function target(state: ChatState, next: ChatTarget): ChatState {
  if (next.kind === 'general') return state.target.kind === 'general' ? state : { ...state, target: GENERAL };
  return withName({ ...state, target: next }, next.name);
}

function whisperTo(state: ChatState, name: string, text: string | null): ChatStep {
  if (state.scope !== 'everyone') return { state: addNote(state, CHAT_WORDS.noWhispers), action: { kind: 'none' }, keepOpen: false };
  const aimed: ChatState = target(state, { kind: 'whisper', name });
  return text === null ? { state: aimed, action: { kind: 'none' }, keepOpen: true } : { state: aimed, action: { kind: 'whisper', to: name, text }, keepOpen: false };
}

export function command(state: ChatState, parsed: ChatCommand): ChatStep {
  switch (parsed.kind) {
    case 'empty':
      return { state, action: { kind: 'none' }, keepOpen: false };
    case 'say':
      return state.target.kind === 'whisper' ? whisperTo(state, state.target.name, parsed.text) : { state, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    case 'general': {
      const back: ChatState = target(state, GENERAL);
      return parsed.text === null ? { state: back, action: { kind: 'none' }, keepOpen: true } : { state: back, action: { kind: 'say', text: parsed.text }, keepOpen: false };
    }
    case 'whisper':
      return whisperTo(state, parsed.name, parsed.text);
    case 'reply':
      return state.replyTo === null ? { state: addNote(state, CHAT_WORDS.noReply), action: { kind: 'none' }, keepOpen: false } : whisperTo(state, state.replyTo, parsed.text);
    case 'help':
      return { state: addNote(state, CHAT_WORDS.help, 'hint'), action: { kind: 'none' }, keepOpen: false };
    case 'no_name':
      return { state: addNote(state, `Name a player: ${parsed.command} name message`), action: { kind: 'none' }, keepOpen: false };
    case 'unknown':
      return { state: addNote(state, `${parsed.command} is not a command. Try /dm name, /r or /g.`), action: { kind: 'none' }, keepOpen: false };
  }
  return { state, action: { kind: 'none' }, keepOpen: false };
}

export function speaker(entry: ChatEntry): string | null {
  switch (entry.kind) {
    case 'line':
      return entry.own ? null : entry.line.name;
    case 'whisper':
      return entry.with;
    case 'note':
      return null;
  }
  return null;
}
