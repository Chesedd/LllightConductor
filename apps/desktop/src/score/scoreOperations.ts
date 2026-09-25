import type { ChannelId, EntityId, IdGenerator, Project } from '../domain/project';
import type { TimelineTimeMs } from '../domain/timelineTime';
import { assertValidProject } from '../domain/projectValidation';
import type { LightInterval } from './score';
import { orderScoreEvents } from './score';

type Timestamp = Date | string;
export type ScoreOperationErrorCode = 'event-not-found' | 'channel-not-found' | 'unsupported-channel-type' | 'invalid-time' | 'audio-bounds' | 'overlap';

export class ScoreOperationError extends Error {
  constructor(
    readonly code: ScoreOperationErrorCode,
    message: string,
    readonly details: { channelId?: ChannelId; conflictingEventId?: EntityId; attemptedInterval?: { startMs: TimelineTimeMs; endMs: TimelineTimeMs } } = {},
  ) { super(message); this.name = 'ScoreOperationError'; }
}

const timestamp = (value: Timestamp) => typeof value === 'string' ? value : value.toISOString();
const channel = (project: Project, channelId: ChannelId) => project.costumes.flatMap(costume => costume.master.slaves).flatMap(slave => slave.channels).find(item => item.id === channelId);

function validateAttempt(project: Project, candidate: LightInterval, ignoredId?: EntityId): void {
  const attemptedInterval = { startMs: candidate.startMs, endMs: candidate.endMs };
  if (!Number.isSafeInteger(candidate.startMs) || !Number.isSafeInteger(candidate.endMs) || candidate.startMs < 0 || candidate.endMs <= candidate.startMs) {
    throw new ScoreOperationError('invalid-time', 'Interval must use non-negative integer milliseconds and have a positive duration.', { channelId: candidate.channelId, attemptedInterval });
  }
  const output = channel(project, candidate.channelId);
  if (!output) throw new ScoreOperationError('channel-not-found', 'Interval channel does not exist.', { channelId: candidate.channelId, attemptedInterval });
  if (output.type !== 'el-wire' && output.type !== 'digital-output') throw new ScoreOperationError('unsupported-channel-type', 'Channel type does not support light intervals.', { channelId: candidate.channelId, attemptedInterval });
  if (project.audio?.durationMs !== undefined && candidate.endMs > project.audio.durationMs) throw new ScoreOperationError('audio-bounds', 'Interval exceeds the audio duration.', { channelId: candidate.channelId, attemptedInterval });
  const conflict = project.score.events.find(event => event.id !== ignoredId && event.channelId === candidate.channelId && candidate.startMs < event.endMs && event.startMs < candidate.endMs);
  if (conflict) throw new ScoreOperationError('overlap', 'Interval overlaps another event on the same channel.', { channelId: candidate.channelId, conflictingEventId: conflict.id, attemptedInterval });
}

function validateBatch(project: Project, candidates: readonly LightInterval[], ignoredIds: ReadonlySet<EntityId>): void {
  const base = project.score.events.filter(event => !ignoredIds.has(event.id));
  const staged: LightInterval[] = [];
  for (const candidate of candidates) {
    validateAttempt({ ...project, score: { ...project.score, events: [...base, ...staged] } }, candidate);
    staged.push(candidate);
  }
}

function replace(project: Project, event: LightInterval, at: Timestamp): Project {
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: orderScoreEvents(project.score.events.map(value => value.id === event.id ? event : value)) } };
  assertValidProject(result);
  return result;
}

export function createLightInterval(project: Project, input: { channelId: ChannelId; startMs: TimelineTimeMs; endMs: TimelineTimeMs }, createId: IdGenerator, at: Timestamp): Project {
  const event: LightInterval = { id: createId(), kind: 'light-interval', ...input };
  validateAttempt(project, event);
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: orderScoreEvents([...project.score.events, event]) } };
  assertValidProject(result);
  return result;
}

export function removeScoreEvent(project: Project, eventId: EntityId, at: Timestamp): Project {
  if (!project.score.events.some(event => event.id === eventId)) throw new ScoreOperationError('event-not-found', 'Score event does not exist.');
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: project.score.events.filter(event => event.id !== eventId) } };
  assertValidProject(result);
  return result;
}

export function removeScoreEvents(project: Project, eventIds: readonly EntityId[], at: Timestamp): Project {
  const ids = new Set(eventIds);
  if (!ids.size || [...ids].some(id => !project.score.events.some(event => event.id === id))) throw new ScoreOperationError('event-not-found', 'Score event does not exist.');
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: project.score.events.filter(event => !ids.has(event.id)) } };
  assertValidProject(result); return result;
}

export function moveScoreEvents(project: Project, eventIds: readonly EntityId[], deltaMs: TimelineTimeMs, at: Timestamp): Project {
  const ids = new Set(eventIds); const selected = project.score.events.filter(event => ids.has(event.id));
  if (!ids.size || selected.length !== ids.size) throw new ScoreOperationError('event-not-found', 'Score event does not exist.');
  const candidates = selected.map(event => ({ ...event, startMs: event.startMs + deltaMs as TimelineTimeMs, endMs: event.endMs + deltaMs as TimelineTimeMs }));
  validateBatch(project, candidates, ids);
  const replacements = new Map(candidates.map(event => [event.id, event]));
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: orderScoreEvents(project.score.events.map(event => replacements.get(event.id) ?? event)) } };
  assertValidProject(result); return result;
}

export function addScoreEvents(project: Project, inputs: readonly Omit<LightInterval, 'id' | 'kind'>[], createId: IdGenerator, at: Timestamp): { project: Project; eventIds: EntityId[] } {
  const events: LightInterval[] = inputs.map(input => ({ id: createId(), kind: 'light-interval', ...input }));
  validateBatch(project, events, new Set());
  const result: Project = { ...project, updatedAt: timestamp(at), score: { ...project.score, events: orderScoreEvents([...project.score.events, ...events]) } };
  assertValidProject(result); return { project: result, eventIds: events.map(event => event.id) };
}

export function moveLightInterval(project: Project, eventId: EntityId, startMs: TimelineTimeMs, at: Timestamp): Project {
  const current = project.score.events.find(event => event.id === eventId);
  if (!current) throw new ScoreOperationError('event-not-found', 'Score event does not exist.');
  const candidate = { ...current, startMs, endMs: startMs + (current.endMs - current.startMs) };
  validateAttempt(project, candidate, eventId);
  return replace(project, candidate, at);
}

export function resizeLightInterval(project: Project, eventId: EntityId, input: { startMs?: TimelineTimeMs; endMs?: TimelineTimeMs }, at: Timestamp): Project {
  const current = project.score.events.find(event => event.id === eventId);
  if (!current) throw new ScoreOperationError('event-not-found', 'Score event does not exist.');
  const candidate = { ...current, startMs: input.startMs ?? current.startMs, endMs: input.endMs ?? current.endMs };
  validateAttempt(project, candidate, eventId);
  return replace(project, candidate, at);
}
