import { describe, expect, it } from 'vitest';
import type { Project } from '../domain/project';
import { parseProjectFile, persistedV1ToProject, projectToPersistedV1, projectToPersistedV2, ProjectFileError, serializeProjectFile } from './projectFile';

const project = (): Project => ({ schemaVersion: 2, id: 'project-1', name: 'Show', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', audio: { id: 'audio-1', displayName: 'Music', reference: { type: 'external-uri', uri: 'file:///music.wav' }, durationMs: 1200, mediaType: 'audio/wav' }, costumes: [{ id: 'costume-1', name: 'Red', master: { id: 'master-1', displayName: 'Master', type: 'esp32', slaves: [{ id: 'slave-1', displayName: 'Left', type: 'raspberry-pi-pico', logicalAddress: 2, channels: [{ id: 'channel-1', displayName: 'Sleeve', type: 'el-wire', hardwareOutputIdentifier: 'A' }] }] } }], score: { version: 1, events: [{ id: 'event-1', kind: 'light-interval', channelId: 'channel-1', startMs: 100, endMs: 900 }] }, deviceBindings: [{ id: 'binding-1', logicalControllerId: 'slave-1', physicalDevice: { type: 'pico', hardwareId: 'ABC' } }] });
const errorCode = (operation: () => unknown, code: ProjectFileError['code']) => { try { operation(); throw new Error('did not throw'); } catch (error) { expect(error).toBeInstanceOf(ProjectFileError); expect((error as ProjectFileError).code).toBe(code); } };

describe('project file V2 and V1 migration', () => {
  it('saves and loads Score v1 without changing IDs, references, or integer timing', () => { const loaded = parseProjectFile(serializeProjectFile(project())); expect(loaded.score).toEqual(project().score); expect(loaded.score.events[0]).toEqual({ id: 'event-1', kind: 'light-interval', channelId: 'channel-1', startMs: 100, endMs: 900 }); });
  it('writes the explicit V2 DTO and round-trips the aggregate', () => { expect(projectToPersistedV2(project())).toMatchObject({ schemaVersion: 2, score: { version: 1 } }); expect(parseProjectFile(serializeProjectFile(project()))).toEqual(project()); });
  it('opens V1 by migrating its uncommitted provisional score to empty Score v1', () => { const legacy = projectToPersistedV1(project()); const loaded = persistedV1ToProject(legacy); expect(loaded).toMatchObject({ schemaVersion: 2, score: { version: 1, events: [] } }); expect(loaded.costumes).toEqual(project().costumes); });
  it('only upgrades a migrated V1 file when it is saved', () => { const legacyJson = JSON.stringify(projectToPersistedV1(project())); expect(JSON.parse(legacyJson).schemaVersion).toBe(1); expect(JSON.parse(serializeProjectFile(parseProjectFile(legacyJson))).schemaVersion).toBe(2); });
  it('rejects malformed and unsupported score data', () => { const malformed = projectToPersistedV2(project()) as unknown as Record<string, unknown>; malformed.score = { version: 1, events: [{ id: 'e', kind: 'future-event', channelId: 'channel-1', startMs: 1, endMs: 2 }] }; errorCode(() => parseProjectFile(JSON.stringify(malformed)), 'malformed'); });
  it.each([
    ['duplicate event IDs', (dto: ReturnType<typeof projectToPersistedV2>) => dto.score.events.push({ ...dto.score.events[0] })],
    ['dangling channel reference', (dto: ReturnType<typeof projectToPersistedV2>) => { dto.score.events[0].channelId = 'missing'; }],
    ['overlap', (dto: ReturnType<typeof projectToPersistedV2>) => dto.score.events.push({ ...dto.score.events[0], id: 'event-2', startMs: 800 })],
  ])('rejects domain-invalid score: %s', (_label, mutate) => { const dto = projectToPersistedV2(project()); mutate(dto); errorCode(() => parseProjectFile(JSON.stringify(dto)), 'domain-invalid'); });
  it('classifies invalid JSON, missing versions, and future versions', () => { errorCode(() => parseProjectFile('{'), 'invalid-json'); errorCode(() => parseProjectFile('{}'), 'missing-version'); errorCode(() => parseProjectFile('{"schemaVersion":3}'), 'unsupported-version'); });
  it('does not persist transient transport/editor state', () => { const serialized = serializeProjectFile(project()); for (const field of ['currentTimeMs', 'playing', 'selection', 'collapsed', 'decoder']) expect(serialized).not.toContain(field); });
});
