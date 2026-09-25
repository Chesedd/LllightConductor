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

/** Parses an exact timeline value (milliseconds, MM:SS.mmm, or HH:MM:SS.mmm). */
export function parseTimelineTime(input: string): TimelineTimeMs | null {
  const value = input.trim();
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value);
    return Number.isSafeInteger(milliseconds) ? timelineTime(milliseconds) : null;
  }
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!match) return null;
  const [, hoursText, minutesText, secondsText, fractionText] = match;
  const hours = Number(hoursText ?? 0); const minutes = Number(minutesText); const seconds = Number(secondsText);
  if (seconds > 59 || (hoursText !== undefined && minutes > 59)) return null;
  const result = ((hours * 60 + minutes) * 60 + seconds) * 1_000 + Number(fractionText);
  return Number.isSafeInteger(result) ? timelineTime(result) : null;
}
