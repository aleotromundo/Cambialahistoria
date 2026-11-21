import type { FramePacer } from './paced-work.ts';

export const READBACK = {
  maxFrames: 120,
} as const;

export interface ReadbackGl {
  readonly PIXEL_PACK_BUFFER: number;
  readonly STREAM_READ: number;
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readonly SYNC_GPU_COMMANDS_COMPLETE: number;
  readonly ALREADY_SIGNALED: number;
  readonly CONDITION_SATISFIED: number;
  readonly WAIT_FAILED: number;
  createBuffer(): WebGLBuffer | null;
  deleteBuffer(buffer: WebGLBuffer | null): void;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, size: number, usage: number): void;
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, offset: number): void;
  getBufferSubData(target: number, srcByteOffset: number, dstBuffer: ArrayBufferView): void;
  fenceSync(condition: number, flags: number): WebGLSync | null;
  clientWaitSync(sync: WebGLSync, flags: number, timeout: number): number;
  deleteSync(sync: WebGLSync | null): void;
  flush(): void;
}

export interface PixelArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function readPixelsLater(gl: ReadbackGl, area: PixelArea, pacer: FramePacer): Promise<Uint8Array | null> {
  const size: number = area.width * area.height * 4;
  const buffer: WebGLBuffer | null = gl.createBuffer();
  if (buffer === null) return null;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
  gl.readPixels(area.x, area.y, area.width, area.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync: WebGLSync | null = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const finish = (pixels: Uint8Array | null): Uint8Array | null => {
    gl.deleteSync(sync);
    gl.deleteBuffer(buffer);
    return pixels;
  };
  if (sync === null) return finish(null);
  const poll = async (frame: number): Promise<Uint8Array | null> => {
    if (frame >= READBACK.maxFrames) return finish(null);
    const status: number = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.WAIT_FAILED) return finish(null);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
      await pacer.next();
      return poll(frame + 1);
    }
    const pixels: Uint8Array = new Uint8Array(size);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return finish(pixels);
  };
  return poll(0);
}

export function straightRows(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const out: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const rowBytes: number = width * 4;
  for (let row: number = 0; row < height; row += 1) {
    const from: number = (height - 1 - row) * rowBytes;
    const to: number = row * rowBytes;
    for (let at: number = 0; at < rowBytes; at += 4) {
      const alpha: number = pixels[from + at + 3] ?? 0;
      const scale: number = alpha === 0 ? 0 : 255 / alpha;
      out[to + at] = (pixels[from + at] ?? 0) * scale;
      out[to + at + 1] = (pixels[from + at + 1] ?? 0) * scale;
      out[to + at + 2] = (pixels[from + at + 2] ?? 0) * scale;
      out[to + at + 3] = alpha;
    }
  }
  return out;
}
