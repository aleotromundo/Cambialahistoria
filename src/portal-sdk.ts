export type AdMoment = 'start' | 'respawn' | 'travel';

export interface PortalSdk {
  paused(): boolean;
  ready(): void;
  gameplay(active: boolean): void;
  readonly adBreak?: (moment: AdMoment) => Promise<void>;
}

export const QUIET_SDK: PortalSdk = {
  paused: (): boolean => false,
  ready: (): void => undefined,
  gameplay: (): void => undefined,
};

export function startPortalSdk(): Promise<PortalSdk> {
  return Promise.resolve(QUIET_SDK);
}
