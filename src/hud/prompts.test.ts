import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { DESK_WORDS } from '../../sim/content/hints.ts';
import { alternate, openWith, promptText, use } from './prompts.ts';

void test('a prompt says click on a desk and tap on a phone', (): void => {
  assert.equal(promptText(false, use('equipar'), alternate('soltar')), 'Haz clic para equipar · Haz clic derecho para soltar');
  assert.equal(promptText(true, use('equipar'), alternate('soltar')), 'Toca para equipar');
  assert.equal(promptText(true, use('cerrar')), 'Toca para cerrar');
  assert.equal(promptText(false, use('cerrar', 'Enter')), 'Haz clic o presiona Enter para cerrar');
  assert.equal(promptText(true, use('cerrar', 'Enter')), 'Toca para cerrar');
});

void test('opening a panel names the bound key on a desk and the top bar on a phone', (): void => {
  assert.equal(openWith(false, 'map', 'M'), 'Abre el mapa con M');
  assert.equal(openWith(true, 'map', 'M'), 'Abre el mapa desde la barra superior');
  assert.ok(!DESK_WORDS.test(openWith(true, 'map', 'M')));
});

void test('no screen writes a click or tap prompt of its own', (): void => {
  const folders: readonly string[] = ['src/hud', 'src/opening', 'src/mobile'];
  for (const folder of folders) {
    for (const name of readdirSync(folder).filter((file: string): boolean => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'prompts.ts')) {
      const source: string = readFileSync(`${folder}/${name}`, 'utf8');
      assert.ok(!/['`"](Click|Tap|Right click) (or|to|the|an?)\b/.test(source), `${folder}/${name} writes its own click or tap prompt`);
    }
  }
});
