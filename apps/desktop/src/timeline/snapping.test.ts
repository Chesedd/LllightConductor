import { describe, expect, it } from 'vitest';
import { snapTime } from './snapping';

describe('time-grid snapping', () => {
  it.each([[0, 100, 0], [149, 100, 100], [150, 100, 200], [151, 100, 200], [200, 100, 200], [-20, 100, 0]])('snaps %i on a %i ms grid to %i', (value, grid, expected) => expect(snapTime(value, grid)).toBe(expected));
  it('uses integer arithmetic and rejects invalid grids', () => { expect(snapTime(12.7, 10)).toBe(10); expect(() => snapTime(10, 0)).toThrow(); });
});
