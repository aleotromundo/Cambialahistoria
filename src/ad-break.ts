import type { Command } from '../sim/world/types.ts';
import type { AdMoment, PortalSdk } from './portal-sdk.ts';

export function breakBefore(command: Command): AdMoment | null {
  return command.type === 'respawn' ? 'respawn' : null;
}

export function afterBreak(sdk: PortalSdk, moment: AdMoment, then: () => void): void {
  if (sdk.adBreak === undefined) {
    then();
    return;
  }
  void sdk.adBreak(moment).then(then);
}

export function sendAfterBreaks(sdk: PortalSdk, send: (command: Command) => void): (command: Command) => void {
  return (command: Command): void => {
    const moment: AdMoment | null = breakBefore(command);
    if (moment === null) send(command);
    else afterBreak(sdk, moment, (): void => send(command));
  };
}
