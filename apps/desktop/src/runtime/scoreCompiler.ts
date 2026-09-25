import type { Project } from '../domain/project';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../domain/project';
import { CURRENT_SCORE_VERSION } from '../score/score';
import { RUNTIME_SCORE_VERSION, type CompiledMasterScore, type CompiledShowV1, type RuntimeState, type RuntimeTransition } from './runtimeScore';

export type ScoreCompilerErrorCode = 'unsupported-event' | 'unsupported-channel' | 'missing-channel' | 'missing-slave' | 'missing-master' | 'invalid-target' | 'duplicate-target' | 'invalid-time' | 'project-invalid';

export class ScoreCompilerError extends Error {
  constructor(public readonly code: ScoreCompilerErrorCode, message: string, public readonly entityId?: string) {
    super(message); this.name = 'ScoreCompilerError';
  }
}

type Target = Omit<RuntimeTransition, 'state'> & { masterId: string; costumeId: string; supported: boolean };
type Endpoint = { timeMs: number; delta: 1 | -1 };

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const compareTransition = (left: RuntimeTransition, right: RuntimeTransition) =>
  left.slaveLogicalAddress - right.slaveLogicalAddress || compareText(left.hardwareOutputIdentifier, right.hardwareOutputIdentifier) || compareText(left.slaveId, right.slaveId) || compareText(left.channelId, right.channelId) || compareText(left.state, right.state);

/** Pure compilation in O(T + E log E), where T is topology size and E is event count. */
export function compileProject(project: Project): CompiledShowV1 {
  if (project.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION || project.score.version !== CURRENT_SCORE_VERSION)
    throw new ScoreCompilerError('project-invalid', 'The project or authoring score version is not supported.');

  const masters = new Map<string, CompiledMasterScore>();
  const targets = new Map<string, Target>();
  const routes = new Map<string, string>();
  for (const costume of project.costumes) {
    const master = costume.master;
    if (!master?.id) throw new ScoreCompilerError('missing-master', `Costume '${costume.id}' has no master.`, costume.id);
    if (master.type !== 'esp32') throw new ScoreCompilerError('project-invalid', `Master '${master.id}' has an unsupported type.`, master.id);
    if (masters.has(master.id)) throw new ScoreCompilerError('project-invalid', `Master ID '${master.id}' is duplicated.`, master.id);
    masters.set(master.id, { masterId: master.id, costumeId: costume.id, frames: [] });
    if (!Array.isArray(master.slaves)) throw new ScoreCompilerError('missing-slave', `Master '${master.id}' has no slave collection.`, master.id);
    for (const slave of master.slaves) {
      if (!slave?.id) throw new ScoreCompilerError('missing-slave', `Master '${master.id}' contains an invalid slave.`, master.id);
      if (slave.type !== 'raspberry-pi-pico') throw new ScoreCompilerError('invalid-target', `Slave '${slave.id}' has an unsupported type.`, slave.id);
      if (!Number.isSafeInteger(slave.logicalAddress) || slave.logicalAddress! < 0) throw new ScoreCompilerError('invalid-target', `Slave '${slave.id}' has no valid logical address.`, slave.id);
      for (const channel of slave.channels ?? []) {
        if (channel.type !== 'el-wire') {
          targets.set(channel.id, { costumeId: costume.id, masterId: master.id, slaveId: slave.id, slaveLogicalAddress: slave.logicalAddress!, channelId: channel.id, hardwareOutputIdentifier: channel.hardwareOutputIdentifier, supported: false });
          continue;
        }
        if (!channel.hardwareOutputIdentifier?.trim()) throw new ScoreCompilerError('invalid-target', `Channel '${channel.id}' has no hardware output identifier.`, channel.id);
        if (targets.has(channel.id)) throw new ScoreCompilerError('project-invalid', `Channel ID '${channel.id}' is duplicated.`, channel.id);
        const route = `${master.id}\0${slave.logicalAddress}\0${channel.hardwareOutputIdentifier}`;
        const previous = routes.get(route);
        if (previous && previous !== channel.id) throw new ScoreCompilerError('duplicate-target', `Channels '${previous}' and '${channel.id}' use the same runtime target.`, channel.id);
        routes.set(route, channel.id);
        targets.set(channel.id, { costumeId: costume.id, masterId: master.id, slaveId: slave.id, slaveLogicalAddress: slave.logicalAddress!, channelId: channel.id, hardwareOutputIdentifier: channel.hardwareOutputIdentifier, supported: true });
      }
    }
  }

  const endpoints = new Map<string, Endpoint[]>();
  let maximumEnd = 0;
  for (const event of project.score.events as unknown as readonly Record<string, unknown>[]) {
    const id = typeof event.id === 'string' ? event.id : undefined;
    if (event.kind !== 'light-interval') throw new ScoreCompilerError('unsupported-event', `Score event '${id ?? 'unknown'}' is not supported.`, id);
    if (typeof event.channelId !== 'string' || !targets.has(event.channelId)) throw new ScoreCompilerError('missing-channel', `Event '${id ?? 'unknown'}' references a missing channel.`, id);
    const target = targets.get(event.channelId)!;
    if (!target.supported) throw new ScoreCompilerError('unsupported-channel', `Channel '${target.channelId}' cannot compile light intervals.`, target.channelId);
    const startMs = event.startMs; const endMs = event.endMs;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || (startMs as number) < 0 || (endMs as number) <= (startMs as number)) throw new ScoreCompilerError('invalid-time', `Event '${id ?? 'unknown'}' has invalid timing.`, id);
    if (project.audio?.durationMs !== undefined && (endMs as number) > project.audio.durationMs) throw new ScoreCompilerError('invalid-time', `Event '${id ?? 'unknown'}' exceeds the audio duration.`, id);
    const list = endpoints.get(target.channelId) ?? []; list.push({ timeMs: startMs as number, delta: 1 }, { timeMs: endMs as number, delta: -1 }); endpoints.set(target.channelId, list);
    maximumEnd = Math.max(maximumEnd, endMs as number);
  }

  const frameMaps = new Map<string, Map<number, RuntimeTransition[]>>([...masters].map(([id]) => [id, new Map()]));
  for (const [channelId, points] of endpoints) {
    const target = targets.get(channelId)!; const byTime = new Map<number, number>();
    for (const point of points) byTime.set(point.timeMs, (byTime.get(point.timeMs) ?? 0) + point.delta);
    let active = 0;
    for (const [timeMs, delta] of [...byTime].sort((a, b) => a[0] - b[0])) {
      const before = active > 0; active += delta;
      if (active < 0 || active > 1) throw new ScoreCompilerError('project-invalid', `Channel '${channelId}' contains overlapping or malformed intervals.`, channelId);
      const after = active > 0; if (before === after) continue;
      const transition: RuntimeTransition = { slaveId: target.slaveId, slaveLogicalAddress: target.slaveLogicalAddress, channelId, hardwareOutputIdentifier: target.hardwareOutputIdentifier, state: (after ? 'ON' : 'OFF') as RuntimeState };
      const frameMap = frameMaps.get(target.masterId)!; frameMap.set(timeMs, [...(frameMap.get(timeMs) ?? []), transition]);
    }
  }
  for (const [masterId, master] of masters) master.frames = [...frameMaps.get(masterId)!].sort((a, b) => a[0] - b[0]).map(([timeMs, transitions]) => ({ timeMs, transitions: transitions.sort(compareTransition) }));
  return { version: RUNTIME_SCORE_VERSION, durationMs: project.audio?.durationMs ?? maximumEnd, masters: [...masters.values()].sort((a, b) => compareText(a.masterId, b.masterId) || compareText(a.costumeId, b.costumeId)) };
}

export function serializeCompiledShow(show: CompiledShowV1): string { return JSON.stringify(show, null, 2); }
