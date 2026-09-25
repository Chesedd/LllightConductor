import type { ChannelId, EntityId } from '../domain/project';
import type { TimelineTimeMs } from '../domain/timelineTime';

export const CURRENT_SCORE_VERSION = 1 as const;

export interface LightInterval {
  id: EntityId;
  kind: 'light-interval';
  channelId: ChannelId;
  /** Inclusive start on the shared project timeline. */
  startMs: TimelineTimeMs;
  /** Exclusive end on the shared project timeline. */
  endMs: TimelineTimeMs;
}

/** A discriminated union so additional authoring event kinds can be added explicitly. */
export type ScoreEvent = LightInterval;

export interface Score {
  version: typeof CURRENT_SCORE_VERSION;
  events: ScoreEvent[];
}

export const emptyScore = (): Score => ({ version: CURRENT_SCORE_VERSION, events: [] });

/** Deterministic persistence/test order; array order is not score semantics. */
export const orderScoreEvents = (events: readonly ScoreEvent[]): ScoreEvent[] =>
  [...events].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id));
