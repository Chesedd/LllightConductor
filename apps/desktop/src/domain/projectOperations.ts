import type { ChannelId, ControllerId, CostumeId, IdGenerator, MasterControllerType, OutputChannelType, Project, SlaveControllerType } from './project';
import { assertValidProject } from './projectValidation';

type Timestamp = Date | string;
const iso = (timestamp: Timestamp) => typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
const named = (value: string, label: string) => { const result = value.trim(); if (!result) throw new Error(`${label} is required`); return result; };
const changed = (project: Project, timestamp: Timestamp): Project => ({ ...project, updatedAt: iso(timestamp) });
const finish = (project: Project, timestamp: Timestamp) => { const result = changed(project, timestamp); assertValidProject(result); return result; };
const move = <T,>(items: readonly T[], from: number, to: number): T[] => {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= items.length || to < 0 || to >= items.length) throw new Error('Reorder index is out of range');
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result;
};

export function addCostume(project: Project, name: string, createId: IdGenerator, timestamp: Timestamp, masterType: MasterControllerType = 'esp32'): Project {
  return finish({ ...project, costumes: [...project.costumes, { id: createId(), name: named(name, 'Costume name'), master: { id: createId(), displayName: 'ESP32 Master', type: masterType, slaves: [] } }] }, timestamp);
}
export function renameCostume(project: Project, id: CostumeId, name: string, timestamp: Timestamp): Project {
  return finish({ ...project, costumes: project.costumes.map(value => value.id === id ? { ...value, name: named(name, 'Costume name') } : value) }, timestamp);
}
export function renameMaster(project: Project, id: ControllerId, displayName: string, timestamp: Timestamp): Project {
  return finish({ ...project, costumes: project.costumes.map(costume => costume.master.id === id ? { ...costume, master: { ...costume.master, displayName: named(displayName, 'Master display name') } } : costume) }, timestamp);
}
export function removeCostume(project: Project, id: CostumeId, timestamp: Timestamp): Project {
  const removed = project.costumes.find(value => value.id === id);
  const controllerIds = new Set(removed ? [removed.master.id, ...removed.master.slaves.map(slave => slave.id)] : []);
  const channelIds = new Set(removed?.master.slaves.flatMap(slave => slave.channels.map(channel => channel.id)) ?? []);
  return finish({ ...project, costumes: project.costumes.filter(value => value.id !== id), score: { ...project.score, events: project.score.events.filter(event => !channelIds.has(event.channelId)) }, deviceBindings: project.deviceBindings.filter(binding => !controllerIds.has(binding.logicalControllerId)) }, timestamp);
}
export function reorderCostumes(project: Project, from: number, to: number, timestamp: Timestamp): Project { return finish({ ...project, costumes: move(project.costumes, from, to) }, timestamp); }

export function bindEsp32(project: Project, masterId: ControllerId, deviceId: string, createId: IdGenerator, timestamp: Timestamp): Project {
  const hardwareId=named(deviceId,'ESP32 device ID').toLowerCase();
  const master=project.costumes.some(c=>c.master.id===masterId&&c.master.type==='esp32');
  if(!master)throw new Error('Binding must target an ESP32 Master');
  if(project.deviceBindings.some(b=>b.physicalDevice.type==='esp32'&&b.physicalDevice.hardwareId.toLowerCase()===hardwareId&&b.logicalControllerId!==masterId))throw new Error('ESP32 is already bound to another Master');
  const retained=project.deviceBindings.filter(b=>!(b.logicalControllerId===masterId&&b.physicalDevice.type==='esp32'));
  return finish({...project,deviceBindings:[...retained,{id:createId(),logicalControllerId:masterId,physicalDevice:{type:'esp32',hardwareId}}]},timestamp);
}
export function unbindEsp32(project:Project,masterId:ControllerId,timestamp:Timestamp):Project{return finish({...project,deviceBindings:project.deviceBindings.filter(b=>!(b.logicalControllerId===masterId&&b.physicalDevice.type==='esp32'))},timestamp);}

export function addSlave(project: Project, masterId: ControllerId, input: { displayName: string; type?: SlaveControllerType; logicalAddress?: number }, createId: IdGenerator, timestamp: Timestamp): Project {
  return finish({ ...project, costumes: project.costumes.map(costume => {
    if (costume.master.id !== masterId) return costume;
    const used = new Set(costume.master.slaves.map(slave => slave.logicalAddress));
    let logicalAddress = input.logicalAddress;
    if (logicalAddress === undefined) { logicalAddress = 0; while (used.has(logicalAddress)) logicalAddress += 1; }
    return { ...costume, master: { ...costume.master, slaves: [...costume.master.slaves, { id: createId(), displayName: named(input.displayName, 'Slave display name'), type: input.type ?? 'raspberry-pi-pico', logicalAddress, channels: [] }] } };
  }) }, timestamp);
}
export function renameSlave(project: Project, id: ControllerId, displayName: string, timestamp: Timestamp): Project { return mapSlaves(project, id, slave => ({ ...slave, displayName: named(displayName, 'Slave display name') }), timestamp); }
export function changeSlaveLogicalAddress(project: Project, id: ControllerId, logicalAddress: number, timestamp: Timestamp): Project { return mapSlaves(project, id, slave => ({ ...slave, logicalAddress }), timestamp); }
export function removeSlave(project: Project, id: ControllerId, timestamp: Timestamp): Project {
  const channelIds = new Set(project.costumes.flatMap(costume => costume.master.slaves).filter(slave => slave.id === id).flatMap(slave => slave.channels.map(channel => channel.id)));
  return finish({ ...project, costumes: project.costumes.map(costume => ({ ...costume, master: { ...costume.master, slaves: costume.master.slaves.filter(slave => slave.id !== id) } })), score: { ...project.score, events: project.score.events.filter(event => !channelIds.has(event.channelId)) }, deviceBindings: project.deviceBindings.filter(binding => binding.logicalControllerId !== id) }, timestamp);
}
export function reorderSlaves(project: Project, masterId: ControllerId, from: number, to: number, timestamp: Timestamp): Project { return finish({ ...project, costumes: project.costumes.map(costume => costume.master.id === masterId ? { ...costume, master: { ...costume.master, slaves: move(costume.master.slaves, from, to) } } : costume) }, timestamp); }

export function addChannel(project: Project, slaveId: ControllerId, input: { displayName: string; type?: OutputChannelType; hardwareOutputIdentifier: string }, createId: IdGenerator, timestamp: Timestamp): Project {
  return mapSlaves(project, slaveId, slave => ({ ...slave, channels: [...slave.channels, { id: createId(), displayName: named(input.displayName, 'Channel display name'), type: input.type ?? 'el-wire', hardwareOutputIdentifier: named(input.hardwareOutputIdentifier, 'Hardware output identifier') }] }), timestamp);
}
export function renameChannel(project: Project, id: ChannelId, displayName: string, timestamp: Timestamp): Project { return mapChannels(project, id, channel => ({ ...channel, displayName: named(displayName, 'Channel display name') }), timestamp); }
export function changeChannelHardwareOutputIdentifier(project: Project, id: ChannelId, hardwareOutputIdentifier: string, timestamp: Timestamp): Project { return mapChannels(project, id, channel => ({ ...channel, hardwareOutputIdentifier: named(hardwareOutputIdentifier, 'Hardware output identifier') }), timestamp); }
export function setChannelProtocolOutputId(project: Project, id: ChannelId, protocolOutputId: number | undefined, timestamp: Timestamp): Project {
  if (protocolOutputId !== undefined && (!Number.isInteger(protocolOutputId) || protocolOutputId < 0 || protocolOutputId > 255)) throw new Error('Pico Output ID must be an integer from 0 to 255');
  return mapChannels(project, id, channel => { const result = { ...channel }; if (protocolOutputId === undefined) delete result.protocolOutputId; else result.protocolOutputId = protocolOutputId; return result; }, timestamp);
}
/** Replaces every mapping on one Pico with its zero-based topology position, atomically. */
export function autoAssignChannelProtocolOutputIds(project: Project, slaveId: ControllerId, timestamp: Timestamp): Project {
  const slave = project.costumes.flatMap(costume => costume.master.slaves).find(value => value.id === slaveId);
  if (!slave) throw new Error(`Pico '${slaveId}' does not exist`);
  if (slave.channels.length > 256) throw new Error('Auto Assign Output IDs supports at most 256 channels per Pico');
  return mapSlaves(project, slaveId, value => ({ ...value, channels: value.channels.map((channel, index) => ({ ...channel, protocolOutputId: index })) }), timestamp);
}
export function removeChannel(project: Project, id: ChannelId, timestamp: Timestamp): Project { return finish({ ...project, costumes: project.costumes.map(costume => ({ ...costume, master: { ...costume.master, slaves: costume.master.slaves.map(slave => ({ ...slave, channels: slave.channels.filter(channel => channel.id !== id) })) } })), score: { ...project.score, events: project.score.events.filter(event => event.channelId !== id) } }, timestamp); }
export function reorderChannels(project: Project, slaveId: ControllerId, from: number, to: number, timestamp: Timestamp): Project { return mapSlaves(project, slaveId, slave => ({ ...slave, channels: move(slave.channels, from, to) }), timestamp); }

function mapSlaves(project: Project, id: ControllerId, map: (slave: Project['costumes'][number]['master']['slaves'][number]) => Project['costumes'][number]['master']['slaves'][number], timestamp: Timestamp): Project {
  return finish({ ...project, costumes: project.costumes.map(costume => ({ ...costume, master: { ...costume.master, slaves: costume.master.slaves.map(slave => slave.id === id ? map(slave) : slave) } })) }, timestamp);
}
function mapChannels(project: Project, id: ChannelId, map: (channel: Project['costumes'][number]['master']['slaves'][number]['channels'][number]) => Project['costumes'][number]['master']['slaves'][number]['channels'][number], timestamp: Timestamp): Project {
  return finish({ ...project, costumes: project.costumes.map(costume => ({ ...costume, master: { ...costume.master, slaves: costume.master.slaves.map(slave => ({ ...slave, channels: slave.channels.map(channel => channel.id === id ? map(channel) : channel) })) } })) }, timestamp);
}
