import { timelineTime, type TimelineTimeMs } from '../domain/timelineTime';

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';
export interface PlaybackState { status: PlaybackStatus; currentTimeMs: TimelineTimeMs; durationMs: TimelineTimeMs; error: string | null }
export interface LoadedAudioMetadata { durationMs: TimelineTimeMs; mediaType?: string }
export interface AudioPlaybackAdapter {
  load(sourceUrl: string): Promise<LoadedAudioMetadata>; play(): Promise<void>; pause(): void; seek(positionMs: TimelineTimeMs): void; unload(): void;
  onPosition(listener: (positionMs: TimelineTimeMs) => void): () => void;
  onEnded(listener: () => void): () => void;
  onError(listener: (message: string) => void): () => void;
}

export class AudioPlaybackController {
  private state: PlaybackState = { status: 'idle', currentTimeMs: 0, durationMs: 0, error: null };
  private listeners = new Set<(state: PlaybackState) => void>();
  constructor(private readonly adapter: AudioPlaybackAdapter) {
    adapter.onPosition(value => { this.state = { ...this.state, currentTimeMs: timelineTime(Math.min(value, this.state.durationMs)) }; this.emit(); });
    adapter.onEnded(() => { this.state = { ...this.state, status: 'paused', currentTimeMs: this.state.durationMs }; this.emit(); });
    adapter.onError(message => { this.state = { ...this.state, status: 'error', error: message }; this.emit(); });
  }
  snapshot() { return { ...this.state }; }
  subscribe(listener: (state: PlaybackState) => void) { this.listeners.add(listener); listener(this.snapshot()); return () => { this.listeners.delete(listener); }; }
  async load(sourceUrl: string) { this.adapter.unload(); this.state = { status: 'loading', currentTimeMs: 0, durationMs: 0, error: null }; this.emit(); try { const metadata = await this.adapter.load(sourceUrl); this.state = { status: 'ready', currentTimeMs: 0, durationMs: metadata.durationMs, error: null }; this.emit(); return metadata; } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); this.state = { status: 'error', currentTimeMs: 0, durationMs: 0, error: message }; this.emit(); throw cause; } }
  async play() { if (!this.state.durationMs || this.state.status === 'idle' || this.state.status === 'loading' || this.state.status === 'error') return false; if (this.state.currentTimeMs >= this.state.durationMs) { this.adapter.seek(0); this.state = { ...this.state, currentTimeMs: 0 }; } try { await this.adapter.play(); this.state = { ...this.state, status: 'playing', error: null }; this.emit(); return true; } catch (cause) { this.state = { ...this.state, status: 'error', error: cause instanceof Error ? cause.message : String(cause) }; this.emit(); return false; } }
  pause() { if (this.state.status !== 'playing') return; this.adapter.pause(); this.state = { ...this.state, status: 'paused' }; this.emit(); }
  seek(positionMs: TimelineTimeMs) { if (!this.state.durationMs) return false; const position = timelineTime(Math.min(positionMs, this.state.durationMs)); this.adapter.seek(position); this.state = { ...this.state, currentTimeMs: position, status: position === this.state.durationMs && this.state.status === 'playing' ? 'paused' : this.state.status }; this.emit(); return true; }
  unload() { this.adapter.unload(); this.state = { status: 'idle', currentTimeMs: 0, durationMs: 0, error: null }; this.emit(); }
  private emit() { const state = this.snapshot(); this.listeners.forEach(listener => listener(state)); }
}

export class HtmlAudioPlaybackAdapter implements AudioPlaybackAdapter {
  private audio: HTMLAudioElement | null = null; private positionListeners = new Set<(value: TimelineTimeMs) => void>(); private endedListeners = new Set<() => void>(); private errorListeners = new Set<(message: string) => void>(); private lastUpdate = 0;
  async load(sourceUrl: string): Promise<LoadedAudioMetadata> {
    this.unload(); const audio = new Audio(); this.audio = audio; audio.preload = 'metadata';
    audio.addEventListener('timeupdate', () => { const now = performance.now(); if (now - this.lastUpdate >= 100) { this.lastUpdate = now; this.positionListeners.forEach(listener => listener(timelineTime(Math.max(0, Math.round(audio.currentTime * 1000))))); } });
    audio.addEventListener('ended', () => this.endedListeners.forEach(listener => listener()));
    audio.addEventListener('error', () => this.errorListeners.forEach(listener => listener('The audio file is unsupported, corrupted, or cannot be read.')));
    return new Promise((resolve, reject) => { const loaded = () => { cleanup(); const duration = Math.round(audio.duration * 1000); if (!Number.isSafeInteger(duration) || duration <= 0) reject(new Error('Audio metadata has no valid duration.')); else resolve({ durationMs: timelineTime(duration), ...(audio.currentSrc ? { mediaType: mediaTypeFromUrl(sourceUrl) } : {}) }); }; const failed = () => { cleanup(); reject(new Error('The audio file is unsupported, corrupted, or cannot be read.')); }; const cleanup = () => { audio.removeEventListener('loadedmetadata', loaded); audio.removeEventListener('error', failed); }; audio.addEventListener('loadedmetadata', loaded); audio.addEventListener('error', failed); audio.src = sourceUrl; audio.load(); });
  }
  async play() { if (!this.audio) throw new Error('No audio is loaded.'); await this.audio.play(); }
  pause() { this.audio?.pause(); }
  seek(positionMs: TimelineTimeMs) { if (this.audio) this.audio.currentTime = positionMs / 1000; }
  unload() { if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; } this.lastUpdate = 0; }
  onPosition(listener: (value: TimelineTimeMs) => void) { this.positionListeners.add(listener); return () => this.positionListeners.delete(listener); }
  onEnded(listener: () => void) { this.endedListeners.add(listener); return () => this.endedListeners.delete(listener); }
  onError(listener: (message: string) => void) { this.errorListeners.add(listener); return () => this.errorListeners.delete(listener); }
}

function mediaTypeFromUrl(url: string) { const extension = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase(); return extension === 'mp3' ? 'audio/mpeg' : extension === 'wav' ? 'audio/wav' : undefined; }
