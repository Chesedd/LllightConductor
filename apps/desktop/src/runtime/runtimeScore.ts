export const RUNTIME_SCORE_VERSION = 1 as const;

export type RuntimeState = 'ON' | 'OFF';

export interface RuntimeTransition {
  slaveId: string;
  slaveLogicalAddress: number;
  channelId: string;
  hardwareOutputIdentifier: string;
  state: RuntimeState;
}

export interface RuntimeFrame { timeMs: number; transitions: RuntimeTransition[] }

export interface CompiledMasterScore {
  masterId: string;
  costumeId: string;
  frames: RuntimeFrame[];
}

/** Runtime Score v1 is a snapshot. Players reset every controlled output OFF before frame 0. */
export interface CompiledShowV1 {
  version: typeof RUNTIME_SCORE_VERSION;
  durationMs: number;
  masters: CompiledMasterScore[];
}

