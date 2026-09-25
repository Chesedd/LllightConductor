import { describe, expect, it } from 'vitest';
import { AudioPlaybackController, type AudioPlaybackAdapter } from './audioPlayback';
import type { TimelineTimeMs } from '../domain/timelineTime';

class FakeAdapter implements AudioPlaybackAdapter {
  calls: string[] = []; position: (value: TimelineTimeMs) => void = () => {}; ended = () => {}; error: (message: string) => void = () => {};
  async load(url: string) { this.calls.push(`load:${url}`); return { durationMs: 2_000 }; }
  async play() { this.calls.push('play'); } pause() { this.calls.push('pause'); } seek(value: TimelineTimeMs) { this.calls.push(`seek:${value}`); } unload() { this.calls.push('unload'); }
  onPosition(listener: (value: TimelineTimeMs) => void) { this.position = listener; return () => {}; } onEnded(listener: () => void) { this.ended = listener; return () => {}; } onError(listener: (value: string) => void) { this.error = listener; return () => {}; }
}
describe('AudioPlaybackController', () => {
  it('cannot play without audio', async () => { const adapter = new FakeAdapter(); const subject = new AudioPlaybackController(adapter); expect(await subject.play()).toBe(false); expect(adapter.calls).toEqual([]); });
  it('loads, plays, updates position, seeks and pauses', async () => { const adapter = new FakeAdapter(); const subject = new AudioPlaybackController(adapter); await subject.load('asset://song'); await subject.play(); adapter.position(750); expect(subject.snapshot()).toMatchObject({ status: 'playing', currentTimeMs: 750, durationMs: 2000 }); subject.seek(1200); subject.pause(); expect(subject.snapshot()).toMatchObject({ status: 'paused', currentTimeMs: 1200 }); expect(adapter.calls).toEqual(['unload', 'load:asset://song', 'play', 'seek:1200', 'pause']); });
  it('finishes at duration and restarts from zero on Play', async () => { const adapter = new FakeAdapter(); const subject = new AudioPlaybackController(adapter); await subject.load('asset://song'); await subject.play(); adapter.ended(); expect(subject.snapshot()).toMatchObject({ status: 'paused', currentTimeMs: 2000 }); await subject.play(); expect(adapter.calls.slice(-2)).toEqual(['seek:0', 'play']); expect(subject.snapshot()).toMatchObject({ status: 'playing', currentTimeMs: 0 }); });
  it('unloads and resets runtime state', async () => { const adapter = new FakeAdapter(); const subject = new AudioPlaybackController(adapter); await subject.load('asset://song'); subject.unload(); expect(subject.snapshot()).toEqual({ status: 'idle', currentTimeMs: 0, durationMs: 0, error: null }); });
});
