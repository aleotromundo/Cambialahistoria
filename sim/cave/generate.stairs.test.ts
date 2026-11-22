import assert from 'node:assert/strict';
import { test } from 'node:test';
import hourfall from '../../data/kits/hourfall.json' with { type: 'json' };
import { loadContent } from '../content/content.ts';
import type { Content, PropDef } from '../content/types.ts';
import type { CaveResult } from './generate.ts';
import { generateCave } from './generate.ts';
import type { CaveKit } from './kit.ts';
import { readKit } from './kit.ts';
import { CAVE_LAYOUT } from './layout.ts';

const content: Content = loadContent();
const kit: CaveKit = readKit(hourfall, 'hourfall');

void test('a kit whose ramp stair does not say which way it rises is refused before any cave is laid', (): void => {
  const stair: PropDef | undefined = content.props.get(kit.stairs.prop);
  assert.ok(stair !== undefined && stair.rises !== null);
  const defs: Map<string, PropDef> = new Map<string, PropDef>(content.props);
  defs.set(stair.id, { ...stair, rises: null });
  const result: CaveResult = generateCave({ seed: 1, columns: 110, rows: 110, chambers: 6, levels: { from: 14, to: 17 }, packs: 8, packScale: 1, roomScale: 1, top: CAVE_LAYOUT.top, ranks: [], screen: { monsters: 40, lights: 40 } }, { kit, defs, judge: null });
  assert.ok(!result.ok);
  assert.match(result.problem, /does not say which way it rises/);
});
