import { describe, expect, it } from 'vitest';
import { timelineTime } from '../domain/timelineTime';
import type { LightInterval } from '../score/score';
import { calculateCreation, calculateMove, calculateResize, hasIntervalCollision } from './scoreInteraction';
const t = timelineTime; const event = { startMs: t(1000), endMs: t(2000) };
describe('score interaction calculations', () => {
  it('creates in either direction', () => { expect(calculateCreation(t(100), t(300), 10)).toEqual({ startMs:100,endMs:300 }); expect(calculateCreation(t(300), t(100), -10)).toEqual({ startMs:100,endMs:300 }); });
  it('ignores clicks below the pixel threshold', () => expect(calculateCreation(t(100), t(110), 2)).toBeNull());
  it('moves while preserving duration and clamps to bounds', () => { expect(calculateMove(event,t(2500))).toEqual({startMs:2500,endMs:3500}); expect(calculateMove(event,t(0))).toEqual({startMs:0,endMs:1000}); expect(calculateMove(event,t(2800),t(3000))).toEqual({startMs:2000,endMs:3000}); });
  it('resizes either edge without allowing inversion', () => { expect(calculateResize(event,'start',t(500))).toEqual({startMs:500,endMs:2000}); expect(calculateResize(event,'end',t(2500))).toEqual({startMs:1000,endMs:2500}); expect(calculateResize(event,'start',t(2000))).toBeNull(); });
  it('allows adjacency and detects overlap', () => { const events: LightInterval[]=[{id:'a',kind:'light-interval',channelId:'c',startMs:t(1000),endMs:t(2000)}]; expect(hasIntervalCollision(events,'c',{startMs:t(2000),endMs:t(3000)})).toBe(false); expect(hasIntervalCollision(events,'c',{startMs:t(1500),endMs:t(2500)})).toBe(true); });
});
