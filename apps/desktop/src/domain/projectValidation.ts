import type { Project } from './project';
import { CURRENT_SCORE_VERSION } from '../score/score';

export interface ValidationIssue { path: string; message: string }

const required = (value: string, path: string, issues: ValidationIssue[]) => {
  if (!value.trim()) issues.push({ path, message: 'Name is required' });
};

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();
  const addId = (id: string, path: string) => {
    if (!id.trim()) issues.push({ path, message: 'ID is required' });
    else if (ids.has(id)) issues.push({ path, message: `ID conflicts with ${ids.get(id)}` });
    else ids.set(id, path);
  };

  required(project.name, 'name', issues);
  if (!isIsoTimestamp(project.createdAt)) issues.push({ path: 'createdAt', message: 'Timestamp must be a valid ISO 8601 date' });
  if (!isIsoTimestamp(project.updatedAt)) issues.push({ path: 'updatedAt', message: 'Timestamp must be a valid ISO 8601 date' });
  addId(project.id, 'id');
  if (project.audio) {
    addId(project.audio.id, 'audio.id');
    required(project.audio.displayName, 'audio.displayName', issues);
    if (project.audio.reference.type === 'external-uri' && !project.audio.reference.uri.trim()) issues.push({ path: 'audio.reference.uri', message: 'External audio reference is required' });
    if (project.audio.durationMs !== undefined && (!Number.isSafeInteger(project.audio.durationMs) || project.audio.durationMs < 0)) issues.push({ path: 'audio.durationMs', message: 'Duration must be non-negative integer milliseconds' });
  }
  project.costumes.forEach((costume, costumeIndex) => {
    const costumePath = `costumes[${costumeIndex}]`;
    addId(costume.id, `${costumePath}.id`);
    required(costume.name, `${costumePath}.name`, issues);
    addId(costume.master.id, `${costumePath}.master.id`);
    required(costume.master.displayName, `${costumePath}.master.displayName`, issues);
    const addresses = new Set<number>();
    costume.master.slaves.forEach((slave, slaveIndex) => {
      const slavePath = `${costumePath}.master.slaves[${slaveIndex}]`;
      addId(slave.id, `${slavePath}.id`);
      required(slave.displayName, `${slavePath}.displayName`, issues);
      if (slave.logicalAddress !== undefined) {
        if (!Number.isSafeInteger(slave.logicalAddress) || slave.logicalAddress < 0) issues.push({ path: `${slavePath}.logicalAddress`, message: 'Logical address must be a non-negative integer' });
        else if (addresses.has(slave.logicalAddress)) issues.push({ path: `${slavePath}.logicalAddress`, message: 'Logical address must be unique within the master' });
        addresses.add(slave.logicalAddress);
      }
      const outputs = new Set<string>();
      slave.channels.forEach((channel, channelIndex) => {
        const channelPath = `${slavePath}.channels[${channelIndex}]`;
        addId(channel.id, `${channelPath}.id`);
        required(channel.displayName, `${channelPath}.displayName`, issues);
        if (!channel.hardwareOutputIdentifier.trim()) issues.push({ path: `${channelPath}.hardwareOutputIdentifier`, message: 'Hardware output identifier is required' });
        else if (outputs.has(channel.hardwareOutputIdentifier)) issues.push({ path: `${channelPath}.hardwareOutputIdentifier`, message: 'Hardware output identifier must be unique within the slave' });
        outputs.add(channel.hardwareOutputIdentifier);
      });
    });
  });
  const channels = new Map(project.costumes.flatMap(costume => costume.master.slaves).flatMap(slave => slave.channels).map(channel => [channel.id, channel]));
  if (project.score.version !== CURRENT_SCORE_VERSION) issues.push({ path: 'score.version', message: `Unsupported score version: ${String(project.score.version)}` });
  project.score.events.forEach((event, eventIndex) => {
    const eventPath = `score.events[${eventIndex}]`;
    addId(event.id, `${eventPath}.id`);
    if (event.kind !== 'light-interval') {
      issues.push({ path: `${eventPath}.kind`, message: `Unsupported score event kind: ${String((event as { kind?: unknown }).kind)}` });
      return;
    }
    const channel = channels.get(event.channelId);
    if (!channel) issues.push({ path: `${eventPath}.channelId`, message: 'Event must reference an existing output channel' });
    else if (channel.type !== 'el-wire' && channel.type !== 'digital-output') issues.push({ path: `${eventPath}.channelId`, message: 'Channel type does not support light intervals' });
    if (!Number.isSafeInteger(event.startMs) || event.startMs < 0) issues.push({ path: `${eventPath}.startMs`, message: 'Start must be non-negative integer milliseconds' });
    if (!Number.isSafeInteger(event.endMs)) issues.push({ path: `${eventPath}.endMs`, message: 'End must be integer milliseconds' });
    else if (event.endMs <= event.startMs) issues.push({ path: `${eventPath}.endMs`, message: 'End must be greater than start' });
    if (project.audio?.durationMs !== undefined && event.endMs > project.audio.durationMs) issues.push({ path: `${eventPath}.endMs`, message: 'Event must not exceed audio duration' });
    const conflictIndex = project.score.events.findIndex((other, index) => index < eventIndex && other.kind === 'light-interval' && other.channelId === event.channelId && event.startMs < other.endMs && other.startMs < event.endMs);
    if (conflictIndex >= 0) issues.push({ path: eventPath, message: `Event overlaps score.events[${conflictIndex}] on the same channel` });
  });
  const controllerIds = new Set(project.costumes.flatMap(({ master }) => [master.id, ...master.slaves.map(({ id }) => id)]));
  project.deviceBindings.forEach((binding, index) => {
    addId(binding.id, `deviceBindings[${index}].id`);
    if (!controllerIds.has(binding.logicalControllerId)) issues.push({ path: `deviceBindings[${index}].logicalControllerId`, message: 'Binding must reference an existing controller' });
    if (!binding.physicalDevice.type.trim()) issues.push({ path: `deviceBindings[${index}].physicalDevice.type`, message: 'Device type is required' });
    if (!binding.physicalDevice.hardwareId.trim()) issues.push({ path: `deviceBindings[${index}].physicalDevice.hardwareId`, message: 'Hardware ID is required' });
  });
  return issues;
}

const isIsoTimestamp = (value: string) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

export function assertValidProject(project: Project): void {
  const issues = validateProject(project);
  if (issues.length) throw new Error(`${issues[0].path}: ${issues[0].message}`);
}
