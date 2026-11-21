import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLB, outsideAddresses, scannedText } from './portal.ts';

const GLB_VERSION: number = 2;
const HEADER_BYTES: number = 12;
const CHUNK_HEADER_BYTES: number = 8;

function glb(json: unknown): Uint8Array {
  const text: Uint8Array = new TextEncoder().encode(JSON.stringify(json));
  const padded: number = Math.ceil(text.byteLength / 4) * 4;
  const bytes: Uint8Array = new Uint8Array(HEADER_BYTES + CHUNK_HEADER_BYTES + padded).fill(0x20, HEADER_BYTES + CHUNK_HEADER_BYTES);
  const view: DataView = new DataView(bytes.buffer);
  view.setUint32(0, GLB.magic, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(GLB.chunkLengthAt, padded, true);
  view.setUint32(GLB.chunkTypeAt, GLB.jsonChunk, true);
  bytes.set(text, GLB.jsonAt);
  return bytes;
}

const CREDITED: unknown = { asset: { version: '2.0', extras: { author: 'Someone (https://sketchfab.com/someone)', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)' } }, buffers: [{ byteLength: 4 }], images: [{ bufferView: 0, mimeType: 'image/png' }] };

void test('the credit a model carries in its metadata is never fetched, so a sealed build keeps it', (): void => {
  assert.deepEqual(outsideAddresses(scannedText('models/weapons/staff.glb', glb(CREDITED))), []);
});

void test('a model that would fetch a buffer or a picture from outside is still caught', (): void => {
  const fetching: unknown = { asset: { version: '2.0' }, buffers: [{ uri: 'https://cdn.example/mesh.bin', byteLength: 4 }], images: [{ uri: 'http://cdn.example/skin.png' }, { uri: 'data:image/png;base64,AA' }] };
  assert.deepEqual(outsideAddresses(scannedText('models/x.glb', glb(fetching))), ['https://cdn.example/mesh.bin', 'http://cdn.example/skin.png']);
});

void test('a file that is not a real model is read whole, whatever its name', (): void => {
  const fake: Uint8Array = new TextEncoder().encode('fetch("https://api.example/x")');
  assert.deepEqual(outsideAddresses(scannedText('models/fake.glb', fake)), ['https://api.example/x']);
  assert.deepEqual(outsideAddresses(scannedText('assets/a.js', fake)), ['https://api.example/x']);
});
