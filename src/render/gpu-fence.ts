export interface FenceContext {
  readonly SYNC_GPU_COMMANDS_COMPLETE: number;
  readonly SYNC_STATUS: number;
  readonly SIGNALED: number;
  readonly UNSIGNALED: number;
  isContextLost(): boolean;
  fenceSync(condition: number, flags: number): WebGLSync | null;
  getSyncParameter(sync: WebGLSync, pname: number): unknown;
  deleteSync(sync: WebGLSync | null): void;
  flush(): void;
}

export interface GpuQueue {
  mark(): number;
  finished(ticket: number): boolean;
  waiting(): number;
}

export function createGpuQueue(context: FenceContext | null): GpuQueue {
  const open: WebGLSync[] = [];
  let placed: number = 0;
  let completed: number = 0;
  const drain = (): void => {
    if (context === null) return;
    if (context.isContextLost()) {
      open.length = 0;
      completed = placed;
      return;
    }
    while (open.length > 0) {
      const oldest: WebGLSync | undefined = open[0];
      if (oldest === undefined || context.getSyncParameter(oldest, context.SYNC_STATUS) === context.UNSIGNALED) break;
      context.deleteSync(oldest);
      open.shift();
      completed += 1;
    }
  };
  return {
    mark(): number {
      if (context === null) return completed;
      const sync: WebGLSync | null = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (sync === null) {
        drain();
        return completed;
      }
      open.push(sync);
      placed += 1;
      context.flush();
      return placed;
    },
    finished(ticket: number): boolean {
      drain();
      return completed >= ticket;
    },
    waiting(): number {
      drain();
      return open.length;
    },
  };
}
