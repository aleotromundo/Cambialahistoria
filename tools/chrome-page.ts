import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fields, items, text } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';

export const CHROME_PAGE = {
  serverWaitMs: 60000,
  chromeWaitMs: 20000,
  stepWaitMs: 30000,
  pollMs: 500,
  settleMs: 1500,
  audioKey: 'the-lost-storm.audio.v1',
  portFile: 'DevToolsActivePort',
  steps: ['^enter$', '^(choose for me|take .+)$', '^enter$'],
  begin: '^(enter the storm|continue)$',
} as const;

export interface ChromeWindow {
  readonly width: number;
  readonly height: number;
}

export interface Served {
  readonly url: string;
  readonly process: ChildProcess;
}

export interface Chrome {
  readonly process: ChildProcess;
  readonly profile: string;
}

export type CdpListener = (params: Fields) => void;

export interface Cdp {
  call(method: string, params: Readonly<Record<string, unknown>>, timeoutMs?: number): Promise<Fields>;
  on(method: string, listener: CdpListener): void;
  close(): void;
}

export function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => void setTimeout(resolve, ms));
}

export async function until<T>(what: string, ms: number, attempt: () => Promise<T | null>, waited: number = 0): Promise<T> {
  const found: T | null = await attempt().catch((): null => null);
  if (found !== null) return found;
  if (waited >= ms) throw new Error(`Gave up waiting for ${what} after ${ms} ms`);
  await pause(CHROME_PAGE.pollMs);
  return until(what, ms, attempt, waited + CHROME_PAGE.pollMs);
}

export async function startServer(port: number): Promise<Served> {
  const url: string = `http://localhost:${port}`;
  const taken: boolean = await fetch(`${url}/play/`).then((): boolean => true, (): boolean => false);
  if (taken) throw new Error(`Port ${port} is already served by another process, which may be another checkout; pass a free --port`);
  const server: ChildProcess = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: false });
  await until('the dev server', CHROME_PAGE.serverWaitMs, async (): Promise<boolean | null> => ((await fetch(`${url}/play/`)).ok && server.exitCode === null ? true : null)).catch((error: unknown): never => {
    server.kill();
    throw error;
  });
  return { url, process: server };
}

export function startChrome(chrome: string, profileName: string, window: ChromeWindow): Chrome {
  const profile: string = join(tmpdir(), profileName);
  mkdirSync(profile, { recursive: true });
  rmSync(join(profile, CHROME_PAGE.portFile), { force: true });
  const process: ChildProcess = spawn(chrome, ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', `--window-size=${window.width},${window.height}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  process.on('error', (error: Error): void => console.error(`Chrome did not start from ${chrome}: ${error.message}`));
  return { process, profile };
}

export async function pageSocket(profile: string): Promise<string> {
  return until('a page in Chrome', CHROME_PAGE.chromeWaitMs, async (): Promise<string | null> => {
    const port: string | undefined = readFileSync(join(profile, CHROME_PAGE.portFile), 'utf8').split('\n')[0];
    if (port === undefined) return null;
    const listed: readonly unknown[] = items(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(), 'targets');
    const page: Fields | undefined = listed.map((entry: unknown): Fields => fields(entry, 'target')).find((target: Fields): boolean => target['type'] === 'page');
    return page === undefined ? null : text(page, 'webSocketDebuggerUrl', 'target');
  });
}

export function connect(address: string): Promise<Cdp> {
  const socket: WebSocket = new WebSocket(address);
  const waiting: Map<number, { readonly resolve: (value: Fields) => void; readonly reject: (error: Error) => void }> = new Map();
  const listeners: Map<string, CdpListener[]> = new Map<string, CdpListener[]>();
  let next: number = 1;
  socket.addEventListener('message', (event: MessageEvent): void => {
    const message: Fields = fields(JSON.parse(String(event.data)), 'cdp message');
    const method: unknown = message['method'];
    if (typeof method === 'string') {
      for (const listener of listeners.get(method) ?? []) listener(fields(message['params'] ?? {}, 'cdp event'));
      return;
    }
    const id: unknown = message['id'];
    const pending = typeof id === 'number' ? waiting.get(id) : undefined;
    if (pending === undefined || typeof id !== 'number') return;
    waiting.delete(id);
    if (message['error'] !== undefined) pending.reject(new Error(JSON.stringify(message['error'])));
    else pending.resolve(fields(message['result'] ?? {}, 'cdp result'));
  });
  return new Promise<Cdp>((resolve: (cdp: Cdp) => void, reject: (error: Error) => void): void => {
    socket.addEventListener('error', (): void => reject(new Error(`Could not reach Chrome at ${address}`)));
    socket.addEventListener('open', (): void =>
      resolve({
        call: (method: string, params: Readonly<Record<string, unknown>>, timeoutMs: number = CHROME_PAGE.stepWaitMs): Promise<Fields> =>
          new Promise<Fields>((done: (value: Fields) => void, fail: (error: Error) => void): void => {
            const id: number = next;
            next += 1;
            const timer: NodeJS.Timeout = setTimeout((): void => {
              waiting.delete(id);
              fail(new Error(`${method} timed out`));
            }, timeoutMs);
            waiting.set(id, {
              resolve: (value: Fields): void => {
                clearTimeout(timer);
                done(value);
              },
              reject: (error: Error): void => {
                clearTimeout(timer);
                fail(error);
              },
            });
            socket.send(JSON.stringify({ id, method, params }));
          }),
        on: (method: string, listener: CdpListener): void => {
          listeners.set(method, [...(listeners.get(method) ?? []), listener]);
        },
        close: (): void => socket.close(),
      }),
    );
  });
}

export async function evaluate(cdp: Cdp, expression: string, timeoutMs: number = CHROME_PAGE.stepWaitMs): Promise<unknown> {
  const reply: Fields = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
  if (reply['exceptionDetails'] !== undefined) throw new Error(`The page threw: ${JSON.stringify(reply['exceptionDetails'])}`);
  return fields(reply['result'], 'evaluate result')['value'];
}

export function clickExpression(pattern: string): string {
  return `(() => { const wanted = new RegExp(${JSON.stringify(pattern)}, 'i'); const button = [...document.querySelectorAll('button')].find((candidate) => !candidate.disabled && candidate.offsetParent !== null && wanted.test((candidate.textContent ?? '').trim())); if (button === undefined) return false; button.click(); return true; })()`;
}

export async function clickThrough(cdp: Cdp, steps: readonly string[], patienceMs: number): Promise<void> {
  const [step, ...later] = steps;
  if (step === undefined) return;
  await until(`a button matching ${step}`, patienceMs, async (): Promise<boolean | null> => ((await evaluate(cdp, clickExpression(step))) === true ? true : null)).catch(async (error: unknown): Promise<never> => {
    const shown: unknown = await evaluate(cdp, "[...document.querySelectorAll('button')].filter((button) => button.offsetParent !== null).map((button) => (button.disabled ? '(off) ' : '') + (button.textContent ?? '').trim()).join(' | ')").catch((): string => 'unknown');
    throw new Error(`${error instanceof Error ? error.message : String(error)}; buttons shown: ${String(shown)}`);
  });
  await pause(CHROME_PAGE.settleMs);
  await clickThrough(cdp, later, patienceMs);
}

export async function enterPlay(cdp: Cdp, given: string, hero: string, patienceMs: number, page: string = '/play/'): Promise<void> {
  const url: string = given.replace(/\/+$/, '');
  await cdp.call('Storage.clearDataForOrigin', { origin: url, storageTypes: 'all' });
  await cdp.call('Network.clearBrowserCache', {});
  await cdp.call('Page.navigate', { url: `${url}/` });
  await pause(CHROME_PAGE.settleMs);
  await evaluate(cdp, `localStorage.setItem(${JSON.stringify(CHROME_PAGE.audioKey)}, JSON.stringify({ volumes: { master: 0, effects: 0, voice: 0, ambience: 0 }, muted: true })), true`);
  await cdp.call('Page.navigate', { url: `${url}${page}` });
  await clickThrough(cdp, [...CHROME_PAGE.steps, `^${hero}`, CHROME_PAGE.begin], patienceMs);
  await until('the world to run', patienceMs, async (): Promise<boolean | null> => {
    const before: unknown = await evaluate(cdp, 'window.storm?.world.time ?? null');
    await pause(CHROME_PAGE.settleMs);
    const after: unknown = await evaluate(cdp, 'window.storm?.world.time ?? null');
    return typeof before === 'number' && typeof after === 'number' && after > before ? true : null;
  });
}
