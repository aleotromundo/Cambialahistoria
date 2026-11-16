export type ClickKind = 'move' | 'talk' | 'skill' | 'pickup' | 'open' | 'use' | 'portal' | 'exit' | 'player' | 'advance' | 'swallowed' | 'none';

export type PersonPick = 'none' | 'body' | 'label';

export interface ClickFacts {
  readonly fresh: boolean;
  readonly player: boolean;
  readonly dialogue: boolean;
  readonly ground: boolean;
  readonly target: boolean;
  readonly shift: boolean;
  readonly person: PersonPick;
  readonly item: boolean;
  readonly chest: boolean;
  readonly station: boolean;
  readonly portal: boolean;
  readonly heldExit: boolean;
  readonly exit: boolean;
  readonly travelling: boolean;
}

export interface ClickResolution {
  readonly kind: ClickKind;
  readonly reason: string | null;
}

export interface InputReading {
  readonly click: ClickResolution | null;
  readonly held: readonly string[];
  readonly inside: boolean;
  readonly overUi: boolean;
}

export function resolveClick(facts: ClickFacts): ClickResolution {
  if (facts.player) return { kind: 'player', reason: 'another player under pointer or their menu open' };
  if (facts.dialogue) return { kind: 'advance', reason: 'dialogue open' };
  if (!facts.ground) return { kind: 'none', reason: 'no ground under pointer' };
  if (facts.target) return { kind: 'skill', reason: 'monster under pointer' };
  if (facts.shift) return { kind: 'skill', reason: 'shift held' };
  switch (facts.person) {
    case 'body':
      return { kind: 'talk', reason: 'person under pointer' };
    case 'label':
      return { kind: 'talk', reason: 'label hover' };
    case 'none':
      break;
  }
  if (facts.item) return { kind: 'pickup', reason: facts.fresh ? 'item under pointer' : 'item press held' };
  if (facts.chest) return { kind: 'open', reason: 'chest under pointer' };
  if (facts.station) return { kind: 'use', reason: 'station under pointer' };
  if (facts.portal) return { kind: 'portal', reason: 'portal under pointer' };
  if (!facts.fresh && facts.heldExit) return { kind: 'swallowed', reason: 'exit press held' };
  if (facts.exit && facts.fresh) return { kind: 'exit', reason: 'exit under pointer' };
  if (facts.exit && facts.travelling) return { kind: 'none', reason: 'already travelling' };
  if (facts.exit) return { kind: 'move', reason: 'held over exit' };
  return { kind: 'move', reason: null };
}

export function describeInput(reading: InputReading): string {
  const click: string = reading.click === null ? 'no click yet' : `click ${reading.click.kind}${reading.click.reason === null ? '' : `: ${reading.click.reason}`}`;
  const held: string = reading.held.length === 0 ? 'none' : reading.held.join('+');
  return `${click} · held ${held} · ${reading.inside ? 'in canvas' : 'off canvas'}${reading.overUi ? ' · over UI' : ''}`;
}
