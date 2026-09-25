import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Project } from '../domain/project';
import type { TimelineTimeMs } from '../domain/timelineTime';
import { ProjectWorkspace } from '../application/projectWorkspace';
import { ProjectFileService, type ProjectFileGateway } from '../persistence/projectFileService';
import { InMemoryRecentProjectsRepository } from '../persistence/recentProjectsRepository';
import { AudioMediaService, type AudioMediaGateway } from '../media/audioMediaService';
import { AudioPlaybackController, type AudioPlaybackAdapter } from '../media/audioPlayback';
import { AppStateProvider } from './state/AppState';
import { ApplicationShell } from './components/ApplicationShell';

const project: Project = { schemaVersion: 2, id: 'project', name: 'Show', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', audio: null, costumes: [], score: { version: 1, events: [] }, deviceBindings: [] };
class Files implements ProjectFileGateway { async chooseOpenPath() { return null; } async chooseSavePath() { return '/show.lightshow'; } async readText(): Promise<string> { throw new Error('unused'); } async atomicWriteText() {} }
class Media implements AudioMediaGateway { path = 'C:\\Music\\song.mp3'; deleted = false; async chooseAudioFile() { return this.path; } async exists() { return true; } playableUrl(path: string) { return `asset:${path}`; } }
class Playback implements AudioPlaybackAdapter { calls: string[] = []; position: (value: TimelineTimeMs) => void = () => {}; ended = () => {}; error: (message: string) => void = () => {}; async load(url: string) { this.calls.push(`load:${url}`); return { durationMs: 222_180, mediaType: 'audio/mpeg' }; } async play() { this.calls.push('play'); } pause() { this.calls.push('pause'); } seek(value: TimelineTimeMs) { this.calls.push(`seek:${value}`); } unload() { this.calls.push('unload'); } onPosition(fn: (value: TimelineTimeMs) => void) { this.position = fn; return () => {}; } onEnded(fn: () => void) { this.ended = fn; return () => {}; } onError(fn: (message: string) => void) { this.error = fn; return () => {}; } }

async function setup() {
  const workspace = new ProjectWorkspace(new ProjectFileService(new Files()), new InMemoryRecentProjectsRepository()); workspace.setNewProject(project); await workspace.save();
  const adapter = new Playback(); const mediaGateway = new Media();
  render(<AppStateProvider workspace={workspace} playback={new AudioPlaybackController(adapter)} media={new AudioMediaService(mediaGateway)}><ApplicationShell/></AppStateProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Editor' })); return { workspace, adapter, mediaGateway };
}

describe('audio editor UI', () => {
  it('imports, plays, seeks, pauses, and removes without deleting the file', async () => {
    const { workspace, adapter, mediaGateway } = await setup(); fireEvent.click(screen.getByRole('button', { name: 'Import Audio' })); await screen.findByText('song.mp3'); expect(screen.getByText('03:42.180 · audio/mpeg')).toBeInTheDocument(); expect(workspace.snapshot().dirty).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play' })); await waitFor(() => expect(adapter.calls).toContain('play')); fireEvent.change(screen.getByLabelText('Seek audio'), { target: { value: '12345' } }); expect(adapter.calls).toContain('seek:12345'); fireEvent.click(screen.getByRole('button', { name: 'Pause' })); expect(adapter.calls).toContain('pause');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Audio' })); expect(screen.getByRole('dialog')).toHaveTextContent('will not be deleted'); fireEvent.click(screen.getAllByRole('button', { name: 'Remove Audio' }).at(-1)!); expect(await screen.findByText('No audio track')).toBeInTheDocument(); expect(mediaGateway.deleted).toBe(false);
  });
});
