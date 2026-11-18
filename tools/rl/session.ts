import type { Content } from '../../sim/content/types.ts';
import { fields, text } from '../../sim/content/read.ts';
import type { Fields } from '../../sim/content/read.ts';
import { contractShape, LAYOUT, RL } from '../../sim/rl/contract.ts';
import type { DemoEpisode, Demonstration } from '../../sim/rl/demo.ts';
import { demonstrate } from '../../sim/rl/demo.ts';
import type { Pool, PoolOptions, PoolStep } from '../../sim/rl/pool.ts';
import { createPool, poolObservations, stepPool } from '../../sim/rl/pool.ts';
import type { Replay } from '../../sim/rl/replay.ts';
import type { Frame } from './frames.ts';
import { demonstrationFrame, frame, FRAME, jsonPart, observationFrame, readActions, readJson } from './frames.ts';

export const SESSION = {
  maxJitter: 0.9,
} as const;

export interface Session {
  readonly content: Content;
  pool: Pool | null;
}

export interface Reply {
  readonly frames: readonly Buffer[];
  readonly keep: readonly Replay[];
  readonly quit: boolean;
}

function spread(source: Fields): number {
  const value: number = count(source, 'jitter', 0);
  if (value > SESSION.maxJitter) throw new Error(`jitter must be at most ${SESSION.maxJitter}`);
  return value;
}

function count(source: Fields, key: string, fallback: number): number {
  const value: unknown = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${key} must be a number of zero or more`);
  return value;
}

export function readPoolOptions(raw: unknown): PoolOptions {
  const source: Fields = fields(raw, 'hello');
  return { seed: Math.floor(count(source, 'seed', 1)), envs: Math.max(1, Math.floor(count(source, 'envs', 1))), jitter: spread(source), waves: Math.max(1, Math.floor(count(source, 'waves', 1))), keepEvery: Math.floor(count(source, 'keepEvery', 0)) };
}

function observations(step: PoolStep, envs: number): Buffer {
  return observationFrame({ envs, size: LAYOUT.size, maskSize: LAYOUT.mask, obs: step.obs, rewards: step.rewards, mask: step.mask, dones: step.dones, info: { finished: step.finished } });
}

function demonstrations(session: Session, raw: unknown): Buffer {
  const source: Fields = fields(raw, 'demo');
  const seed: number = Math.floor(count(source, 'seed', 1));
  const episodes: number = Math.max(1, Math.floor(count(source, 'episodes', 1)));
  const jitter: number = spread(source);
  const waves: number = Math.max(1, Math.floor(count(source, 'waves', 1)));
  const played: DemoEpisode[] = Array.from({ length: episodes }, (_unused: unknown, index: number): DemoEpisode => demonstrate(session.content, { seed: seed + index, jitter, waves }));
  const samples: Demonstration[] = played.flatMap((episode: DemoEpisode): Demonstration[] => [...episode.samples]);
  const obs: Float32Array = new Float32Array(samples.length * LAYOUT.size);
  const mask: Uint8Array = new Uint8Array(samples.length * LAYOUT.mask);
  const actions: Int32Array = new Int32Array(samples.length * RL.actionParts);
  samples.forEach((sample: Demonstration, index: number): void => {
    obs.set(sample.obs, index * LAYOUT.size);
    mask.set(sample.mask, index * LAYOUT.mask);
    actions.set([sample.action.move, sample.action.skill, sample.action.target, sample.action.flask], index * RL.actionParts);
  });
  const info = { episodes: played.map((episode: DemoEpisode): { readonly outcome: string; readonly total: number; readonly waves: number } => ({ outcome: episode.outcome, total: episode.total, waves: episode.waves })) };
  return demonstrationFrame({ count: samples.length, size: LAYOUT.size, maskSize: LAYOUT.mask, obs, actions, mask, info });
}

function needPool(session: Session): Pool {
  if (session.pool === null) throw new Error('say hello before reset or step');
  return session.pool;
}

function answer(session: Session, received: Frame): Reply {
  switch (received.kind) {
    case FRAME.hello: {
      const options: PoolOptions = readPoolOptions(readJson(received.payload));
      session.pool = createPool(session.content, options);
      return { frames: [frame(FRAME.hello, jsonPart({ ...contractShape(), envs: options.envs }))], keep: [], quit: false };
    }
    case FRAME.reset: {
      const pool: Pool = needPool(session);
      return { frames: [observations(poolObservations(pool), pool.options.envs)], keep: [], quit: false };
    }
    case FRAME.step: {
      const pool: Pool = needPool(session);
      const step: PoolStep = stepPool(pool, readActions(received.payload));
      return { frames: [observations(step, pool.options.envs)], keep: step.keep, quit: false };
    }
    case FRAME.tag: {
      const pool: Pool = needPool(session);
      pool.tag = text(fields(readJson(received.payload), 'tag'), 'tag', 'tag');
      return { frames: [frame(FRAME.tag, [])], keep: [], quit: false };
    }
    case FRAME.demo:
      return { frames: [demonstrations(session, readJson(received.payload))], keep: [], quit: false };
    case FRAME.quit:
      return { frames: [], keep: [], quit: true };
    default:
      return { frames: [frame(FRAME.error, jsonPart({ error: `unknown frame kind ${received.kind}` }))], keep: [], quit: false };
  }
}

export function handle(session: Session, received: Frame): Reply {
  try {
    return answer(session, received);
  }
  catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    return { frames: [frame(FRAME.error, jsonPart({ error: message }))], keep: [], quit: false };
  }
}
