import assert from 'node:assert/strict';
import { test } from 'node:test';
import budgetData from '../data/tree-budgets.json' with { type: 'json' };
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import type { BudgetMiss, StatStack, TreeBudgets } from './tree-stack.ts';
import { describeMiss, heroPoints, overBudget, readBudgets, treeStacks, unbudgeted } from './tree-stack.ts';

const content: Content = loadContent();
const budgets: TreeBudgets = readBudgets(budgetData, 'tree budgets');
const stacks: readonly StatStack[] = treeStacks(content, heroPoints(content, budgets.level));

void test('every stat and skill field the tree grants has a stacking budget', (): void => {
  assert.deepEqual(unbudgeted(stacks, budgets), []);
});

void test('every stacking budget names a stat or skill field the tree still grants', (): void => {
  const granted: ReadonlySet<string> = new Set<string>(stacks.map((stack: StatStack): string => stack.key));
  assert.deepEqual([...budgets.limits.keys()].filter((key: string): boolean => !granted.has(key)), []);
});

void test('no stat or skill field stacks past its budget with every point a level-30 hero has', (): void => {
  const misses: readonly BudgetMiss[] = overBudget(stacks, budgets);
  assert.deepEqual(misses.map(describeMiss), []);
});
