import { describe, expect, it, vi } from 'vitest';
import { extractPeaks, WaveformCache, type DecodedAudio } from './waveform';

const audio = (channels: number[][], duration = 1): DecodedAudio => ({ duration, length: channels[0].length, numberOfChannels: channels.length, getChannelData: channel => new Float32Array(channels[channel]) });
describe('waveform extraction', () => {
  it('extracts correct min/max peaks and duration from synthetic audio', () => { const result = extractPeaks(audio([[-1, -.25, .5, 1]], 2), 2); expect(result).toEqual({ durationMs: 2_000, sampleCount: 4, peaks: [{ min: -1, max: -.25 }, { min: .5, max: 1 }] }); });
  it('represents silence', () => { expect(extractPeaks(audio([[0, 0, 0]]), 2).peaks).toEqual([{ min: 0, max: 0 }, { min: 0, max: 0 }]); });
  it('combines positive and negative channels', () => { expect(extractPeaks(audio([[.2], [-.8]]), 20).peaks[0]).toEqual({ min: expect.closeTo(-.8), max: expect.closeTo(.2) }); });
  it('supports a one-sample short buffer', () => { const result = extractPeaks(audio([[.4]], .001)); expect(result.peaks).toHaveLength(1); expect(result.durationMs).toBe(1); });
});
describe('waveform cache', () => {
  it('reuses hits and reloads invalidated/replaced references', async () => { const cache = new WaveformCache(); const load = vi.fn(async () => extractPeaks(audio([[0]]))); await cache.get('a', load); await cache.get('a', load); expect(load).toHaveBeenCalledTimes(1); cache.invalidate('a'); await cache.get('a', load); await cache.get('b', load); expect(load).toHaveBeenCalledTimes(3); });
  it('does not retain extraction failures', async () => { const cache = new WaveformCache(); const fail = vi.fn().mockRejectedValueOnce(new Error('decode')).mockResolvedValue(extractPeaks(audio([[0]]))); await expect(cache.get('a', fail)).rejects.toThrow('decode'); await expect(cache.get('a', fail)).resolves.toBeDefined(); expect(fail).toHaveBeenCalledTimes(2); });
});
