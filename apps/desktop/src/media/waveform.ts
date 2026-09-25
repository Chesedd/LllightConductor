import { timelineTime, type TimelineTimeMs } from '../domain/timelineTime';

export interface WaveformPeak { min: number; max: number }
export interface WaveformData { durationMs: TimelineTimeMs; sampleCount: number; peaks: WaveformPeak[] }
export interface DecodedAudio { duration: number; length: number; numberOfChannels: number; getChannelData(channel: number): Float32Array }
export interface WaveformExtractor { extract(sourceUrl: string): Promise<WaveformData> }

export function extractPeaks(buffer: DecodedAudio, resolution = 20_000): WaveformData {
  const count = Math.max(1, Math.min(resolution, buffer.length));
  const peaks = Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * buffer.length / count); const end = Math.max(start + 1, Math.floor((index + 1) * buffer.length / count));
    let min = 1; let max = -1;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) { const samples = buffer.getChannelData(channel); for (let i = start; i < end; i++) { const value = samples[i] ?? 0; min = Math.min(min, value); max = Math.max(max, value); } }
    return { min: min === 1 ? 0 : min, max: max === -1 ? 0 : max };
  });
  return { durationMs: timelineTime(Math.max(0, Math.round(buffer.duration * 1_000))), sampleCount: buffer.length, peaks };
}

export class WebAudioWaveformExtractor implements WaveformExtractor {
  async extract(sourceUrl: string) {
    const response = await fetch(sourceUrl); if (!response.ok) throw new Error(`Audio read failed (${response.status}).`);
    const Context = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!Context) throw new Error('Web Audio decoding is unavailable.');
    const context = new Context();
    try { return extractPeaks(await context.decodeAudioData(await response.arrayBuffer())); } finally { void context.close(); }
  }
}

export class WaveformCache {
  private values = new Map<string, Promise<WaveformData>>();
  get(key: string, load: () => Promise<WaveformData>) { const existing = this.values.get(key); if (existing) return existing; const pending = load(); this.values.set(key, pending); pending.catch(() => { if (this.values.get(key) === pending) this.values.delete(key); }); return pending; }
  invalidate(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
