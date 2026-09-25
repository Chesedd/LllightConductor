import { describe, expect, it } from 'vitest';
import { formatTimelineTime, parseTimelineTime, timelineTime } from './timelineTime';
describe('timeline time text', () => {
  it.each([['00:01.000', 1000], ['01:23.456', 83456], ['02:01:02.003', 7262003], ['123', 123]])('parses %s', (text, expected) => expect(parseTimelineTime(text)).toBe(expected));
  it.each(['nope', '-00:01.000', '00:60.000', '00:01.00', '00:01.0000'])('rejects %s', value => expect(parseTimelineTime(value)).toBeNull());
  it('preserves millisecond precision in a round trip', () => { const value = timelineTime(123456789); expect(parseTimelineTime(formatTimelineTime(value))).toBe(value); });
});
