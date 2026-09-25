import { CURRENT_PROJECT_SCHEMA_VERSION, type Project } from '../domain/project';
import { MAX_SET_OUTPUT_UPDATES, BROADCAST_ADDRESS } from '../protocol/protocolV1';
import { RUNTIME_SCORE_VERSION, type CompiledShowV1 } from '../runtime/runtimeScore';
import { PREPARED_SHOW_VERSION, type PreparedMasterShowV1, type PreparedOutputUpdateV1, type PreparedShowBundleV1 } from './preparedShow';

export type PreparationErrorCode = 'missing-output-mapping' | 'invalid-output-id' | 'duplicate-output-id' | 'invalid-slave-address' | 'missing-channel' | 'channel-slave-mismatch' | 'target-mismatch' | 'stale-compiled-show' | 'too-many-simultaneous-updates' | 'unsupported-state' | 'invalid-time' | 'project-invalid';
export class PreparationError extends Error {
  constructor(readonly code: PreparationErrorCode, message: string, readonly entityId?: string) { super(message); this.name = 'PreparationError'; }
}
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Resolves a compiled, transport-neutral snapshot against the current explicit Project mappings. */
export function prepareCompiledShow(project: Project, compiled: CompiledShowV1): PreparedShowBundleV1 {
  if (project.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION || project.score.version !== 1 || compiled.version !== RUNTIME_SCORE_VERSION) throw new PreparationError('project-invalid', 'Project, Score, or Runtime Score version is unsupported.');
  if (!Number.isSafeInteger(compiled.durationMs) || compiled.durationMs < 0) throw new PreparationError('invalid-time', 'Compiled duration must be non-negative integer milliseconds.');
  const projectMasters = new Map(project.costumes.map(costume => [costume.master.id, { costume, master: costume.master }]));
  const compiledMasterIds = new Set<string>();
  const masters: PreparedMasterShowV1[] = compiled.masters.map(runtimeMaster => {
    if (compiledMasterIds.has(runtimeMaster.masterId)) throw new PreparationError('stale-compiled-show', `Compiled master '${runtimeMaster.masterId}' is duplicated.`, runtimeMaster.masterId);
    compiledMasterIds.add(runtimeMaster.masterId);
    const current = projectMasters.get(runtimeMaster.masterId);
    if (!current || current.costume.id !== runtimeMaster.costumeId) throw new PreparationError('stale-compiled-show', `Compiled master '${runtimeMaster.masterId}' does not match the current Project.`, runtimeMaster.masterId);
    const slaves = new Map(current.master.slaves.map(slave => [slave.id, slave]));
    const channels = new Map(current.master.slaves.flatMap(slave => slave.channels.map(channel => [channel.id, { channel, slave }] as const)));
    for (const slave of current.master.slaves) {
      if (!Number.isInteger(slave.logicalAddress) || slave.logicalAddress! < 0 || slave.logicalAddress! >= BROADCAST_ADDRESS) throw new PreparationError('invalid-slave-address', `Pico '${slave.displayName}' must have a Protocol v1 address from 0 to 254.`, slave.id);
      const ids = new Set<number>();
      for (const channel of slave.channels) if (channel.protocolOutputId !== undefined) {
        if (!Number.isInteger(channel.protocolOutputId) || channel.protocolOutputId < 0 || channel.protocolOutputId > 255) throw new PreparationError('invalid-output-id', `Channel '${channel.displayName}' has an invalid Pico Output ID.`, channel.id);
        if (ids.has(channel.protocolOutputId)) throw new PreparationError('duplicate-output-id', `Pico '${slave.displayName}' has duplicate Output ID ${channel.protocolOutputId}.`, slave.id);
        ids.add(channel.protocolOutputId);
      }
    }
    const frames = [...runtimeMaster.frames].sort((a, b) => a.timeMs - b.timeMs).map(frame => {
      if (!Number.isSafeInteger(frame.timeMs) || frame.timeMs < 0 || frame.timeMs > compiled.durationMs) throw new PreparationError('invalid-time', `Frame time '${String(frame.timeMs)}' is invalid.`);
      const batches = new Map<number, PreparedOutputUpdateV1[]>();
      for (const transition of frame.transitions) {
        const located = channels.get(transition.channelId);
        if (!located) throw new PreparationError('missing-channel', `Compiled transition references missing channel '${transition.channelId}'.`, transition.channelId);
        if (!slaves.has(transition.slaveId) || located.slave.id !== transition.slaveId) throw new PreparationError('channel-slave-mismatch', `Channel '${located.channel.displayName}' no longer belongs to the compiled Pico.`, transition.channelId);
        if (located.slave.logicalAddress !== transition.slaveLogicalAddress) throw new PreparationError('stale-compiled-show', `Pico address for channel '${located.channel.displayName}' changed after compilation.`, transition.channelId);
        if (located.channel.hardwareOutputIdentifier !== transition.hardwareOutputIdentifier) throw new PreparationError('target-mismatch', `Hardware output identifier for channel '${located.channel.displayName}' changed after compilation.`, transition.channelId);
        const outputId = located.channel.protocolOutputId;
        if (outputId === undefined) throw new PreparationError('missing-output-mapping', `Channel '${located.channel.displayName}' on Pico '${located.slave.displayName}' does not have a Pico Output ID.`, transition.channelId);
        if (transition.state !== 'ON' && transition.state !== 'OFF') throw new PreparationError('unsupported-state', `Channel '${located.channel.displayName}' has unsupported state '${String(transition.state)}'.`, transition.channelId);
        const updates = batches.get(transition.slaveLogicalAddress) ?? [];
        if (updates.some(update => update.outputId === outputId)) throw new PreparationError('duplicate-output-id', `Frame ${frame.timeMs} contains Output ID ${outputId} twice for Pico '${located.slave.displayName}'.`, transition.channelId);
        updates.push({ outputId, state: transition.state }); batches.set(transition.slaveLogicalAddress, updates);
      }
      const slaveBatches = [...batches].sort((a, b) => a[0] - b[0]).map(([slaveAddress, updates]) => {
        if (updates.length > MAX_SET_OUTPUT_UPDATES) throw new PreparationError('too-many-simultaneous-updates', `Pico ${slaveAddress} has ${updates.length} simultaneous updates; Protocol v1 permits ${MAX_SET_OUTPUT_UPDATES}.`);
        return { slaveAddress, updates: updates.sort((a, b) => a.outputId - b.outputId) };
      });
      return { timeMs: frame.timeMs, slaveBatches };
    }).filter(frame => frame.slaveBatches.length > 0);
    return { masterId: runtimeMaster.masterId, costumeId: runtimeMaster.costumeId, durationMs: compiled.durationMs, frames };
  });
  if (compiledMasterIds.size !== projectMasters.size || [...projectMasters.keys()].some(id => !compiledMasterIds.has(id))) throw new PreparationError('stale-compiled-show', 'Compiled masters do not match the current Project topology.');
  masters.sort((a, b) => compareText(a.masterId, b.masterId) || compareText(a.costumeId, b.costumeId));
  return { version: PREPARED_SHOW_VERSION, masters };
}

export function serializePreparedShow(show: PreparedShowBundleV1): string { return JSON.stringify(show, null, 2); }
