import { fileURLToPath } from 'node:url';
import { fields, items, text } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';
import type { Cdp } from './chrome-page.ts';
import { CHROME_PAGE, connect, enterPlay, evaluate, pageSocket, startChrome, startServer } from './chrome-page.ts';
import type { WalkArgs, WalkFail, WalkHold, WalkSlow, WalkSummary } from './walk-report.ts';
import { patienceFor, profileFor, readWalk, slowLine, WALK_DEFAULTS, walkArgs, walkLines, withAlarms } from './walk-report.ts';

const WALK = {
  walkWaitMs: 240000,
  slowLatencyMs: 150,
  bitsPerByte: 8,
  bytesPerKilobyte: 1024,
  warnedTypes: ['warning', 'error'],
} as const;

async function slowRequests(cdp: Cdp, holds: readonly WalkHold[], fails: readonly WalkFail[]): Promise<void> {
  const held: Set<string> = new Set<string>();
  const failed: Map<string, number> = new Map<string, number>();
  const answer = (method: string, params: Readonly<Record<string, unknown>>): void => {
    cdp.call(method, params).catch((error: unknown): void => console.error(`${method} failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  cdp.on('Fetch.requestPaused', (params: Fields): void => {
    const requestId: string = text(params, 'requestId', 'paused request');
    const url: string = text(fields(params['request'], 'paused request'), 'url', 'paused request');
    const fail: WalkFail | undefined = fails.find((candidate: WalkFail): boolean => url.includes(candidate.pattern) && (failed.get(candidate.pattern) ?? 0) < candidate.times);
    if (fail !== undefined) {
      failed.set(fail.pattern, (failed.get(fail.pattern) ?? 0) + 1);
      console.log(`slowed: failed ${url}`);
      answer('Fetch.failRequest', { requestId, errorReason: 'Failed' });
      return;
    }
    const hold: WalkHold | undefined = holds.find((candidate: WalkHold): boolean => url.includes(candidate.pattern) && !held.has(candidate.pattern));
    if (hold === undefined) {
      answer('Fetch.continueRequest', { requestId });
      return;
    }
    held.add(hold.pattern);
    console.log(`slowed: holding ${url} for ${hold.ms} ms`);
    setTimeout((): void => answer('Fetch.continueRequest', { requestId }), hold.ms);
  });
  const patterns: string[] = [...holds.map((hold: WalkHold): string => hold.pattern), ...fails.map((fail: WalkFail): string => fail.pattern)];
  if (patterns.length === 0) return;
  await cdp.call('Fetch.enable', { patterns: patterns.map((pattern: string): Readonly<Record<string, string>> => ({ urlPattern: `*${pattern}*`, requestStage: 'Request' })) });
}

async function slowDown(cdp: Cdp, slow: WalkSlow): Promise<void> {
  const line: string | null = slowLine(slow);
  if (line !== null) console.log(line);
  if (slow.cpuRate !== 1) await cdp.call('Emulation.setCPUThrottlingRate', { rate: slow.cpuRate });
  if (slow.kbps !== null) {
    const bytesPerSecond: number = (slow.kbps * WALK.bytesPerKilobyte) / WALK.bitsPerByte;
    await cdp.call('Network.enable', {});
    await cdp.call('Network.emulateNetworkConditions', { offline: false, latency: WALK.slowLatencyMs, downloadThroughput: bytesPerSecond, uploadThroughput: bytesPerSecond });
  }
  await slowRequests(cdp, slow.holds, slow.fails);
}

function listenForWarnings(cdp: Cdp, into: string[]): Promise<Fields> {
  cdp.on('Runtime.consoleAPICalled', (params: Fields): void => {
    const type: string = text(params, 'type', 'console call');
    if (!WALK.warnedTypes.some((wanted: string): boolean => wanted === type)) return;
    const said: string = items(params['args'], 'console args')
      .map((arg: unknown): string => {
        const value: unknown = fields(arg, 'console arg')['value'];
        return typeof value === 'string' ? value : JSON.stringify(value ?? null);
      })
      .join(' ');
    into.push(`${type}: ${said}`);
  });
  return cdp.call('Runtime.enable', {});
}

async function main(): Promise<number> {
  const args: WalkArgs = walkArgs(process.argv.slice(2), process.env);
  const server = args.url === null ? await startServer(args.port) : null;
  const chrome = startChrome(args.chrome, profileFor(fileURLToPath(new URL('..', import.meta.url))), WALK_DEFAULTS);
  let cdp: Cdp | null = null;
  const warnings: string[] = [];
  try {
    cdp = await connect(await pageSocket(chrome.profile));
    await listenForWarnings(cdp, warnings);
    await slowDown(cdp, args.slow);
    await enterPlay(cdp, args.url ?? server?.url ?? '', args.hero, patienceFor(args.slow, CHROME_PAGE.stepWaitMs));
    const walked: WalkSummary = readWalk(await evaluate(cdp, 'window.storm === undefined ? Promise.reject(new Error("no window.storm: walk a dev build")) : window.storm.walk()', patienceFor(args.slow, WALK.walkWaitMs)));
    const summary: WalkSummary = withAlarms(walked, warnings);
    for (const line of walkLines(summary)) console.log(line);
    return summary.ok ? 0 : 1;
  } finally {
    for (const warning of warnings) console.log(`page ${warning}`);
    cdp?.close();
    chrome.process.kill();
    server?.process.kill();
  }
}

main().then(
  (code: number): number => {
    process.exitCode = code;
    return code;
  },
  (error: unknown): void => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
