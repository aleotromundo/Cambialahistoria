export interface HeldProgram {
  usedTimes: number;
}

export interface ProgramOwner {
  readonly info: { readonly programs: readonly HeldProgram[] | null };
}

interface Seen {
  readonly length: number;
  readonly tail: HeldProgram | undefined;
}

const held: WeakSet<HeldProgram> = new WeakSet<HeldProgram>();
const seen: WeakMap<ProgramOwner, Seen> = new WeakMap<ProgramOwner, Seen>();

export function holdPrograms(owner: ProgramOwner): number {
  const programs: readonly HeldProgram[] = owner.info.programs ?? [];
  const tail: HeldProgram | undefined = programs.at(-1);
  const last: Seen | undefined = seen.get(owner);
  if (last !== undefined && last.length === programs.length && last.tail === tail) return 0;
  seen.set(owner, { length: programs.length, tail });
  let added: number = 0;
  for (const program of programs) {
    if (held.has(program)) continue;
    held.add(program);
    program.usedTimes += 1;
    added += 1;
  }
  return added;
}
