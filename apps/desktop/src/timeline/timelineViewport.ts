import { formatTimelineTime, timelineTime, type TimelineTimeMs } from '../domain/timelineTime';

export const MIN_PIXELS_PER_SECOND = 8;
export const MAX_PIXELS_PER_SECOND = 2_000;
export interface TimelineViewport { pixelsPerSecond: number; scrollLeft: number }

export function timeToX(time: TimelineTimeMs, viewport: TimelineViewport): number { return time / 1_000 * viewport.pixelsPerSecond - viewport.scrollLeft; }
export function xToTime(x: number, viewport: TimelineViewport, duration: TimelineTimeMs): TimelineTimeMs {
  return timelineTime(Math.min(duration, Math.max(0, Math.round((x + viewport.scrollLeft) / viewport.pixelsPerSecond * 1_000))));
}
export function fitPixelsPerSecond(width: number, duration: TimelineTimeMs): number {
  if (duration <= 0 || width <= 0) return MIN_PIXELS_PER_SECOND;
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, width / (duration / 1_000)));
}
const TICKS_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
export function chooseTickInterval(pixelsPerSecond: number, minimumSpacing = 72): TimelineTimeMs {
  return timelineTime(TICKS_MS.find(value => value / 1_000 * pixelsPerSecond >= minimumSpacing) ?? 60_000);
}
export function formatRulerTime(value: TimelineTimeMs, interval: TimelineTimeMs): string {
  const formatted = formatTimelineTime(value);
  return interval < 1_000 ? formatted : formatted.replace(/\.\d{3}$/, '');
}
