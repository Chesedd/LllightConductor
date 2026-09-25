import { CURRENT_PROJECT_SCHEMA_VERSION, type Project } from '../domain/project';
import type { ProvisionalScore } from '../score/score';
import { validateProject } from '../domain/projectValidation';

export const PROJECT_FILE_EXTENSION = 'lightshow';

export type ProjectFileErrorCode = 'invalid-json' | 'missing-version' | 'unsupported-version' | 'malformed' | 'domain-invalid' | 'io';

export class ProjectFileError extends Error {
  constructor(readonly code: ProjectFileErrorCode, message: string, readonly cause?: unknown) { super(message); this.name = 'ProjectFileError'; }
}

export interface PersistedProjectV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  audio: Project['audio'];
  costumes: Project['costumes'];
  provisionalScore: ProvisionalScore;
  deviceBindings: Project['deviceBindings'];
}

/** Mapping is deliberately explicit: this DTO, rather than the aggregate, is the file contract. */
export function projectToPersistedV1(project: Project): PersistedProjectV1 {
  return {
    schemaVersion: 1, id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt,
    audio: structuredClone(project.audio), costumes: structuredClone(project.costumes),
    provisionalScore: structuredClone(project.score),
    deviceBindings: structuredClone(project.deviceBindings),
  };
}

const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, path: string): string => { if (typeof value !== 'string') fail(`${path} must be a string`); return value; };
const array = (value: unknown, path: string): unknown[] => { if (!Array.isArray(value)) fail(`${path} must be an array`); return value; };
const optionalString = (value: unknown, path: string) => value === undefined ? undefined : string(value, path);
const id = (value: unknown, path: string) => { const result = string(value, path); if (!result.trim() || [...result].some(character => character.charCodeAt(0) < 32)) fail(`${path} is not a valid ID`); return result; };
function fail(message: string): never { throw new ProjectFileError('malformed', `Invalid project file: ${message}`); }

function parseChannel(value: unknown, path: string): Project['costumes'][number]['master']['slaves'][number]['channels'][number] {
  const v = object(value, path); return { id: id(v.id, `${path}.id`), displayName: string(v.displayName, `${path}.displayName`), type: string(v.type, `${path}.type`) as Project['costumes'][number]['master']['slaves'][number]['channels'][number]['type'], hardwareOutputIdentifier: string(v.hardwareOutputIdentifier, `${path}.hardwareOutputIdentifier`) };
}
function parseSlave(value: unknown, path: string): Project['costumes'][number]['master']['slaves'][number] {
  const v = object(value, path); const logicalAddress = v.logicalAddress;
  if (logicalAddress !== undefined && (typeof logicalAddress !== 'number' || !Number.isSafeInteger(logicalAddress))) fail(`${path}.logicalAddress must be an integer`);
  return { id: id(v.id, `${path}.id`), displayName: string(v.displayName, `${path}.displayName`), type: string(v.type, `${path}.type`) as Project['costumes'][number]['master']['slaves'][number]['type'], ...(logicalAddress === undefined ? {} : { logicalAddress }), channels: array(v.channels, `${path}.channels`).map((item, index) => parseChannel(item, `${path}.channels[${index}]`)) };
}
function parseCostume(value: unknown, path: string): Project['costumes'][number] {
  const v = object(value, path); const master = object(v.master, `${path}.master`);
  return { id: id(v.id, `${path}.id`), name: string(v.name, `${path}.name`), master: { id: id(master.id, `${path}.master.id`), displayName: string(master.displayName, `${path}.master.displayName`), type: string(master.type, `${path}.master.type`) as Project['costumes'][number]['master']['type'], slaves: array(master.slaves, `${path}.master.slaves`).map((item, index) => parseSlave(item, `${path}.master.slaves[${index}]`)) } };
}

export function persistedV1ToProject(value: unknown): Project {
  const v = object(value, 'project');
  const topology = array(v.costumes, 'costumes').map((item, index) => parseCostume(item, `costumes[${index}]`));
  const audioValue = v.audio;
  let audio: Project['audio'] = null;
  if (audioValue !== null) {
    const a = object(audioValue, 'audio'); const reference = object(a.reference, 'audio.reference'); const type = string(reference.type, 'audio.reference.type');
    if (type !== 'project-asset' && type !== 'external-uri') fail('audio.reference.type is unsupported');
    audio = { id: id(a.id, 'audio.id'), displayName: string(a.displayName, 'audio.displayName'), reference: type === 'project-asset' ? { type, assetName: string(reference.assetName, 'audio.reference.assetName') } : { type, uri: string(reference.uri, 'audio.reference.uri') }, ...optionalString(a.mediaType, 'audio.mediaType') === undefined ? {} : { mediaType: optionalString(a.mediaType, 'audio.mediaType') }, ...(a.durationMs === undefined ? {} : typeof a.durationMs === 'number' && Number.isFinite(a.durationMs) && a.durationMs >= 0 ? { durationMs: a.durationMs } : fail('audio.durationMs must be a non-negative number')) };
  }
  const score = object(v.provisionalScore, 'provisionalScore');
  if (score.format !== 'provisional' || score.version !== 1) fail('provisionalScore must use provisional version 1');
  const bindings = array(v.deviceBindings, 'deviceBindings').map((item, index) => { const b = object(item, `deviceBindings[${index}]`); const physical = object(b.physicalDevice, `deviceBindings[${index}].physicalDevice`); return { id: id(b.id, `deviceBindings[${index}].id`), logicalControllerId: id(b.logicalControllerId, `deviceBindings[${index}].logicalControllerId`), physicalDevice: { type: string(physical.type, `deviceBindings[${index}].physicalDevice.type`), hardwareId: string(physical.hardwareId, `deviceBindings[${index}].physicalDevice.hardwareId`) } }; });
  const project: Project = { schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION, id: id(v.id, 'id'), name: string(v.name, 'name'), createdAt: string(v.createdAt, 'createdAt'), updatedAt: string(v.updatedAt, 'updatedAt'), audio, costumes: topology, score: { format: 'provisional', version: 1 }, deviceBindings: bindings };
  const issues = validateProject(project);
  if (issues.length) throw new ProjectFileError('domain-invalid', `Project violates domain rules: ${issues[0].path}: ${issues[0].message}`);
  return project;
}

export function parseProjectFile(json: string): Project {
  let value: unknown;
  try { value = JSON.parse(json); } catch (cause) { throw new ProjectFileError('invalid-json', 'The selected file is not valid JSON.', cause); }
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('schemaVersion' in value)) throw new ProjectFileError('missing-version', 'The project file has no schemaVersion.');
  const version = (value as Record<string, unknown>).schemaVersion;
  if (version !== 1) throw new ProjectFileError('unsupported-version', typeof version === 'number' && version > CURRENT_PROJECT_SCHEMA_VERSION ? `This project uses schema version ${version}, but this app supports up to version ${CURRENT_PROJECT_SCHEMA_VERSION}.` : `Unsupported project schema version: ${String(version)}.`);
  return persistedV1ToProject(value);
}

export function serializeProjectFile(project: Project): string { return `${JSON.stringify(projectToPersistedV1(project), null, 2)}\n`; }
