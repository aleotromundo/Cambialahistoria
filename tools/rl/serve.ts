import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../../sim/content/content.ts';
import type { Replay } from '../../sim/rl/replay.ts';
import type { Frame, FrameReader } from './frames.ts';
import { createReader, readFrames } from './frames.ts';
import type { Reply, Session } from './session.ts';
import { handle } from './session.ts';

const SERVE = {
  replayFlag: '--replays',
  workerFlag: '--worker',
} as const;

function flagValue(name: string): string | null {
  const at: number = process.argv.indexOf(name);
  return at < 0 ? null : (process.argv[at + 1] ?? null);
}

function replayName(worker: string, replay: Replay): string {
  const tag: string = replay.label === '' ? 'untagged' : replay.label.replace(/[^a-z0-9-]+/gi, '-');
  return `${tag}-w${worker}-seed${replay.options.seed}-${replay.outcome}-${replay.total.toFixed(1)}.json`;
}

function saveReplays(folder: string | null, worker: string, keep: readonly Replay[]): void {
  if (folder === null || keep.length === 0) return;
  try {
    mkdirSync(folder, { recursive: true });
    for (const replay of keep) writeFileSync(join(folder, replayName(worker, replay)), JSON.stringify(replay));
  }
  catch (error: unknown) {
    process.stderr.write(`worker ${worker} could not save replays to ${folder}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function main(): void {
  const session: Session = { content: loadContent(), pool: null };
  const reader: FrameReader = createReader();
  const folder: string | null = flagValue(SERVE.replayFlag);
  const worker: string = flagValue(SERVE.workerFlag) ?? '0';
  process.stdin.on('data', (chunk: Buffer): void => {
    for (const received of readFrames(reader, chunk) satisfies Frame[]) {
      const reply: Reply = handle(session, received);
      for (const out of reply.frames) process.stdout.write(out);
      saveReplays(folder, worker, reply.keep);
      if (reply.quit) process.exit(0);
    }
  });
  process.stdin.on('end', (): void => process.exit(0));
}

main();
