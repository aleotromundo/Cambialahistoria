import type { Content } from '../content/types.ts';
import { commandsFor } from './act.ts';
import type { Arena, ArenaOutcome } from './arena.ts';
import { arenaObservation, createArena, stepArena } from './arena.ts';
import type { Action } from './contract.ts';
import { LAYOUT, RL } from './contract.ts';
import { rememberDecision } from './recall.ts';
import type { Observation } from './observe.ts';
import type { Replay } from './replay.ts';
import { actionFrom, recordReplay } from './replay.ts';

export interface PoolOptions {
  readonly seed: number;
  readonly envs: number;
  readonly jitter: number;
  readonly waves: number;
  readonly keepEvery: number;
}

export interface EpisodeSummary {
  readonly env: number;
  readonly seed: number;
  readonly outcome: ArenaOutcome;
  readonly total: number;
  readonly waves: number;
  readonly decisions: number;
}

export interface Pool {
  readonly content: Content;
  readonly options: PoolOptions;
  readonly arenas: Arena[];
  readonly seen: Observation[];
  readonly actions: number[][][];
  nextSeed: number;
  episodes: number;
  best: number;
  tag: string;
}

export interface PoolStep {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly rewards: Float32Array;
  readonly dones: Uint8Array;
  readonly finished: readonly EpisodeSummary[];
  readonly keep: readonly Replay[];
}

function freshArena(pool: Pool, env: number): void {
  const arena: Arena = createArena(pool.content, { seed: pool.nextSeed, jitter: pool.options.jitter, waves: pool.options.waves });
  pool.nextSeed += 1;
  pool.arenas[env] = arena;
  pool.seen[env] = arenaObservation(arena);
  pool.actions[env] = [];
}

export function createPool(content: Content, options: PoolOptions): Pool {
  const pool: Pool = { content, options, arenas: [], seen: [], actions: [], nextSeed: options.seed, episodes: 0, best: -Infinity, tag: '' };
  for (let env: number = 0; env < options.envs; env += 1) freshArena(pool, env);
  return pool;
}

function gather(pool: Pool, rewards: Float32Array, dones: Uint8Array, finished: readonly EpisodeSummary[], keep: readonly Replay[]): PoolStep {
  const envs: number = pool.options.envs;
  const obs: Float32Array = new Float32Array(envs * LAYOUT.size);
  const mask: Uint8Array = new Uint8Array(envs * LAYOUT.mask);
  pool.seen.forEach((seen: Observation, env: number): void => {
    obs.set(seen.obs, env * LAYOUT.size);
    mask.set(seen.mask, env * LAYOUT.mask);
  });
  return { obs, mask, rewards, dones, finished, keep };
}

export function poolObservations(pool: Pool): PoolStep {
  const envs: number = pool.options.envs;
  return gather(pool, new Float32Array(envs), new Uint8Array(envs), [], []);
}

function worthKeeping(pool: Pool, arena: Arena): boolean {
  const best: boolean = arena.total > pool.best;
  if (best) pool.best = arena.total;
  return best || (pool.options.keepEvery > 0 && pool.episodes % pool.options.keepEvery === 0);
}

export function stepPool(pool: Pool, actions: Int32Array): PoolStep {
  const envs: number = pool.options.envs;
  if (actions.length !== envs * RL.actionParts) throw new Error(`expected ${envs * RL.actionParts} action numbers, got ${actions.length}`);
  const rewards: Float32Array = new Float32Array(envs);
  const dones: Uint8Array = new Uint8Array(envs);
  const finished: EpisodeSummary[] = [];
  const keep: Replay[] = [];
  for (let env: number = 0; env < envs; env += 1) {
    const arena: Arena | undefined = pool.arenas[env];
    const seen: Observation | undefined = pool.seen[env];
    const log: number[][] | undefined = pool.actions[env];
    if (arena === undefined || seen === undefined || log === undefined) continue;
    const list: number[] = Array.from(actions.subarray(env * RL.actionParts, (env + 1) * RL.actionParts));
    log.push(list);
    const action: Action = actionFrom(list);
    const result = stepArena(arena, commandsFor(arena.world, action, seen.view));
    rememberDecision(arena.recall, action);
    rewards[env] = result.reward;
    if (!result.done) {
      pool.seen[env] = arenaObservation(arena);
      continue;
    }
    dones[env] = 1;
    pool.episodes += 1;
    finished.push({ env, seed: arena.options.seed, outcome: arena.outcome, total: arena.total, waves: arena.tally.waves, decisions: arena.decisions });
    if (worthKeeping(pool, arena)) keep.push(recordReplay(arena, log, pool.tag));
    freshArena(pool, env);
  }
  return gather(pool, rewards, dones, finished, keep);
}
