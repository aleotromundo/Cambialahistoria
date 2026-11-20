export const FRAME_PACE = {
  earlyMs: 4,
} as const;

export interface FramePace {
  due(now: number): boolean;
  setRate(fps: number | null): void;
}

export function createFramePace(initial: number | null): FramePace {
  let interval: number | null = initial === null || !(initial > 0) ? null : 1000 / initial;
  let next: number | null = null;
  return {
    due(now: number): boolean {
      if (interval === null) return true;
      if (next === null || now - next > interval) {
        next = now + interval;
        return true;
      }
      if (now < next - FRAME_PACE.earlyMs) return false;
      next = Math.max(next + interval, now + interval - FRAME_PACE.earlyMs);
      return true;
    },
    setRate(fps: number | null): void {
      const wanted: number | null = fps === null || !(fps > 0) ? null : 1000 / fps;
      if (wanted === interval) return;
      interval = wanted;
      next = null;
    },
  };
}
