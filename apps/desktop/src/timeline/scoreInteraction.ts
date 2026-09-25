import { timelineTime, type TimelineTimeMs } from '../domain/timelineTime';
import type { LightInterval } from '../score/score';

export const CREATION_DRAG_THRESHOLD_PX = 4;
export type IntervalRange = { startMs: TimelineTimeMs; endMs: TimelineTimeMs };

export function calculateCreation(a: TimelineTimeMs, b: TimelineTimeMs, pixelDistance: number): IntervalRange | null {
  if (Math.abs(pixelDistance) < CREATION_DRAG_THRESHOLD_PX || a === b) return null;
  return { startMs: timelineTime(Math.min(a, b)), endMs: timelineTime(Math.max(a, b)) };
}

export function calculateMove(event: IntervalRange, requestedStart: TimelineTimeMs, durationMs?: TimelineTimeMs): IntervalRange {
  const duration = event.endMs - event.startMs; const maximum = durationMs === undefined ? Number.MAX_SAFE_INTEGER : Math.max(0, durationMs - duration);
  const startMs = timelineTime(Math.min(Math.max(0, requestedStart), maximum));
  return { startMs, endMs: timelineTime(startMs + duration) };
}

export function calculateResize(event: IntervalRange, edge: 'start' | 'end', value: TimelineTimeMs, durationMs?: TimelineTimeMs): IntervalRange | null {
  const bounded = timelineTime(Math.min(value, durationMs ?? Number.MAX_SAFE_INTEGER));
  const candidate = edge === 'start' ? { ...event, startMs: bounded } : { ...event, endMs: bounded };
  return candidate.endMs > candidate.startMs ? candidate : null;
}

export function hasIntervalCollision(events: readonly LightInterval[], channelId: string, range: IntervalRange, ignoredId?: string): boolean {
  return events.some(event => event.id !== ignoredId && event.channelId === channelId && range.startMs < event.endMs && event.startMs < range.endMs);
}
