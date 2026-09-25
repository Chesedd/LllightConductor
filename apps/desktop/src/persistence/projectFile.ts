import { CURRENT_PROJECT_SCHEMA_VERSION, type Project } from '../domain/project';
import { validateProject } from '../domain/projectValidation';
import { emptyScore, type Score } from '../score/score';

export const PROJECT_FILE_EXTENSION = 'lightshow';
export type ProjectFileErrorCode = 'invalid-json' | 'missing-version' | 'unsupported-version' | 'malformed' | 'domain-invalid' | 'io';
export class ProjectFileError extends Error {
  constructor(readonly code: ProjectFileErrorCode, message: string, readonly cause?: unknown) { super(message); this.name = 'ProjectFileError'; }
}

export interface PersistedProjectV1 {
  schemaVersion: 1; id: string; name: string; createdAt: string; updatedAt: string;
  audio: Project['audio']; costumes: Project['costumes'];
  provisionalScore: { format: 'provisional'; version: 1 };
  deviceBindings: Project['deviceBindings'];
}
export interface PersistedProjectV2 {
  schemaVersion: 2; id: string; name: string; createdAt: string; updatedAt: string;
  audio: Project['audio']; costumes: Project['costumes']; score: Score;
  deviceBindings: Project['deviceBindings'];
}
export interface PersistedProjectV3 {
  schemaVersion: 3; id: string; name: string; createdAt: string; updatedAt: string;
  audio: Project['audio']; costumes: Project['costumes']; score: Score;
  deviceBindings: Project['deviceBindings'];
}

/** Legacy writer retained for fixtures; normal saves always use V3. */
export function projectToPersistedV1(project: Project): PersistedProjectV1 {
  return { schemaVersion: 1, id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, audio: structuredClone(project.audio), costumes: structuredClone(project.costumes), provisionalScore: { format: 'provisional', version: 1 }, deviceBindings: structuredClone(project.deviceBindings) };
}
export function projectToPersistedV2(project: Project): PersistedProjectV2 {
  const costumes = structuredClone(project.costumes); costumes.forEach(costume => costume.master.slaves.forEach(slave => slave.channels.forEach(channel => { delete channel.protocolOutputId; })));
  return { schemaVersion: 2, id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, audio: structuredClone(project.audio), costumes, score: structuredClone(project.score), deviceBindings: structuredClone(project.deviceBindings) };
}
export function projectToPersistedV3(project: Project): PersistedProjectV3 { return { schemaVersion: 3, id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt, audio: structuredClone(project.audio), costumes: structuredClone(project.costumes), score: structuredClone(project.score), deviceBindings: structuredClone(project.deviceBindings) }; }

const object = (value: unknown, path: string): Record<string, unknown> => { if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${path} must be an object`); return value as Record<string, unknown>; };
const string = (value: unknown, path: string): string => { if (typeof value !== 'string') fail(`${path} must be a string`); return value; };
const array = (value: unknown, path: string): unknown[] => { if (!Array.isArray(value)) fail(`${path} must be an array`); return value; };
const optionalString = (value: unknown, path: string) => value === undefined ? undefined : string(value, path);
const id = (value: unknown, path: string) => { const result = string(value, path); if (!result.trim() || [...result].some(character => character.charCodeAt(0) < 32)) fail(`${path} is not a valid ID`); return result; };
const integer = (value: unknown, path: string) => { if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${path} must be an integer`); return value; };
function fail(message: string): never { throw new ProjectFileError('malformed', `Invalid project file: ${message}`); }

function parseChannel(value: unknown, path: string, includeMapping: boolean): Project['costumes'][number]['master']['slaves'][number]['channels'][number] { const v = object(value, path); const protocolOutputId = includeMapping && v.protocolOutputId !== undefined ? integer(v.protocolOutputId, `${path}.protocolOutputId`) : undefined; return { id: id(v.id, `${path}.id`), displayName: string(v.displayName, `${path}.displayName`), type: string(v.type, `${path}.type`) as Project['costumes'][number]['master']['slaves'][number]['channels'][number]['type'], hardwareOutputIdentifier: string(v.hardwareOutputIdentifier, `${path}.hardwareOutputIdentifier`), ...(protocolOutputId === undefined ? {} : { protocolOutputId }) }; }
function parseSlave(value: unknown, path: string, includeMapping: boolean): Project['costumes'][number]['master']['slaves'][number] { const v = object(value, path); const logicalAddress = v.logicalAddress; return { id: id(v.id, `${path}.id`), displayName: string(v.displayName, `${path}.displayName`), type: string(v.type, `${path}.type`) as Project['costumes'][number]['master']['slaves'][number]['type'], ...(logicalAddress === undefined ? {} : { logicalAddress: integer(logicalAddress, `${path}.logicalAddress`) }), channels: array(v.channels, `${path}.channels`).map((item, index) => parseChannel(item, `${path}.channels[${index}]`, includeMapping)) }; }
function parseCostume(value: unknown, path: string, includeMapping: boolean): Project['costumes'][number] { const v = object(value, path); const master = object(v.master, `${path}.master`); return { id: id(v.id, `${path}.id`), name: string(v.name, `${path}.name`), master: { id: id(master.id, `${path}.master.id`), displayName: string(master.displayName, `${path}.master.displayName`), type: string(master.type, `${path}.master.type`) as Project['costumes'][number]['master']['type'], slaves: array(master.slaves, `${path}.master.slaves`).map((item, index) => parseSlave(item, `${path}.master.slaves[${index}]`, includeMapping)) } }; }
function parseAudio(value: unknown): Project['audio'] { if (value === null) return null; const a = object(value, 'audio'); const reference = object(a.reference, 'audio.reference'); const type = string(reference.type, 'audio.reference.type'); if (type !== 'project-asset' && type !== 'external-uri') fail('audio.reference.type is unsupported'); const mediaType = optionalString(a.mediaType, 'audio.mediaType'); return { id: id(a.id, 'audio.id'), displayName: string(a.displayName, 'audio.displayName'), reference: type === 'project-asset' ? { type, assetName: string(reference.assetName, 'audio.reference.assetName') } : { type, uri: string(reference.uri, 'audio.reference.uri') }, ...(mediaType === undefined ? {} : { mediaType }), ...(a.durationMs === undefined ? {} : { durationMs: integer(a.durationMs, 'audio.durationMs') }) }; }
function parseBindings(value: unknown): Project['deviceBindings'] { return array(value, 'deviceBindings').map((item, index) => { const b = object(item, `deviceBindings[${index}]`); const physical = object(b.physicalDevice, `deviceBindings[${index}].physicalDevice`); return { id: id(b.id, `deviceBindings[${index}].id`), logicalControllerId: id(b.logicalControllerId, `deviceBindings[${index}].logicalControllerId`), physicalDevice: { type: string(physical.type, `deviceBindings[${index}].physicalDevice.type`), hardwareId: string(physical.hardwareId, `deviceBindings[${index}].physicalDevice.hardwareId`) } }; }); }
function parseScore(value: unknown): Score { const score = object(value, 'score'); if (score.version !== 1) fail('score.version must be 1'); return { version: 1, events: array(score.events, 'score.events').map((item, index) => { const path = `score.events[${index}]`; const event = object(item, path); if (event.kind !== 'light-interval') fail(`${path}.kind is unsupported`); return { id: id(event.id, `${path}.id`), kind: 'light-interval', channelId: id(event.channelId, `${path}.channelId`), startMs: integer(event.startMs, `${path}.startMs`), endMs: integer(event.endMs, `${path}.endMs`) }; }) }; }

function common(v: Record<string, unknown>, score: Score, includeMapping = false): Project { const project: Project = { schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION, id: id(v.id, 'id'), name: string(v.name, 'name'), createdAt: string(v.createdAt, 'createdAt'), updatedAt: string(v.updatedAt, 'updatedAt'), audio: parseAudio(v.audio), costumes: array(v.costumes, 'costumes').map((item, index) => parseCostume(item, `costumes[${index}]`, includeMapping)), score, deviceBindings: parseBindings(v.deviceBindings) }; const issues = validateProject(project); if (issues.length) throw new ProjectFileError('domain-invalid', `Project violates domain rules: ${issues[0].path}: ${issues[0].message}`); return project; }
export function persistedV1ToProject(value: unknown): Project { const v = object(value, 'project'); const provisional = object(v.provisionalScore, 'provisionalScore'); if (provisional.format !== 'provisional' || provisional.version !== 1) fail('provisionalScore must use provisional version 1'); return common(v, emptyScore()); }
export function persistedV2ToProject(value: unknown): Project { const v = object(value, 'project'); return common(v, parseScore(v.score)); }
export function persistedV3ToProject(value: unknown): Project { const v = object(value, 'project'); return common(v, parseScore(v.score), true); }

export function parseProjectFile(json: string): Project { let value: unknown; try { value = JSON.parse(json); } catch (cause) { throw new ProjectFileError('invalid-json', 'The selected file is not valid JSON.', cause); } if (typeof value !== 'object' || value === null || Array.isArray(value) || !('schemaVersion' in value)) throw new ProjectFileError('missing-version', 'The project file has no schemaVersion.'); const version = (value as Record<string, unknown>).schemaVersion; if (version === 1) return persistedV1ToProject(value); if (version === 2) return persistedV2ToProject(value); if (version === 3) return persistedV3ToProject(value); throw new ProjectFileError('unsupported-version', typeof version === 'number' && version > CURRENT_PROJECT_SCHEMA_VERSION ? `This project uses schema version ${version}, but this app supports up to version ${CURRENT_PROJECT_SCHEMA_VERSION}.` : `Unsupported project schema version: ${String(version)}.`); }
export function serializeProjectFile(project: Project): string { return `${JSON.stringify(projectToPersistedV3(project), null, 2)}\n`; }
