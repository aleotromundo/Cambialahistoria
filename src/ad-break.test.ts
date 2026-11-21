import assert from 'node:assert/strict';
import { test } from 'node:test';
import { afterBreak, breakBefore, sendAfterBreaks } from './ad-break.ts';
import { QUIET_SDK } from './portal-sdk.ts';
import type { AdMoment, PortalSdk } from './portal-sdk.ts';
import type { Command } from '../sim/world/types.ts';

void test('a respawn is the one command that waits for an ad break', (): void => {
  assert.equal(breakBefore({ type: 'respawn', choice: 'checkpoint' }), 'respawn');
  assert.equal(breakBefore({ type: 'respawn', choice: 'town' }), 'respawn');
  assert.equal(breakBefore({ type: 'stop' }), null);
  assert.equal(breakBefore({ type: 'leave_duel' }), null);
});

void test('with no ads the step runs at once, on the same frame', (): void => {
  let ran: boolean = false;
  afterBreak(QUIET_SDK, 'respawn', (): void => {
    ran = true;
  });
  assert.equal(ran, true);
});

void test('with ads the step waits until the break has finished', async (): Promise<void> => {
  const asked: AdMoment[] = [];
  const ad: { finish: (() => void) | null } = { finish: null };
  const sdk: PortalSdk = {
    ...QUIET_SDK,
    adBreak: (moment: AdMoment): Promise<void> => {
      asked.push(moment);
      return new Promise<void>((resolve: () => void): void => {
        ad.finish = resolve;
      });
    },
  };
  let ran: boolean = false;
  afterBreak(sdk, 'start', (): void => {
    ran = true;
  });
  await Promise.resolve();
  assert.deepEqual(asked, ['start']);
  assert.equal(ran, false);
  ad.finish?.();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ran, true);
});

void test('sending holds only a respawn for its break and passes every other command straight on', (): void => {
  const asked: AdMoment[] = [];
  const sdk: PortalSdk = {
    ...QUIET_SDK,
    adBreak: (moment: AdMoment): Promise<void> => {
      asked.push(moment);
      return new Promise<void>((): void => undefined);
    },
  };
  const sent: Command[] = [];
  const send: (command: Command) => void = sendAfterBreaks(sdk, (command: Command): void => {
    sent.push(command);
  });
  send({ type: 'stop' });
  send({ type: 'respawn', choice: 'town' });
  assert.deepEqual(sent, [{ type: 'stop' }]);
  assert.deepEqual(asked, ['respawn']);
  const quiet: Command[] = [];
  sendAfterBreaks(QUIET_SDK, (command: Command): void => {
    quiet.push(command);
  })({ type: 'respawn', choice: 'checkpoint' });
  assert.deepEqual(quiet, [{ type: 'respawn', choice: 'checkpoint' }]);
});
