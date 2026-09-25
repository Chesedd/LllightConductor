import type { AudioTrack, IdGenerator, Project } from './project';
import type { TimelineTimeMs } from './timelineTime';
import { assertValidProject } from './projectValidation';

type Timestamp = Date | string;
export interface AudioImport { displayName: string; uri: string; durationMs: TimelineTimeMs; mediaType?: string }

export function setProjectAudio(project: Project, input: AudioImport, createId: IdGenerator, at: Timestamp): Project {
  const track: AudioTrack = { id: project.audio?.id ?? createId(), displayName: input.displayName.trim(), reference: { type: 'external-uri', uri: input.uri }, durationMs: input.durationMs, ...(input.mediaType ? { mediaType: input.mediaType } : {}) };
  if (!track.displayName) throw new Error('Audio filename is required');
  const result = { ...project, audio: track, updatedAt: typeof at === 'string' ? at : at.toISOString() };
  assertValidProject(result); return result;
}

export function removeProjectAudio(project: Project, at: Timestamp): Project {
  const result = { ...project, audio: null, updatedAt: typeof at === 'string' ? at : at.toISOString() };
  assertValidProject(result); return result;
}
