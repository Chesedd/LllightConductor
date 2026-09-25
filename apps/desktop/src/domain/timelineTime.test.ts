import { describe, expect, it } from 'vitest';
import { formatTimelineTime, timelineTime } from './timelineTime';
describe('timeline time', () => { it('formats deterministic integer milliseconds', () => { expect(formatTimelineTime(timelineTime(83_450))).toBe('01:23.450'); expect(formatTimelineTime(timelineTime(3_683_004))).toBe('01:01:23.004'); }); it('rejects fractional or negative public time', () => { expect(() => timelineTime(1.2)).toThrow(); expect(() => timelineTime(-1)).toThrow(); }); });
