import type { ScreenBox } from '../watch/duel-frame.ts';

export const HUD_COVERS = {
  cols: 32,
  rows: 48,
} as const;

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface HudProbe {
  size(): ScreenSize;
  clickable(x: number, y: number): boolean;
}

export interface HudCovers {
  covers(): readonly ScreenBox[];
}

interface CoverRun {
  readonly start: number;
  readonly end: number;
  readonly first: number;
  last: number;
}

function runBox(run: CoverRun, cols: number, rows: number): ScreenBox {
  return { left: ((run.start - 0.5) / cols) * 2 - 1, right: ((run.end + 0.5) / cols) * 2 - 1, top: 1 - ((run.first - 0.5) / rows) * 2, bottom: 1 - ((run.last + 1.5) / rows) * 2 };
}

function rowRuns(blocked: readonly boolean[], cols: number, row: number): { readonly start: number; readonly end: number }[] {
  const runs: { readonly start: number; readonly end: number }[] = [];
  let start: number = -1;
  for (let col: number = 0; col <= cols; col += 1) {
    const shut: boolean = col < cols && blocked[row * cols + col] === true;
    if (shut && start < 0) start = col;
    if (shut || start < 0) continue;
    runs.push({ start, end: col });
    start = -1;
  }
  return runs;
}

export function coverBoxes(blocked: readonly boolean[], cols: number, rows: number): ScreenBox[] {
  const done: CoverRun[] = [];
  let open: CoverRun[] = [];
  for (let row: number = 0; row < rows; row += 1) {
    const next: CoverRun[] = [];
    for (const run of rowRuns(blocked, cols, row)) {
      const above: CoverRun | undefined = open.find((held: CoverRun): boolean => held.start === run.start && held.end === run.end);
      if (above === undefined) {
        next.push({ start: run.start, end: run.end, first: row, last: row });
        continue;
      }
      above.last = row;
      next.push(above);
    }
    for (const held of open) if (!next.includes(held)) done.push(held);
    open = next;
  }
  done.push(...open);
  return done.map((run: CoverRun): ScreenBox => runBox(run, cols, rows));
}

export function createHudCovers(probe: HudProbe): HudCovers {
  const { cols, rows }: typeof HUD_COVERS = HUD_COVERS;
  const blocked: boolean[] = Array.from({ length: cols * rows }, (): boolean => false);
  let boxes: readonly ScreenBox[] = [];
  let row: number = 0;
  let seen: ScreenSize = { width: 0, height: 0 };
  const sample = (at: number, size: ScreenSize): boolean => {
    let changed: boolean = false;
    const y: number = ((at + 0.5) / rows) * size.height;
    for (let col: number = 0; col < cols; col += 1) {
      const shut: boolean = !probe.clickable(((col + 0.5) / cols) * size.width, y);
      if (blocked[at * cols + col] === shut) continue;
      blocked[at * cols + col] = shut;
      changed = true;
    }
    return changed;
  };
  return {
    covers: (): readonly ScreenBox[] => {
      const size: ScreenSize = probe.size();
      if (size.width <= 0 || size.height <= 0 || !probe.clickable(size.width / 2, size.height / 2)) return boxes;
      let changed: boolean = false;
      if (size.width !== seen.width || size.height !== seen.height) {
        seen = size;
        for (let at: number = 0; at < rows; at += 1) changed = sample(at, size) || changed;
        row = 0;
      } else {
        changed = sample(row, size);
        row = (row + 1) % rows;
      }
      if (changed) boxes = coverBoxes(blocked, cols, rows);
      return boxes;
    },
  };
}
