import livesCss from './duel-lives.css?inline';
import type { LifeRow, LifeStanding } from './duel-lives.ts';

export const DUEL_LIVES_VIEW = {
  shownClass: 'on',
  hudClass: 'duel-watching',
  verdictRoom: 52,
  measureEvery: 30,
  standings: ['won', 'down', 'time'],
  sides: 2,
} as const;

export interface TagSpot {
  readonly x: number;
  readonly y: number;
  readonly seen: boolean;
}

export interface DuelLivesView {
  readonly panel: HTMLElement;
  show(rows: readonly LifeRow[], verdict: string | null): void;
  place(spots: readonly TagSpot[]): void;
  cover(): number;
}

interface SeatView {
  readonly box: HTMLDivElement;
  readonly name: HTMLSpanElement;
  readonly result: HTMLSpanElement;
  readonly trail: HTMLDivElement;
  readonly fill: HTMLDivElement;
  readonly tag: HTMLDivElement;
  fraction: number;
  standing: LifeStanding | null;
  named: string;
  tagShown: boolean;
}

function part<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const made: HTMLElementTagNameMap[K] = document.createElement(tag);
  made.className = className;
  return made;
}

function showLater(element: HTMLElement): void {
  window.requestAnimationFrame((): void => {
    element.classList.add(DUEL_LIVES_VIEW.shownClass);
  });
}

function seatView(side: number, panel: HTMLDivElement, parent: HTMLElement): SeatView {
  const box: HTMLDivElement = part('div', `duel-life side-${side}`);
  const head: HTMLDivElement = part('div', 'duel-life-head');
  const name: HTMLSpanElement = part('span', 'duel-life-name');
  const result: HTMLSpanElement = part('span', 'duel-life-result');
  head.append(name, result);
  const track: HTMLDivElement = part('div', 'duel-life-track');
  const trail: HTMLDivElement = part('div', 'duel-life-trail');
  const fill: HTMLDivElement = part('div', 'duel-life-fill');
  track.append(trail, fill);
  box.append(head, track);
  panel.append(box);
  const tag: HTMLDivElement = part('div', `duel-tag side-${side}`);
  parent.append(tag);
  return { box, name, result, trail, fill, tag, fraction: 1, standing: null, named: '', tagShown: false };
}

function scaled(fraction: number): string {
  return `scaleX(${fraction.toFixed(4)})`;
}

function showSeat(seat: SeatView, row: LifeRow): void {
  if (row.name !== seat.named) {
    seat.named = row.name;
    seat.name.textContent = row.name;
    seat.tag.textContent = row.tag;
  }
  if (row.fraction !== seat.fraction) {
    seat.fraction = row.fraction;
    seat.fill.style.transform = scaled(row.fraction);
    seat.trail.style.transform = scaled(row.fraction);
  }
  if (row.standing === seat.standing) return;
  seat.standing = row.standing;
  for (const standing of DUEL_LIVES_VIEW.standings) seat.box.classList.toggle(standing, standing === row.standing);
  seat.tag.classList.toggle('down', row.standing === 'down');
  if (row.result === '') {
    seat.result.classList.remove(DUEL_LIVES_VIEW.shownClass);
    return;
  }
  seat.result.textContent = row.result;
  showLater(seat.result);
}

export function createDuelLivesView(parent: HTMLElement): DuelLivesView {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = livesCss;
  document.head.append(style);
  const panel: HTMLDivElement = part('div', 'duel-lives');
  parent.append(panel);
  parent.classList.add(DUEL_LIVES_VIEW.hudClass);
  const seats: SeatView[] = [];
  for (let side: number = 0; side < DUEL_LIVES_VIEW.sides; side += 1) seats.push(seatView(side, panel, parent));
  const verdictLine: HTMLDivElement = part('div', 'duel-verdict');
  verdictLine.setAttribute('role', 'status');
  panel.append(verdictLine);
  let verdictShown: string | null = null;
  let opened: boolean = false;
  let covered: number = 0;
  let sinceMeasure: number = DUEL_LIVES_VIEW.measureEvery;
  return {
    panel,
    cover: (): number => {
      sinceMeasure += 1;
      if (sinceMeasure >= DUEL_LIVES_VIEW.measureEvery) {
        sinceMeasure = 0;
        const height: number = window.innerHeight;
        covered = height > 0 ? (panel.offsetTop + panel.offsetHeight + DUEL_LIVES_VIEW.verdictRoom) / (height / 2) : 0;
      }
      return covered;
    },
    show: (rows: readonly LifeRow[], verdict: string | null): void => {
      for (const row of rows) {
        const seat: SeatView | undefined = seats[row.side];
        if (seat !== undefined) showSeat(seat, row);
      }
      if (!opened) {
        opened = true;
        showLater(panel);
      }
      if (verdict === verdictShown) return;
      verdictShown = verdict;
      if (verdict === null) {
        verdictLine.classList.remove(DUEL_LIVES_VIEW.shownClass);
        return;
      }
      verdictLine.textContent = verdict;
      showLater(verdictLine);
    },
    place: (spots: readonly TagSpot[]): void => {
      spots.forEach((spot: TagSpot, side: number): void => {
        const seat: SeatView | undefined = seats[side];
        if (seat === undefined) return;
        if (spot.seen) seat.tag.style.transform = `translate3d(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        if (spot.seen === seat.tagShown) return;
        seat.tagShown = spot.seen;
        seat.tag.classList.toggle(DUEL_LIVES_VIEW.shownClass, spot.seen);
      });
    },
  };
}
