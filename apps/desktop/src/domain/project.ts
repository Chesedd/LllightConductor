import type { Score } from '../score/score';

export type ProjectId = string;
export type DeviceKind = 'esp32-master' | 'pico-slave' | `custom:${string}`;
export type ChannelKind = 'el-wire' | `custom:${string}`;

export interface OutputChannel { id: string; name: string; kind: ChannelKind }
export interface DeviceNode { id: string; name: string; kind: DeviceKind; channels: OutputChannel[]; children: DeviceNode[] }
export interface Costume { id: string; name: string; controller: DeviceNode | null }
export interface AudioTrack { sourcePath: string; displayName: string; durationMs?: number }
export interface Project {
  id: ProjectId;
  name: string;
  createdAt: string;
  updatedAt: string;
  audio: AudioTrack | null;
  costumes: Costume[];
  score: Score;
}
