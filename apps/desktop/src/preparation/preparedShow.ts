import type { RuntimeState } from '../runtime/runtimeScore';

export const PREPARED_SHOW_VERSION = 1 as const;
export interface PreparedOutputUpdateV1 { outputId: number; state: RuntimeState }
export interface PreparedSlaveBatchV1 { slaveAddress: number; updates: PreparedOutputUpdateV1[] }
export interface PreparedFrameV1 { timeMs: number; slaveBatches: PreparedSlaveBatchV1[] }
export interface PreparedMasterShowV1 { masterId: string; costumeId: string; durationMs: number; frames: PreparedFrameV1[] }
export interface PreparedShowBundleV1 { version: typeof PREPARED_SHOW_VERSION; masters: PreparedMasterShowV1[] }
