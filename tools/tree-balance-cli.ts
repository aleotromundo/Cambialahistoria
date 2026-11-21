import { DUEL_KIT } from '../sim/rl/kit.ts';
import { treeStacks, heroPoints } from '../sim/tree-stack.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';
import type { LiftedBuild } from './tree-balance.ts';
import { aheadOfBand, BALANCE, bestBuilds, liftTable, medianLift, specialtyBuilds } from './tree-balance.ts';

for (const stack of treeStacks(CONTENT, heroPoints(CONTENT, BALANCE.level))) process.stdout.write(`${stack.key}: ${Math.round(stack.total * 1000) / 1000}${stack.skill === null ? '' : ` (${stack.skill})`} holding ${stack.held}\n`);
const specialties: LiftedBuild[] = specialtyBuilds(CONTENT, DUEL_KIT, POLICIES, BALANCE.level);
const median: number = medianLift(specialties);
const best: LiftedBuild[] = bestBuilds(CONTENT, DUEL_KIT, BALANCE.level, specialties);
process.stdout.write(`\n${liftTable([...specialties, ...best])}\n\nmedian specialty lift ${Math.round(median * 100) / 100}, allowed up to ${Math.round(median * BALANCE.share * 100) / 100}\n`);
for (const entry of aheadOfBand(best, median, BALANCE.share)) process.stdout.write(`${entry.name} is ahead: ${entry.build.route.join(', ')}\n`);
