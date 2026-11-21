import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fields, flag, items, numeric, text, textList } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';
import type { Cdp, Chrome, Served } from './chrome-page.ts';
import { CHROME_PAGE, connect, enterPlay, evaluate, pageSocket, startChrome, startServer } from './chrome-page.ts';
import type { SoakArgs, SoakSample, SoakVerdict } from './soak-report.ts';
import { judgeSoak, readSample, SOAK, soakArgs } from './soak-report.ts';
import { profileFor } from './walk-report.ts';

async function phone(cdp: Cdp): Promise<void> {
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: SOAK.phone.width, height: SOAK.phone.height, deviceScaleFactor: SOAK.phone.deviceScale, mobile: true });
  await cdp.call('Performance.enable', {});
}

async function pageMetrics(cdp: Cdp): Promise<Fields> {
  const reply: Fields = await cdp.call('Performance.getMetrics', {});
  const shown: Record<string, number> = {};
  for (const entry of items(reply['metrics'], 'metrics')) {
    const metric: Fields = fields(entry, 'metric');
    shown[text(metric, 'name', 'metric')] = numeric(metric, 'value', 'metric');
  }
  return shown;
}

async function sample(cdp: Cdp, lap: number, ms: number): Promise<SoakSample> {
  await cdp.call('HeapProfiler.collectGarbage', {});
  const heap: Fields = await cdp.call('Runtime.getHeapUsage', {});
  const memory: unknown = await evaluate(cdp, 'window.storm.memory()');
  return readSample(lap, ms, memory, await pageMetrics(cdp), numeric(heap, 'usedSize', 'heap usage'));
}

async function oneLap(cdp: Cdp, lap: number, laps: number, into: SoakSample[]): Promise<string | null> {
  const started: number = performance.now();
  const walked: Fields = fields(await evaluate(cdp, 'window.storm === undefined ? Promise.reject(new Error("no window.storm: soak a dev build")) : window.storm.soak()', SOAK.lapWaitMs), 'soak lap');
  if (!flag(walked, 'ok', 'soak lap')) return `lap ${lap} stopped: ${textList(walked, 'problems', 'soak lap').join('; ')}`;
  const taken: SoakSample = await sample(cdp, lap, performance.now() - started);
  into.push(taken);
  console.log(`lap ${lap} of ${laps}: ${numeric(walked, 'visits', 'soak lap')} zones, heap ${taken.heapMb.toFixed(1)} MB, GPU ${taken.gpuMb.toFixed(1)} MB`);
  return null;
}

async function lapsFrom(cdp: Cdp, lap: number, laps: number, into: SoakSample[]): Promise<string | null> {
  if (lap > laps) return null;
  const stopped: string | null = await oneLap(cdp, lap, laps, into).catch((error: unknown): string => `lap ${lap} failed: ${error instanceof Error ? error.message : String(error)}`);
  if (stopped !== null) return stopped;
  return lapsFrom(cdp, lap + 1, laps, into);
}

async function main(): Promise<number> {
  const args: SoakArgs = soakArgs(process.argv.slice(2), process.env);
  const server: Served | null = args.url === null ? await startServer(args.port) : null;
  const chrome: Chrome = startChrome(args.chrome, profileFor(fileURLToPath(new URL('..', import.meta.url)), SOAK.profile), SOAK.phone);
  let cdp: Cdp | null = null;
  try {
    cdp = await connect(await pageSocket(chrome.profile));
    await phone(cdp);
    await enterPlay(cdp, args.url ?? server?.url ?? '', args.hero, CHROME_PAGE.stepWaitMs, SOAK.page);
    const samples: SoakSample[] = [];
    const stopped: string | null = await lapsFrom(cdp, 1, args.laps, samples);
    const verdict: SoakVerdict = judgeSoak(samples);
    for (const line of verdict.lines) console.log(line);
    const problems: readonly string[] = stopped === null ? verdict.problems : [stopped, ...verdict.problems];
    for (const problem of problems) console.log(`SOAK PROBLEM: ${problem}`);
    if (args.out !== null) writeFileSync(args.out, `${JSON.stringify({ samples, problems }, null, 2)}\n`);
    console.log(problems.length === 0 ? 'SOAK OK' : 'SOAK FAILED');
    return problems.length === 0 ? 0 : 1;
  } finally {
    cdp?.close();
    chrome.process.kill('SIGTERM');
    setTimeout((): void => void chrome.process.kill('SIGKILL'), CHROME_PAGE.settleMs).unref();
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
