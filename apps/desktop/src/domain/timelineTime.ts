/** Integer milliseconds elapsed from show start. */
export type TimelineTimeMs = number;

export function timelineTime(milliseconds: number): TimelineTimeMs {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('Timeline time must be a non-negative integer number of milliseconds');
  return milliseconds;
}

export function formatTimelineTime(value: TimelineTimeMs): string {
  const milliseconds = timelineTime(value);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1_000) % 60;
  const fraction = milliseconds % 1_000;
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(3, '0')}`;
  return hours ? `${String(hours).padStart(2, '0')}:${base}` : base;
}
