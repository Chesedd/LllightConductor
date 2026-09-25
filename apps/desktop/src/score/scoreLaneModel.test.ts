import { expect, it } from 'vitest';
import type { Project } from '../domain/project';
import { buildScoreLaneModel } from './scoreLaneModel';

it('builds lanes in topology order and joins deterministically by channel ID', () => {
  const project = { schemaVersion: 2, id: 'p', name: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', audio: null, costumes: [{ id: 'c', name: 'C', master: { id: 'm', displayName: 'M', type: 'esp32', slaves: [{ id: 's', displayName: 'S', type: 'raspberry-pi-pico', channels: [{ id: 'b', displayName: 'B', type: 'el-wire', hardwareOutputIdentifier: '1' }, { id: 'a', displayName: 'A', type: 'el-wire', hardwareOutputIdentifier: '2' }] }] } }], score: { version: 1, events: [{ id: 'late', kind: 'light-interval', channelId: 'a', startMs: 20, endMs: 30 }, { id: 'early', kind: 'light-interval', channelId: 'a', startMs: 10, endMs: 15 }] }, deviceBindings: [] } satisfies Project;
  expect(buildScoreLaneModel(project).map(lane => [lane.channel.id, lane.events.map(event => event.id)])).toEqual([['b', []], ['a', ['early', 'late']]]);
});
