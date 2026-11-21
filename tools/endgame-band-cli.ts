import type { BandCell, Fight, FightResult } from './endgame-band.ts';
import { bandBuilds, bandCell, bandMisses, bandTable, ENDGAME, FIGHTS, runBandJob } from './endgame-band.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

function option(name: string, fallback: string): string {
  const at: number = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
}

function numbers(text: string): number[] {
  return text.split(',').map(Number).filter((value: number): boolean => Number.isInteger(value) && value > 0);
}

function fights(text: string): Fight[] {
  return FIGHTS.filter((fight: Fight): boolean => text.split(',').includes(fight));
}

const builds: string[] = option('builds', bandBuilds(POLICIES).join(',')).split(',');
const levels: number[] = numbers(option('levels', ENDGAME.levels.join(',')));
const seeds: number[] = numbers(option('seeds', ENDGAME.seeds.join(',')));
const cells: BandCell[] = [];
for (const fight of fights(option('fights', FIGHTS.join(',')))) {
  for (const level of levels) {
    for (const build of builds) {
      const results: FightResult[] = seeds.map((seed: number): FightResult => runBandJob(CONTENT, POLICIES, { build, fight, level, seed }));
      const cell: BandCell = bandCell(build, fight, level, results);
      process.stderr.write(`${build} ${fight} ${level}: ${Math.round(cell.time * 10) / 10} s, ${cell.deaths}/${cell.runs} died, ${cell.timeouts}/${cell.runs} timed out\n`);
      cells.push(cell);
    }
  }
}
process.stdout.write(`${bandTable(cells)}\n\n`);
for (const miss of bandMisses(cells, ENDGAME.timeFactor, ENDGAME.deathAllowance)) process.stdout.write(`${miss.cell.build} ${miss.cell.fight} ${miss.cell.level}: ${miss.why} (${Math.round(miss.cell.time)} s against a median of ${Math.round(miss.median)} s, ${miss.cell.deaths}/${miss.cell.runs} died)\n`);
