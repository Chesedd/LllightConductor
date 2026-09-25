import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { AudioReference } from '../domain/project';

export interface AudioMediaGateway { chooseAudioFile(): Promise<string | null>; exists(path: string): Promise<boolean>; playableUrl(path: string): string }
export class TauriAudioMediaGateway implements AudioMediaGateway {
  chooseAudioFile() { return invoke<string | null>('choose_audio_file'); }
  exists(path: string) { return invoke<boolean>('audio_file_exists', { path }); }
  playableUrl(path: string) { return convertFileSrc(path); }
}
export class AudioMediaService {
  constructor(private readonly gateway: AudioMediaGateway) {}
  choose() { return this.gateway.chooseAudioFile(); }
  async resolve(reference: AudioReference) { if (reference.type !== 'external-uri') return { status: 'unsupported' as const }; const exists = await this.gateway.exists(reference.uri); return exists ? { status: 'available' as const, url: this.gateway.playableUrl(reference.uri) } : { status: 'missing' as const }; }
  displayName(path: string) { return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path; }
  mediaType(path: string) { const extension = path.split('.').pop()?.toLowerCase(); return extension === 'mp3' ? 'audio/mpeg' : extension === 'wav' ? 'audio/wav' : undefined; }
}
