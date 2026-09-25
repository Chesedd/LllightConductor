import type { ProvisionalScore } from '../score/score';

export const CURRENT_PROJECT_SCHEMA_VERSION = 1 as const;

export type EntityId = string;
export type ProjectId = EntityId;
export type CostumeId = EntityId;
export type ControllerId = EntityId;
export type ChannelId = EntityId;

export type MasterControllerType = 'esp32' | `custom:${string}`;
export type SlaveControllerType = 'raspberry-pi-pico' | `custom:${string}`;
export type OutputChannelType = 'el-wire' | 'digital-output' | 'addressable-led' | `custom:${string}`;

export interface OutputChannel {
  id: ChannelId;
  displayName: string;
  type: OutputChannelType;
  /** Opaque identifier meaningful to this slave (for example, an output label). */
  hardwareOutputIdentifier: string;
}

export interface SlaveController {
  id: ControllerId;
  displayName: string;
  type: SlaveControllerType;
  /** Logical topology address; it deliberately does not prescribe a wire protocol. */
  logicalAddress?: number;
  channels: OutputChannel[];
}

export interface MasterController {
  id: ControllerId;
  displayName: string;
  type: MasterControllerType;
  slaves: SlaveController[];
}

export interface Costume {
  id: CostumeId;
  name: string;
  master: MasterController;
}

export type AudioReference =
  | { type: 'project-asset'; assetName: string }
  | { type: 'external-uri'; uri: string };

export interface AudioTrack {
  id: EntityId;
  displayName: string;
  reference: AudioReference;
  durationMs?: number;
  mediaType?: string;
}

/** A persisted identity association only. Discovery/connection state is runtime data. */
export interface DeviceBinding {
  id: EntityId;
  logicalControllerId: ControllerId;
  physicalDevice: { type: string; hardwareId: string };
}

export interface Project {
  schemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  id: ProjectId;
  name: string;
  createdAt: string;
  updatedAt: string;
  audio: AudioTrack | null;
  costumes: Costume[];
  score: ProvisionalScore;
  deviceBindings: DeviceBinding[];
}

export type IdGenerator = () => EntityId;
export const createStableId: IdGenerator = () => crypto.randomUUID();
