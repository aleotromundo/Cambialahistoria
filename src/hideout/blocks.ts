import type { BlockResult, BlocksResult } from '../backend/hideout-api.ts';

export interface BlocksState {
  readonly names: ReadonlySet<string>;
  readonly available: boolean;
  readonly loaded: boolean;
}

export const NO_BLOCKS: BlocksState = { names: new Set<string>(), available: true, loaded: false };

function keyOf(name: string): string {
  return name.trim().toLowerCase().replaceAll(' ', '');
}

export function isBlocked(state: BlocksState, name: string): boolean {
  return state.names.has(keyOf(name));
}

export function blocksFetched(state: BlocksState, result: BlocksResult): BlocksState {
  switch (result.kind) {
    case 'ok':
      return { names: new Set<string>(result.names.map(keyOf)), available: true, loaded: true };
    case 'unsupported':
      return { names: new Set<string>(), available: false, loaded: true };
    case 'failed':
      return state;
  }
  return state;
}

export function blockSettled(state: BlocksState, name: string, result: BlockResult): BlocksState {
  switch (result.kind) {
    case 'ok': {
      const names: Set<string> = new Set<string>(state.names);
      if (result.blocked) names.add(keyOf(name));
      else names.delete(keyOf(name));
      return { ...state, names };
    }
    case 'unsupported':
      return { names: new Set<string>(), available: false, loaded: true };
    case 'refused':
    case 'failed':
      return state;
  }
  return state;
}

export function blockText(result: BlockResult, name: string, blocking: boolean): string | null {
  switch (result.kind) {
    case 'ok':
      return null;
    case 'unsupported':
      return 'Bloquear no está disponible acá.';
    case 'failed':
      return blocking ? `${name} no pudo ser bloqueado.` : `${name} no pudo ser desbloqueado.`;
    case 'refused':
      switch (result.reason) {
        case 'own_name':
          return 'Ese es uno de tus propios personajes.';
        case 'no_such_character':
          return `No existe nadie llamado ${name}.`;
        case 'block_limit':
          return 'Tu lista de bloqueados está llena.';
      }
  }
  return null;
}
