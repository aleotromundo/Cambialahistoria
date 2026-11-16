import { Vector2 } from 'three';
import type { IsoCamera } from './iso-camera.ts';
import { place } from './overlay-place.ts';

export const FLOATING_NUMBERS = {
  numberLife: 1,
  numberDrift: 26,
  numberPool: 48,
} as const;

interface NumberNode {
  readonly element: HTMLDivElement;
  readonly inner: HTMLSpanElement;
}

interface FloatingNumber {
  readonly node: NumberNode;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  age: number;
}

export interface FloatingNumbers {
  readonly float: (text: string, kind: string, x: number, y: number, z: number) => void;
  readonly update: (dt: number) => void;
}

export function createFloatingNumbers(layer: HTMLElement, camera: IsoCamera): FloatingNumbers {
  const numbers: FloatingNumber[] = [];
  const spareNumbers: NumberNode[] = [];
  const point: Vector2 = new Vector2();

  const numberNode = (): NumberNode => {
    const spare: NumberNode | undefined = spareNumbers.pop();
    if (spare !== undefined) {
      spare.element.style.transform = '';
      return spare;
    }
    const element: HTMLDivElement = document.createElement('div');
    const inner: HTMLSpanElement = document.createElement('span');
    element.append(inner);
    return { element, inner };
  };

  const float = (text: string, kind: string, x: number, y: number, z: number): void => {
    const node: NumberNode = numberNode();
    node.element.className = `damage-number ${kind}`;
    node.inner.textContent = text;
    node.inner.style.setProperty('--drift', `${((Math.random() - 0.5) * 2 * FLOATING_NUMBERS.numberDrift).toFixed(0)}px`);
    layer.append(node.element);
    numbers.push({ node, x, y, z, age: 0 });
  };

  const update = (dt: number): void => {
    for (let index: number = numbers.length - 1; index >= 0; index -= 1) {
      const number: FloatingNumber | undefined = numbers[index];
      if (number === undefined) continue;
      number.age += dt;
      if (number.age > FLOATING_NUMBERS.numberLife) {
        number.node.element.remove();
        if (spareNumbers.length < FLOATING_NUMBERS.numberPool) spareNumbers.push(number.node);
        numbers.splice(index, 1);
        continue;
      }
      camera.project(number.x, number.y, number.z, point);
      place(number.node.element, point);
    }
  };

  return { float, update };
}
