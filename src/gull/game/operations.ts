/** The operations the game can run: how each is built, and the day it happens on. */
import { FreeFlight } from './free';
import { M1_CONDITIONS, Mission1 } from './m1';
import { M2_CONDITIONS, Mission2 } from './m2';
import type { Mission, MissionConditions } from './mission';
import type { World } from './world';

export const OPERATION_IDS = ['m1', 'm2', 'free'] as const;
export type OperationId = (typeof OPERATION_IDS)[number];

export function conditionsFor(id: string): MissionConditions {
  return id === 'm2' ? M2_CONDITIONS : M1_CONDITIONS;
}

/** Build an operation in `world` (whose water level is already that of its day). */
export function createMission(id: string, world: World, seed?: number): Mission {
  if (id === 'm1') return new Mission1(world, seed).init();
  if (id === 'm2') return new Mission2(world, seed).init();
  return new FreeFlight(world).init();
}
