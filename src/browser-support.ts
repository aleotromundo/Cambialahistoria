export const BROWSER_NOTICES = {
  webgl: 'Este navegador no puede mostrar el juego: necesita WebGL 2. Usa una versión reciente de Chrome, Edge, Firefox o Safari, o activa la aceleración por hardware.',
  old: 'Este navegador es demasiado antiguo para ejecutar el juego. Actualízalo o usa una versión reciente de Chrome, Edge, Firefox o Safari.',
  stopped: 'La tormenta no terminó de cargar. Por lo general, recargar la página lo soluciona.',
  reload: 'Recargar',
} as const;

export const RETRY = {
  key: 'the-lost-storm.retried',
  mark: '1',
  started: 'started',
} as const;

export interface RetryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserProbe {
  readonly webgl2: boolean;
  readonly modernArrays: boolean;
}

export class UnsupportedBrowser extends Error {}

export function unsupportedReason(probe: BrowserProbe): string | null {
  if (!probe.modernArrays) return BROWSER_NOTICES.old;
  if (!probe.webgl2) return BROWSER_NOTICES.webgl;
  return null;
}

export function probeBrowser(scope: object, arrays: object): BrowserProbe {
  return { webgl2: 'WebGL2RenderingContext' in scope, modernArrays: ['toSorted', 'toReversed', 'findLast', 'at'].every((name: string): boolean => name in arrays) };
}

export function failureText(error: unknown): string {
  return error instanceof UnsupportedBrowser ? error.message : BROWSER_NOTICES.stopped;
}

export function reloadHelps(error: unknown): boolean {
  return !(error instanceof UnsupportedBrowser);
}

export function createdOrUnsupported<T>(create: () => T): T {
  try {
    return create();
  } catch {
    throw new UnsupportedBrowser(BROWSER_NOTICES.webgl);
  }
}

export function sessionStore(scope: { readonly sessionStorage: RetryStore }): RetryStore | null {
  try {
    return scope.sessionStorage;
  } catch {
    return null;
  }
}

export function claimRetry(store: RetryStore | null): boolean {
  if (store === null) return false;
  try {
    if (store.getItem(RETRY.key) !== null) return false;
    store.setItem(RETRY.key, RETRY.mark);
    return true;
  } catch {
    return false;
  }
}

export function clearRetry(store: RetryStore | null): void {
  try {
    store?.removeItem(RETRY.key);
  } catch {
    return;
  }
}
