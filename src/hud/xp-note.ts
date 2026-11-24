import type { XpReduction } from '../../sim/content/types.ts';

const LINES: Readonly<Record<XpReduction['side'], string>> = {
  below: 'Experiencia reducida: este lugar está muy por debajo de tu nivel',
  above: 'Experiencia reducida: este lugar está muy por encima de tu nivel',
};

export function reducedLine(reduced: XpReduction | null): string | null {
  return reduced === null ? null : LINES[reduced.side];
}
