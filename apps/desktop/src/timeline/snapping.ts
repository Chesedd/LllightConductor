import { timelineTime, type TimelineTimeMs } from '../domain/timelineTime';

/** Snaps to the nearest grid line. Exact half-grid ties round toward the later time. */
export function snapTime(timeMs: number, gridMs: number): TimelineTimeMs {
  if (!Number.isSafeInteger(gridMs) || gridMs <= 0) throw new Error('Snap grid must be a positive integer.');
  const time = Math.max(0, Math.round(timeMs));
  const quotient = Math.floor(time / gridMs); const remainder = time % gridMs;
  return timelineTime((quotient + (remainder * 2 >= gridMs ? 1 : 0)) * gridMs);
}
