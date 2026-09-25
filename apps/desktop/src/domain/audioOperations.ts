import type { AudioTrack, IdGenerator, Project } from './project';
import type { TimelineTimeMs } from './timelineTime';
import { assertValidProject } from './projectValidation';

type Timestamp = Date | string;
export interface AudioImport { displayName: string; uri: string; durationMs: TimelineTimeMs; mediaType?: string }

export class AudioDurationConflictError extends Error {
  readonly code = 'audio-duration-conflict';
  constructor(readonly durationMs: TimelineTimeMs, readonly maximumScoreEndMs: TimelineTimeMs) { super('Audio duration is shorter than the existing score.'); this.name = 'AudioDurationConflictError'; }
}

export function setProjectAudio(project: Project, input: AudioImport, createId: IdGenerator, at: Timestamp): Project {
  const maximumScoreEndMs = project.score.events.reduce((maximum, event) => Math.max(maximum, event.endMs), 0);
  if (input.durationMs < maximumScoreEndMs) throw new AudioDurationConflictError(input.durationMs, maximumScoreEndMs);
  const track: AudioTrack = { id: project.audio?.id ?? createId(), displayName: input.displayName.trim(), reference: { type: 'external-uri', uri: input.uri }, durationMs: input.durationMs, ...(input.mediaType ? { mediaType: input.mediaType } : {}) };
  if (!track.displayName) throw new Error('Audio filename is required');
  const result = { ...project, audio: track, updatedAt: typeof at === 'string' ? at : at.toISOString() };
  assertValidProject(result); return result;
}

export function removeProjectAudio(project: Project, at: Timestamp): Project {
  const result = { ...project, audio: null, updatedAt: typeof at === 'string' ? at : at.toISOString() };
  assertValidProject(result); return result;
}
