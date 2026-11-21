import { warnInConsole } from './backend/console-log.ts';
import type { PortalSdk } from './portal-sdk.ts';

export const Y8_SDK = {
  script: 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js',
  ready: 'y8sdk.ready',
  appIdEnv: 'VITE_Y8_APP_ID',
  autoLogin: false,
} as const;

export interface Y8AppConfig {
  readonly appId: string;
  readonly autoLogin: boolean;
}

export interface Y8Sdk {
  init(config: Y8AppConfig): void;
}

export interface Y8Page {
  globals(): unknown;
  addScript(src: string): void;
  onReady(type: string, listener: () => void): void;
  warn(message: string): void;
}

export type Y8Start = 'off' | 'loading';

export interface FocusWatch {
  blurred(): boolean;
}

function fieldOf(source: unknown, key: string): unknown {
  if ((typeof source !== 'object' && typeof source !== 'function') || source === null) return undefined;
  const value: unknown = Reflect.get(source, key);
  return value;
}

function quietRejection(result: unknown): void {
  const then: unknown = fieldOf(result, 'then');
  if (typeof then === 'function') Reflect.apply(then, result, [undefined, (): void => undefined]);
}

export function readY8Sdk(globals: unknown): Y8Sdk | null {
  const y8: unknown = fieldOf(globals, 'y8');
  const make: unknown = fieldOf(y8, 'sdk');
  if (typeof make !== 'function') return null;
  const made: unknown = Reflect.apply(make, y8, []);
  const init: unknown = fieldOf(made, 'init');
  if (typeof init !== 'function') return null;
  return {
    init(config: Y8AppConfig): void {
      quietRejection(Reflect.apply(init, made, [{ appId: config.appId, autoLogin: config.autoLogin }]));
    },
  };
}

export function askReadyAgain(globals: unknown): void {
  const y8: unknown = fieldOf(globals, 'y8');
  const emit: unknown = fieldOf(y8, 'emitReadyEvent');
  if (typeof emit === 'function') Reflect.apply(emit, y8, []);
}

export function startY8(page: Y8Page, appId: string): Y8Start {
  const id: string = appId.trim();
  if (id === '') return 'off';
  let started: boolean = false;
  page.onReady(Y8_SDK.ready, (): void => {
    if (started) return;
    try {
      const sdk: Y8Sdk | null = readY8Sdk(page.globals());
      if (sdk === null) {
        page.warn('Y8 SDK: loaded without y8.sdk().init');
        return;
      }
      started = true;
      sdk.init({ appId: id, autoLogin: Y8_SDK.autoLogin });
    } catch (error: unknown) {
      page.warn(`Y8 SDK: ${String(error)}`);
    }
  });
  page.addScript(Y8_SDK.script);
  try {
    askReadyAgain(page.globals());
  } catch (error: unknown) {
    page.warn(`Y8 SDK: ${String(error)}`);
  }
  return 'loading';
}

export function watchFocus(target: EventTarget, focused: boolean): FocusWatch {
  let blurred: boolean = !focused;
  target.addEventListener('blur', (): void => {
    blurred = true;
  });
  target.addEventListener('focus', (): void => {
    blurred = false;
  });
  return { blurred: (): boolean => blurred };
}

export function y8Portal(focus: FocusWatch): PortalSdk {
  return {
    paused: (): boolean => focus.blurred(),
    ready: (): void => undefined,
    gameplay: (): void => undefined,
  };
}

function browserPage(): Y8Page {
  return {
    globals: (): unknown => window,
    addScript(src: string): void {
      const script: HTMLScriptElement = document.createElement('script');
      script.src = src;
      script.async = true;
      document.head.append(script);
    },
    onReady(type: string, listener: () => void): void {
      window.addEventListener(type, listener);
    },
    warn: warnInConsole,
  };
}

export function startPortalSdk(): Promise<PortalSdk> {
  startY8(browserPage(), import.meta.env.VITE_Y8_APP_ID ?? '');
  return Promise.resolve(y8Portal(watchFocus(window, document.hasFocus())));
}
