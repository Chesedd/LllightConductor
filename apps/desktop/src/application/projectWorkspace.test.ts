import { describe, expect, it } from 'vitest';
import type { Project } from '../domain/project';
import { ProjectFileService, type ProjectFileGateway } from '../persistence/projectFileService';
import { serializeProjectFile } from '../persistence/projectFile';
import { InMemoryRecentProjectsRepository } from '../persistence/recentProjectsRepository';
import { ProjectWorkspace, type UnsavedDecision } from './projectWorkspace';
import { removeProjectAudio, setProjectAudio } from '../domain/audioOperations';

const project = (name = 'Show'): Project => ({ schemaVersion: 2, id: 'project', name, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', audio: null, costumes: [], score: { version: 1, events: [] }, deviceBindings: [] });
class FakeGateway implements ProjectFileGateway { openPath: string | null = null; savePath: string | null = null; files = new Map<string, string>(); writes: string[] = []; async chooseOpenPath() { return this.openPath; } async chooseSavePath() { return this.savePath; } async readText(path: string) { const value = this.files.get(path); if (!value) throw new Error('File not found'); return value; } async atomicWriteText(path: string, contents: string) { this.files.set(path, contents); this.writes.push(path); } }
const setup = () => { const gateway = new FakeGateway(); const recent = new InMemoryRecentProjectsRepository(); const workspace = new ProjectWorkspace(new ProjectFileService(gateway), recent, () => new Date('2026-03-01T00:00:00Z')); return { gateway, recent, workspace }; };
const decision = (value: UnsavedDecision) => async () => value;

describe('ProjectWorkspace save and session semantics', () => {
  it('exposes semantic score actions and marks each successful edit dirty', async () => {
    const { workspace, gateway } = setup(); gateway.savePath = '/show.lightshow';
    const value = project(); value.costumes = [{ id: 'costume', name: 'C', master: { id: 'master', displayName: 'M', type: 'esp32', slaves: [{ id: 'pico', displayName: 'P', type: 'raspberry-pi-pico', channels: [{ id: 'channel', displayName: 'Wire', type: 'el-wire', hardwareOutputIdentifier: '0' }] }] } }];
    workspace.setNewProject(value); await workspace.save();
    workspace.addLightInterval({ channelId: 'channel', startMs: 100, endMs: 200 });
    const eventId = workspace.snapshot().project!.score.events[0].id;
    expect(workspace.snapshot().dirty).toBe(true);
    await workspace.save(); workspace.moveLightInterval(eventId, 300); expect(workspace.snapshot().project!.score.events[0]).toMatchObject({ startMs: 300, endMs: 400 });
    await workspace.save(); workspace.resizeLightInterval(eventId, { endMs: 450 }); expect(workspace.snapshot().dirty).toBe(true);
    await workspace.save(); workspace.removeScoreEvent(eventId); expect(workspace.snapshot().project!.score.events).toEqual([]); expect(workspace.snapshot().dirty).toBe(true);
  });
  it('first Save uses Save As and cancellation is not success', async () => { const { workspace, gateway } = setup(); workspace.setNewProject(project()); expect(await workspace.save()).toBe(false); expect(workspace.snapshot()).toMatchObject({ dirty: true, filePath: null }); gateway.savePath = '/show.lightshow'; expect(await workspace.save()).toBe(true); expect(gateway.writes).toEqual(['/show.lightshow']); });
  it('saves an existing project to the same path and becomes clean', async () => { const { workspace, gateway } = setup(); gateway.savePath = '/show.lightshow'; workspace.setNewProject(project()); await workspace.save(); workspace.replaceProject(project('Edited')); expect(workspace.snapshot().dirty).toBe(true); await workspace.save(); expect(gateway.writes).toEqual(['/show.lightshow', '/show.lightshow']); expect(workspace.snapshot().dirty).toBe(false); });
  it('marks a domain edit dirty', () => { const { workspace } = setup(); workspace.setNewProject(project()); expect(workspace.snapshot().dirty).toBe(true); });
  it('applies a topology operation with the workspace clock and marks a saved project dirty', async () => {
    const { workspace, gateway } = setup(); gateway.savePath = '/show.lightshow'; workspace.setNewProject(project()); await workspace.save();
    workspace.editProject((current, timestamp) => ({ ...current, name: 'Edited', updatedAt: timestamp.toISOString() }));
    expect(workspace.snapshot()).toMatchObject({ dirty: true, project: { name: 'Edited', updatedAt: '2026-03-01T00:00:00.000Z' } });
  });
  it('Cancel keeps the current dirty project open', async () => { const { workspace } = setup(); workspace.setNewProject(project()); expect(await workspace.newProject(() => project('Other'), decision('cancel'))).toBe(false); expect(workspace.snapshot().project?.name).toBe('Show'); });
  it("Don't Save performs the pending action", async () => { const { workspace } = setup(); workspace.setNewProject(project()); expect(await workspace.newProject(() => project('Other'), decision('discard'))).toBe(true); expect(workspace.snapshot().project?.name).toBe('Other'); });
  it('Save performs the action only after successful persistence', async () => { const { workspace, gateway } = setup(); workspace.setNewProject(project()); expect(await workspace.newProject(() => project('Other'), decision('save'))).toBe(false); expect(workspace.snapshot().project?.name).toBe('Show'); gateway.savePath = '/show.lightshow'; expect(await workspace.newProject(() => project('Other'), decision('save'))).toBe(true); expect(workspace.snapshot().project?.name).toBe('Other'); });
  it('opens files and maintains removable recent metadata', async () => { const { workspace, gateway } = setup(); gateway.files.set('/old.lightshow', serializeProjectFile(project('Recent'))); await workspace.openRecent('/old.lightshow', decision('discard')); expect(workspace.snapshot().recentProjects[0]).toMatchObject({ path: '/old.lightshow', displayName: 'Recent', lastOpenedAt: '2026-03-01T00:00:00.000Z' }); await workspace.removeRecent('/old.lightshow'); expect(workspace.snapshot().recentProjects).toEqual([]); });
  it('marks import, replace/locate, and remove dirty while runtime playback needs no workspace edit', async () => { const { workspace, gateway } = setup(); gateway.savePath = '/show.lightshow'; workspace.setNewProject(project()); await workspace.save(); workspace.editProject((value, at) => setProjectAudio(value, { displayName: 'one.mp3', uri: '/one.mp3', durationMs: 1000 }, () => 'audio', at)); expect(workspace.snapshot().dirty).toBe(true); await workspace.save(); workspace.editProject((value, at) => setProjectAudio(value, { displayName: 'two.wav', uri: '/two.wav', durationMs: 2000 }, () => 'unused', at)); expect(workspace.snapshot().dirty).toBe(true); await workspace.save(); /* Play/pause/seek are deliberately outside ProjectWorkspace. */ expect(workspace.snapshot().dirty).toBe(false); workspace.editProject(removeProjectAudio); expect(workspace.snapshot().dirty).toBe(true); });
});
