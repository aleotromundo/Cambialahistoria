import type { FlaskDef } from '../../sim/content/flasks.ts';
import type { FlaskOffer } from '../../sim/world/flask-tiers.ts';
import { tieredFlask } from '../../sim/world/flask-tiers.ts';
import { flaskRestores } from '../../sim/world/flasks.ts';
import { goldShortText } from './gold-short.ts';

export type FlaskOfferState = FlaskOffer['kind'];

export interface FlaskOfferView {
  readonly state: FlaskOfferState;
  readonly name: string;
  readonly tier: string;
  readonly next: string;
  readonly need: string;
  readonly price: number | null;
}

const RESOURCE_WORD: Readonly<Record<FlaskDef['resource'], string>> = { life: 'life', mana: 'mana' };

function seconds(value: number): string {
  return `${Number(value.toFixed(1))} s`;
}

function restoreText(def: FlaskDef, maximum: number): string {
  return `${Math.round(flaskRestores(def, maximum))} ${RESOURCE_WORD[def.resource]} over ${seconds(def.duration)}`;
}

function chargesText(now: FlaskDef, next: FlaskDef): string {
  const parts: string[] = [];
  if (next.maxCharges !== now.maxCharges) parts.push(`${next.maxCharges} cargas`);
  if (next.chargesPerKill !== now.chargesPerKill) parts.push(`${next.chargesPerKill} por baja`);
  return parts.length === 0 ? '' : `, ${parts.join(', ')}`;
}

function tierText(base: FlaskDef, tier: number): string {
  return tier === 0 ? `Base, ${base.tiers.length} mejoras` : `Nivel ${tier} de ${base.tiers.length}`;
}

export function flaskOfferView(base: FlaskDef, offer: FlaskOffer, maximum: number, gold: number): FlaskOfferView {
  const now: FlaskDef = tieredFlask(base, offer.tier);
  const shared: Pick<FlaskOfferView, 'name' | 'tier' | 'state'> = { name: base.name, tier: tierText(base, offer.tier), state: offer.kind };
  if (offer.kind === 'top') return { ...shared, next: `Restaura ${restoreText(now, maximum)}`, need: 'Al máximo', price: null };
  const next: FlaskDef = tieredFlask(base, offer.tier + 1);
  const line: string = `Restaura ${restoreText(next, maximum)}${chargesText(now, next)} (ahora ${restoreText(now, maximum)})`;
  return { ...shared, next: line, need: needText(offer, gold), price: offer.next.price };
}

function needText(offer: Exclude<FlaskOffer, { readonly kind: 'top' }>, gold: number): string {
  let need: string;
  switch (offer.kind) {
    case 'locked':
      need = `Requiere nivel ${offer.next.level}`;
      break;
    case 'short':
      need = goldShortText(offer.next.price, gold);
      break;
    case 'ready':
      need = 'Mejora disponible';
      break;
  }
  return need;
}
