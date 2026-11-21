import type { PolicyFile } from '../../sim/rl/policy-file.ts';
import { policyFits, readPolicyFile } from '../../sim/rl/policy-file.ts';
import { createPolicyNet } from '../../sim/rl/policy-net.ts';
import type { RivalPilot } from '../../sim/rl/rival.ts';
import { netPilot } from '../../sim/rl/rival.ts';
import { assetUrl } from '../render/asset-url.ts';

export const RIVAL_MODEL = {
  path: 'models/rl/duel-pilot.bin',
} as const;

export function rivalPilotFrom(bytes: Uint8Array): RivalPilot {
  const file: PolicyFile = readPolicyFile(bytes);
  if (!policyFits(file)) throw new Error(`the rival's model was trained for contract ${file.contract.fingerprint}, not the one the game speaks`);
  return netPilot(createPolicyNet(file));
}

export async function fetchRivalPilot(): Promise<RivalPilot> {
  const response: Response = await fetch(assetUrl(RIVAL_MODEL.path));
  if (!response.ok) throw new Error(`the rival's model answered ${response.status}`);
  return rivalPilotFrom(new Uint8Array(await response.arrayBuffer()));
}
