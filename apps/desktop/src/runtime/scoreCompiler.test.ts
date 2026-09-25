import { describe, expect, it } from 'vitest';
import type { Project } from '../domain/project';
import { compileProject, ScoreCompilerError, serializeCompiledShow, type ScoreCompilerErrorCode } from './scoreCompiler';

const project = (): Project => ({ schemaVersion: 3, id: 'project', name: 'Show', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', audio: null, deviceBindings: [], score: { version: 1, events: [] }, costumes: [
  { id: 'costume-b', name: 'B', master: { id: 'master-b', displayName: 'B', type: 'esp32', slaves: [{ id: 'pico-b', displayName: 'B', type: 'raspberry-pi-pico', logicalAddress: 2, channels: [{ id: 'channel-b', displayName: 'B', type: 'el-wire', hardwareOutputIdentifier: 'OUT2' }] }] } },
  { id: 'costume-a', name: 'A', master: { id: 'master-a', displayName: 'A', type: 'esp32', slaves: [{ id: 'pico-a2', displayName: 'A2', type: 'raspberry-pi-pico', logicalAddress: 3, channels: [{ id: 'channel-c', displayName: 'C', type: 'el-wire', hardwareOutputIdentifier: 'OUT3' }] }, { id: 'pico-a1', displayName: 'A1', type: 'raspberry-pi-pico', logicalAddress: 1, channels: [{ id: 'channel-a', displayName: 'A', type: 'el-wire', hardwareOutputIdentifier: 'OUT1' }] }] } },
] });
const interval = (id: string, channelId: string, startMs: number, endMs: number) => ({ id, kind: 'light-interval' as const, channelId, startMs, endMs });

describe('runtime score compiler', () => {
  it('compiles empty topology and includes topology masters with empty frames', () => {
    const empty = project(); empty.costumes = [];
    expect(compileProject(empty)).toEqual({ version: 1, durationMs: 0, masters: [] });
    expect(compileProject(project()).masters.map(master => master.frames)).toEqual([[], []]);
  });
  it('turns an interval, including one at zero, into grouped per-master frames and copies its logical target', () => {
    const value = project(); value.score.events = [interval('b', 'channel-b', 0, 1000), interval('a', 'channel-a', 0, 1000)];
    const result = compileProject(value);
    expect(result.durationMs).toBe(1000); expect(result.masters.map(master => master.masterId)).toEqual(['master-a', 'master-b']);
    expect(result.masters[0].frames).toEqual([{ timeMs: 0, transitions: [{ slaveId: 'pico-a1', slaveLogicalAddress: 1, channelId: 'channel-a', hardwareOutputIdentifier: 'OUT1', state: 'ON' }] }, { timeMs: 1000, transitions: [{ slaveId: 'pico-a1', slaveLogicalAddress: 1, channelId: 'channel-a', hardwareOutputIdentifier: 'OUT1', state: 'OFF' }] }]);
  });
  it('normalizes adjacent intervals but preserves a real OFF gap', () => {
    const value = project(); value.score.events = [interval('a', 'channel-a', 100, 200), interval('b', 'channel-a', 200, 300), interval('c', 'channel-a', 400, 500)];
    expect(compileProject(value).masters[0].frames.map(frame => [frame.timeMs, frame.transitions[0].state])).toEqual([[100, 'ON'], [300, 'OFF'], [400, 'ON'], [500, 'OFF']]);
  });
  it('groups simultaneous channels and sorts frames and transitions by explicit runtime target order', () => {
    const value = project(); value.score.events = [interval('c', 'channel-c', 50, 80), interval('a', 'channel-a', 50, 100)];
    const frames = compileProject(value).masters[0].frames;
    expect(frames.map(frame => frame.timeMs)).toEqual([50, 80, 100]); expect(frames[0].transitions.map(item => item.channelId)).toEqual(['channel-a', 'channel-c']);
  });
  it('uses audio duration instead of the maximum event end', () => { const value = project(); value.audio = { id: 'audio', displayName: 'Track', reference: { type: 'project-asset', assetName: 'x' }, durationMs: 5000 }; value.score.events = [interval('a', 'channel-a', 10, 20)]; expect(compileProject(value).durationMs).toBe(5000); });
  it('is independent of authoring and topology order and serializes byte-for-byte deterministically', () => {
    const left = project(); left.score.events = [interval('b', 'channel-b', 20, 30), interval('a', 'channel-a', 10, 30)];
    const right = structuredClone(left); right.score.events.reverse(); right.costumes.reverse(); right.costumes.find(c => c.id === 'costume-a')!.master.slaves.reverse();
    expect(compileProject(right)).toEqual(compileProject(left)); expect(serializeCompiledShow(compileProject(right))).toBe(serializeCompiledShow(compileProject(left)));
  });
  it.each<[ScoreCompilerErrorCode, (value: Project) => void]>([
    ['missing-channel', (value: Project) => { value.score.events = [interval('x', 'missing', 0, 1)]; }],
    ['unsupported-channel', (value: Project) => { value.costumes[0].master.slaves[0].channels[0].type = 'addressable-led'; value.score.events = [interval('x', 'channel-b', 0, 1)]; }],
    ['invalid-target', (value: Project) => { delete value.costumes[0].master.slaves[0].logicalAddress; }],
    ['invalid-target', (value: Project) => { value.costumes[0].master.slaves[0].channels[0].hardwareOutputIdentifier = ' '; }],
    ['duplicate-target', (value: Project) => { value.costumes[1].master.slaves[1].channels.push({ id: 'duplicate', displayName: 'Duplicate', type: 'el-wire', hardwareOutputIdentifier: 'OUT1' }); }],
    ['invalid-time', (value: Project) => { value.score.events = [interval('x', 'channel-a', 2, 1)]; }],
    ['unsupported-event', (value: Project) => { value.score.events = [{ id: 'x', kind: 'future', channelId: 'channel-a', startMs: 0, endMs: 1 } as never]; }],
  ])('rejects invalid input atomically with typed %s errors', (code, mutate) => { const value = project(); mutate(value); expect(() => compileProject(value)).toThrowError(expect.objectContaining<Partial<ScoreCompilerError>>({ code })); });
});
