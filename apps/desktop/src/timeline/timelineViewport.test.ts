import { describe, expect, it } from 'vitest';
import { timelineTime } from '../domain/timelineTime';
import { chooseTickInterval, fitPixelsPerSecond, formatRulerTime, timeToX, xToTime } from './timelineViewport';

describe('timeline coordinates', () => {
  it('converts integer time to pixels and back', () => { const view = { pixelsPerSecond: 100, scrollLeft: 0 }; expect(timeToX(timelineTime(2_500), view)).toBe(250); expect(xToTime(250, view, timelineTime(10_000))).toBe(2_500); expect(xToTime(timeToX(timelineTime(1_237), view), view, timelineTime(10_000))).toBe(1_237); });
  it('applies scrolling and zoom', () => { expect(timeToX(timelineTime(2_000), { pixelsPerSecond: 200, scrollLeft: 125 })).toBe(275); expect(timeToX(timelineTime(2_000), { pixelsPerSecond: 400, scrollLeft: 125 })).toBe(675); });
  it('clamps conversions to the timeline', () => { const view = { pixelsPerSecond: 100, scrollLeft: 0 }; expect(xToTime(-20, view, timelineTime(1_000))).toBe(0); expect(xToTime(500, view, timelineTime(1_000))).toBe(1_000); });
  it('calculates bounded Fit scale', () => { expect(fitPixelsPerSecond(1_000, timelineTime(10_000))).toBe(100); expect(fitPixelsPerSecond(1, timelineTime(60_000))).toBe(8); });
  it('selects scale-aware ticks and integrates formatting', () => { expect(chooseTickInterval(10)).toBe(10_000); expect(chooseTickInterval(1_000)).toBe(100); expect(formatRulerTime(timelineTime(2_500), timelineTime(100))).toBe('00:02.500'); expect(formatRulerTime(timelineTime(10_000), timelineTime(1_000))).toBe('00:10'); });
});
