import { describe, expect, it } from 'vitest';
import { ProjectService } from '../application/projectService';
import { InMemoryProjectRepository } from '../persistence/projectRepository';
import type { Project } from './project';
import { addChannel, addCostume, addSlave, removeChannel, removeCostume, removeSlave, renameChannel, renameCostume, renameSlave, reorderChannels, reorderCostumes, reorderSlaves } from './projectOperations';
import { validateProject } from './projectValidation';

const at = '2026-02-02T00:00:00.000Z';
const ids = (...values: string[]) => { const pending = [...values]; return () => pending.shift() ?? 'unexpected-id'; };
async function emptyProject(): Promise<Project> {
  return new ProjectService(new InMemoryProjectRepository(), () => new Date('2026-01-01T00:00:00Z'), ids('project')).createProject('Show');
}
async function topology(): Promise<Project> {
  let project = await emptyProject();
  project = addCostume(project, 'Red', ids('costume', 'master'), at);
  project = addSlave(project, 'master', { displayName: 'Left', logicalAddress: 1 }, ids('slave'), at);
  return addChannel(project, 'slave', { displayName: 'Wire', hardwareOutputIdentifier: 'OUT-A' }, ids('channel'), at);
}

describe('project domain operations', () => {
  it('creates a valid versioned project', async () => {
    const project = await emptyProject();
    expect(project).toMatchObject({ schemaVersion: 1, id: 'project', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(validateProject(project)).toEqual([]);
  });

  it('adds multiple costumes, slaves, and channels with stable generated IDs', async () => {
    let project = await emptyProject();
    project = addCostume(project, 'Red', ids('red', 'red-master'), at);
    project = addCostume(project, 'Blue', ids('blue', 'blue-master'), at);
    project = addSlave(project, 'red-master', { displayName: 'Left', logicalAddress: 1 }, ids('left'), at);
    project = addSlave(project, 'red-master', { displayName: 'Right', logicalAddress: 2 }, ids('right'), at);
    project = addChannel(project, 'left', { displayName: 'Collar', hardwareOutputIdentifier: 'A' }, ids('collar'), at);
    project = addChannel(project, 'left', { displayName: 'Sleeve', hardwareOutputIdentifier: 'B' }, ids('sleeve'), at);
    expect(project.costumes.map(value => value.id)).toEqual(['red', 'blue']);
    expect(project.costumes[0].master.slaves.map(value => value.id)).toEqual(['left', 'right']);
    expect(project.costumes[0].master.slaves[0].channels.map(value => value.id)).toEqual(['collar', 'sleeve']);
  });

  it('rejects duplicate IDs anywhere in the project', async () => {
    const project = addCostume(await emptyProject(), 'Red', ids('costume', 'master'), at);
    const invalid = { ...project, costumes: [{ ...project.costumes[0], id: 'project' }] };
    expect(validateProject(invalid)).toContainEqual({ path: 'costumes[0].id', message: 'ID conflicts with id' });
  });

  it('renames every entity without changing its ID', async () => {
    let project = await topology();
    project = renameCostume(project, 'costume', 'Crimson', at);
    project = renameSlave(project, 'slave', 'Right', at);
    project = renameChannel(project, 'channel', 'Cuff', at);
    expect(project.costumes[0]).toMatchObject({ id: 'costume', name: 'Crimson', master: { slaves: [{ id: 'slave', displayName: 'Right', channels: [{ id: 'channel', displayName: 'Cuff' }] }] } });
  });

  it('reorders entities without changing IDs', async () => {
    let project = await topology();
    project = addCostume(project, 'Blue', ids('costume-2', 'master-2'), at);
    project = addSlave(project, 'master', { displayName: 'Second', logicalAddress: 2 }, ids('slave-2'), at);
    project = addChannel(project, 'slave', { displayName: 'Second', hardwareOutputIdentifier: 'OUT-B' }, ids('channel-2'), at);
    project = reorderCostumes(project, 0, 1, at);
    project = reorderSlaves(project, 'master', 0, 1, at);
    project = reorderChannels(project, 'slave', 0, 1, at);
    expect(project.costumes.map(value => value.id)).toEqual(['costume-2', 'costume']);
    expect(project.costumes[1].master.slaves.map(value => value.id)).toEqual(['slave-2', 'slave']);
    expect(project.costumes[1].master.slaves[1].channels.map(value => value.id)).toEqual(['channel-2', 'channel']);
  });

  it('removes channels, slaves, and costumes', async () => {
    const original = await topology();
    expect(removeChannel(original, 'channel', at).costumes[0].master.slaves[0].channels).toEqual([]);
    expect(removeSlave(original, 'slave', at).costumes[0].master.slaves).toEqual([]);
    expect(removeCostume(original, 'costume', at).costumes).toEqual([]);
  });

  it('updates updatedAt after a mutation', async () => {
    expect(addCostume(await emptyProject(), 'Red', ids('costume', 'master'), at).updatedAt).toBe(at);
  });

  it('detects a conflicting logical slave address', async () => {
    let project = addCostume(await emptyProject(), 'Red', ids('costume', 'master'), at);
    project = addSlave(project, 'master', { displayName: 'One', logicalAddress: 7 }, ids('one'), at);
    expect(() => addSlave(project, 'master', { displayName: 'Two', logicalAddress: 7 }, ids('two'), at)).toThrow('Logical address must be unique');
  });

  it('detects a conflicting hardware output identifier', async () => {
    const project = await topology();
    expect(() => addChannel(project, 'slave', { displayName: 'Other', hardwareOutputIdentifier: 'OUT-A' }, ids('other'), at)).toThrow('Hardware output identifier must be unique');
  });

  it.each([
    ['costume', (project: Project) => addCostume(project, ' ', ids('c', 'm'), at)],
    ['slave', (project: Project) => addSlave(project, 'master', { displayName: ' ' }, ids('s'), at)],
    ['channel', (project: Project) => addChannel(project, 'slave', { displayName: ' ', hardwareOutputIdentifier: 'A' }, ids('ch'), at)],
  ])('rejects an empty %s name', async (_label, operation) => {
    const project = await topology();
    expect(() => operation(project)).toThrow(/name is required/i);
  });
});
