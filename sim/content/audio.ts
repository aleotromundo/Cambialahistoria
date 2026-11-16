import audio from '../../data/audio.json' with { type: 'json' };
import type { NoticeReason } from '../world/types.ts';
import type { Fields } from './read.ts';
import { choiceList, ContentError, each, fields, flag, isFields, numeric, text } from './read.ts';
import type { ZoneEncounter } from './story-types.ts';
import type { Content, RarityDef, WeaponKind, ZoneDef } from './types.ts';
import { BODY_MATERIALS, WEAPON_KINDS } from './types.ts';

export const UI_ACTIONS = ['click', 'panel_open', 'panel_close', 'error', 'skill_point', 'equip', 'title_gone'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];

export const WORLD_SOUND_EVENTS = ['hero_step', 'hero_burn', 'level_up', 'surge', 'surge_cleared', 'monster_spawn', 'player_respawn', 'flask_used', 'quest_started', 'quest_advanced', 'quest_completed', 'waypoint_unlocked', 'moment_calm', 'moment_hostile', 'moment_strike', 'moment_strike_soft', 'wake_stir', 'wake_front', 'wake_standing', 'portal_opened', 'portal_entered', 'portal_arrived', 'portal_closed', 'portal_hum'] as const;
export type WorldSoundEvent = (typeof WORLD_SOUND_EVENTS)[number];

export const LIFE_SOUND_EVENTS = ['bats_disturbed', 'bat_flyby', 'lid_opened', 'lid_closed'] as const;
export type LifeSoundEvent = (typeof LIFE_SOUND_EVENTS)[number];

const NOTICE_KEYS: Readonly<Record<NoticeReason, true>> = { wrong_weapon: true, no_mana: true, on_cooldown: true, inventory_full: true, flask_empty: true, life_full: true, mana_full: true, no_gold: true, stash_full: true, legendary_limit: true, portal_town: true, portal_boss: true };
const NOTICE_REASONS: readonly string[] = Object.keys(NOTICE_KEYS);

export const PLAYER_KEY: string = 'player';
export const GOLD_KEY: string = 'gold';
export const FALLBACK_KEY: string = 'fallback';

export const GUARD_OUTCOMES = ['blocked', 'broken'] as const;
export type GuardSound = (typeof GUARD_OUTCOMES)[number];

const SOUND_ID: RegExp = /^[a-z][a-z0-9_]*$/;

const LIMITS = {
  volumeMax: 2,
  voicesMax: 16,
  cooldownMax: 60,
  delayMax: 600,
  reachMin: 5,
  reachMax: 200,
  holdMax: 30,
  pitchMin: 0.5,
  pitchMax: 2,
  jitterMax: 0.5,
  cutMin: 0.05,
  cutMax: 10,
} as const;

export interface CueDefaults {
  readonly volume: number;
  readonly maxVoices: number;
  readonly cooldown: number;
  readonly reach: number;
}

export interface PitchRange {
  readonly min: number;
  readonly max: number;
}

export interface CueDef {
  readonly sound: string;
  readonly volume: number;
  readonly maxVoices: number;
  readonly cooldown: number;
  readonly reach: number;
  readonly holdForVoice: number;
  readonly pitch: PitchRange | null;
  readonly volumeJitter: number | null;
}

export interface WeaponCue extends CueDef {
  readonly weapons: readonly WeaponKind[];
}

export type CueTable = ReadonlyMap<string, readonly WeaponCue[]>;

export interface AmbienceLoop {
  readonly sound: string;
  readonly volume: number;
}

export interface AmbienceStinger {
  readonly sound: string;
  readonly volume: number;
  readonly minDelay: number;
  readonly maxDelay: number;
}

export interface ZoneAmbience {
  readonly loops: readonly AmbienceLoop[];
  readonly stingers: readonly AmbienceStinger[];
}

export const SEAM_PARTS = ['buildUp', 'tear', 'tearBack', 'settle'] as const;
export type SeamPart = (typeof SEAM_PARTS)[number];

export interface SeamPartSound {
  readonly synth: boolean;
  readonly cut: number | null;
  readonly cues: readonly CueDef[];
}

export interface SeamSound {
  readonly worldFloor: number;
  readonly parts: Readonly<Record<SeamPart, SeamPartSound>>;
}

export interface AudioDef {
  readonly defaults: CueDefaults;
  readonly seam: SeamSound;
  readonly skillStart: CueTable;
  readonly skillImpact: CueTable;
  readonly projectileSpawn: CueTable;
  readonly projectileExpire: CueTable;
  readonly skillHit: CueTable;
  readonly hit: CueTable;
  readonly critHit: CueTable;
  readonly guarded: CueTable;
  readonly death: CueTable;
  readonly aggro: CueTable;
  readonly drop: CueTable;
  readonly pickup: CueTable;
  readonly notice: CueTable;
  readonly world: CueTable;
  readonly encounterNearing: CueTable;
  readonly encounterShown: CueTable;
  readonly life: CueTable;
  readonly ui: CueTable;
  readonly ambience: ReadonlyMap<string, ZoneAmbience>;
}

export interface KnownIds {
  readonly skills: ReadonlySet<string>;
  readonly projectileSkills: ReadonlySet<string>;
  readonly monsters: ReadonlySet<string>;
  readonly rarities: ReadonlySet<string>;
  readonly zones: ReadonlySet<string>;
  readonly encounters: ReadonlySet<string>;
}

function soundId(source: Fields, key: string, where: string): string {
  const id: string = text(source, key, where);
  if (!SOUND_ID.test(id)) throw new ContentError(`${where}.${key}`, `${id} is not a lower snake case sound id`);
  return id;
}

function ranged(source: Fields, key: string, fallback: number, min: number, max: number, where: string): number {
  if (source[key] === undefined) return fallback;
  const value: number = numeric(source, key, where);
  if (value < min || value > max) throw new ContentError(`${where}.${key}`, `expected ${min} to ${max}`);
  return value;
}

function required(source: Fields, key: string, min: number, max: number, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < min || value > max) throw new ContentError(`${where}.${key}`, `expected ${min} to ${max}`);
  return value;
}

function pitchRange(source: Fields, where: string): PitchRange | null {
  const given: unknown = source['pitch'];
  if (given === undefined) return null;
  const pair: readonly unknown[] = Array.isArray(given) ? given.map((item: unknown): unknown => item) : [];
  const min: unknown = pair[0];
  const max: unknown = pair[1];
  if (typeof min !== 'number' || typeof max !== 'number' || pair.length !== 2) throw new ContentError(`${where}.pitch`, 'expected [lowest, highest] playback rates');
  if (!(min >= LIMITS.pitchMin && max <= LIMITS.pitchMax && min <= max)) throw new ContentError(`${where}.pitch`, `expected ${LIMITS.pitchMin} to ${LIMITS.pitchMax}, lowest first`);
  return { min, max };
}

function cue(value: unknown, defaults: CueDefaults, where: string): CueDef {
  return cueFields(fields(value, where), defaults, where);
}

function weaponCue(value: unknown, defaults: CueDefaults, where: string): WeaponCue {
  const source: Fields = fields(value, where);
  const weapons: readonly WeaponKind[] = source['weapons'] === undefined ? [] : choiceList(source, 'weapons', WEAPON_KINDS, where);
  return { ...cueFields(source, defaults, where), weapons };
}

function cueFields(source: Fields, defaults: CueDefaults, where: string): CueDef {
  const maxVoices: number = ranged(source, 'maxVoices', defaults.maxVoices, 1, LIMITS.voicesMax, where);
  if (!Number.isInteger(maxVoices)) throw new ContentError(`${where}.maxVoices`, 'expected a whole number');
  return {
    sound: soundId(source, 'sound', where),
    volume: ranged(source, 'volume', defaults.volume, 0.01, LIMITS.volumeMax, where),
    maxVoices,
    cooldown: ranged(source, 'cooldown', defaults.cooldown, 0, LIMITS.cooldownMax, where),
    reach: ranged(source, 'reach', defaults.reach, LIMITS.reachMin, LIMITS.reachMax, where),
    holdForVoice: ranged(source, 'holdForVoice', 0, 0, LIMITS.holdMax, where),
    pitch: pitchRange(source, where),
    volumeJitter: source['volumeJitter'] === undefined ? null : required(source, 'volumeJitter', 0, LIMITS.jitterMax, where),
  };
}

function table(source: Fields, key: string, allowed: ReadonlySet<string>, defaults: CueDefaults, where: string): CueTable {
  const entries: unknown = source[key];
  if (!isFields(entries)) throw new ContentError(`${where}.${key}`, 'expected an object');
  const result: Map<string, readonly WeaponCue[]> = new Map<string, readonly WeaponCue[]>();
  for (const [id, list] of Object.entries(entries)) {
    if (!allowed.has(id)) throw new ContentError(`${where}.${key}.${id}`, `unknown id, expected one of ${[...allowed].join(', ')}`);
    result.set(
      id,
      each(list, `${where}.${key}.${id}`, (entry: unknown, entryWhere: string): WeaponCue => weaponCue(entry, defaults, entryWhere)),
    );
  }
  return result;
}

function defaultsOf(value: unknown, where: string): CueDefaults {
  const source: Fields = fields(value, where);
  const maxVoices: number = numeric(source, 'maxVoices', where);
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > LIMITS.voicesMax) throw new ContentError(`${where}.maxVoices`, `expected a whole number from 1 to ${LIMITS.voicesMax}`);
  const volume: number = numeric(source, 'volume', where);
  const cooldown: number = numeric(source, 'cooldown', where);
  if (volume <= 0 || volume > LIMITS.volumeMax) throw new ContentError(`${where}.volume`, `expected more than 0 and at most ${LIMITS.volumeMax}`);
  if (cooldown < 0 || cooldown > LIMITS.cooldownMax) throw new ContentError(`${where}.cooldown`, `expected 0 to ${LIMITS.cooldownMax}`);
  const reach: number = required(source, 'reach', LIMITS.reachMin, LIMITS.reachMax, where);
  return { volume, maxVoices, cooldown, reach };
}

function withExtras(ids: ReadonlySet<string>, ...extras: readonly string[]): ReadonlySet<string> {
  return new Set<string>([...ids, ...extras]);
}

function zone(value: unknown, where: string): ZoneAmbience {
  const source: Fields = fields(value, where);
  return {
    loops: each(source['loops'], `${where}.loops`, (entry: unknown, entryWhere: string): AmbienceLoop => {
      const loop: Fields = fields(entry, entryWhere);
      return { sound: soundId(loop, 'sound', entryWhere), volume: ranged(loop, 'volume', 1, 0.01, LIMITS.volumeMax, entryWhere) };
    }),
    stingers: each(source['stingers'], `${where}.stingers`, (entry: unknown, entryWhere: string): AmbienceStinger => {
      const stinger: Fields = fields(entry, entryWhere);
      const minDelay: number = required(stinger, 'minDelay', 1, LIMITS.delayMax, entryWhere);
      const maxDelay: number = required(stinger, 'maxDelay', 1, LIMITS.delayMax, entryWhere);
      if (maxDelay < minDelay) throw new ContentError(entryWhere, 'maxDelay is below minDelay');
      return { sound: soundId(stinger, 'sound', entryWhere), volume: ranged(stinger, 'volume', 1, 0.01, LIMITS.volumeMax, entryWhere), minDelay, maxDelay };
    }),
  };
}

function seamPart(value: unknown, defaults: CueDefaults, where: string): SeamPartSound {
  const source: Fields = fields(value, where);
  const cut: number | null = source['cut'] === undefined || source['cut'] === null ? null : required(source, 'cut', LIMITS.cutMin, LIMITS.cutMax, where);
  return { synth: flag(source, 'synth', where), cut, cues: each(source['cues'], `${where}.cues`, (entry: unknown, entryWhere: string): CueDef => cue(entry, defaults, entryWhere)) };
}

function seamSound(value: unknown, defaults: CueDefaults, where: string): SeamSound {
  const source: Fields = fields(value, where);
  const parts: Record<SeamPart, SeamPartSound> = {
    buildUp: seamPart(source['buildUp'], defaults, `${where}.buildUp`),
    tear: seamPart(source['tear'], defaults, `${where}.tear`),
    tearBack: seamPart(source['tearBack'], defaults, `${where}.tearBack`),
    settle: seamPart(source['settle'], defaults, `${where}.settle`),
  };
  return { worldFloor: required(source, 'worldFloor', 0, 1, where), parts };
}

export function parseAudio(value: unknown, known: KnownIds): AudioDef {
  const where: string = 'audio';
  const source: Fields = fields(value, where);
  const defaults: CueDefaults = defaultsOf(source['defaults'], `${where}.defaults`);
  const read = (key: string, allowed: ReadonlySet<string>): CueTable => table(source, key, allowed, defaults, where);
  const zonesSource: unknown = source['ambience'];
  if (!isFields(zonesSource)) throw new ContentError(`${where}.ambience`, 'expected an object');
  const ambience: Map<string, ZoneAmbience> = new Map<string, ZoneAmbience>();
  for (const [id, entry] of Object.entries(zonesSource)) {
    if (!known.zones.has(id)) throw new ContentError(`${where}.ambience.${id}`, `unknown zone, expected one of ${[...known.zones].join(', ')}`);
    ambience.set(id, zone(entry, `${where}.ambience.${id}`));
  }
  const targets: ReadonlySet<string> = withExtras(known.monsters, PLAYER_KEY, FALLBACK_KEY, ...BODY_MATERIALS);
  const items: ReadonlySet<string> = withExtras(known.rarities, GOLD_KEY);
  return {
    defaults,
    seam: seamSound(source['seam'], defaults, `${where}.seam`),
    skillStart: read('skillStart', known.skills),
    skillImpact: read('skillImpact', known.skills),
    projectileSpawn: read('projectileSpawn', known.projectileSkills),
    projectileExpire: read('projectileExpire', known.projectileSkills),
    skillHit: read('skillHit', known.skills),
    hit: read('hit', targets),
    critHit: read('critHit', targets),
    guarded: read('guarded', new Set<string>(GUARD_OUTCOMES)),
    death: read('death', targets),
    aggro: read('aggro', known.monsters),
    drop: read('drop', items),
    pickup: read('pickup', items),
    notice: read('notice', new Set<string>(NOTICE_REASONS)),
    world: read('world', new Set<string>(WORLD_SOUND_EVENTS)),
    encounterNearing: read('encounterNearing', known.encounters),
    encounterShown: read('encounterShown', known.encounters),
    life: read('life', new Set<string>(LIFE_SOUND_EVENTS)),
    ui: read('ui', new Set<string>(UI_ACTIONS)),
    ambience,
  };
}

export function knownIdsOf(content: Content): KnownIds {
  const skills: string[] = [...content.skills.keys()];
  return {
    skills: new Set<string>(skills),
    projectileSkills: new Set<string>(skills.filter((id: string): boolean => content.skills.get(id)?.delivery.type === 'projectile')),
    monsters: new Set<string>(content.monsters.keys()),
    rarities: new Set<string>(content.rarities.map((rarity: RarityDef): string => rarity.id)),
    zones: new Set<string>(content.zones.keys()),
    encounters: new Set<string>([...content.zones.values()].flatMap((zoneDef: ZoneDef): string[] => (zoneDef.void?.encounters ?? []).map((met: ZoneEncounter): string => met.id))),
  };
}

export function loadAudio(content: Content): AudioDef {
  return parseAudio(audio, knownIdsOf(content));
}
