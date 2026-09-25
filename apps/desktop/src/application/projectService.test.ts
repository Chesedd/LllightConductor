import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '../persistence/projectRepository';
import { ProjectService } from './projectService';

describe('ProjectService', () => {
  it('creates a minimal project and makes it discoverable', async () => {
    const repository = new InMemoryProjectRepository();
    const service = new ProjectService(repository, () => new Date('2026-01-02T03:04:05Z'), () => 'project-1');
    const project = await service.createProject('  Opening Show  ');
    expect(project).toMatchObject({ id: 'project-1', name: 'Opening Show', costumes: [], audio: null, score: { durationMs: 0, events: [] } });
    await expect(service.listProjects()).resolves.toEqual([{ id: 'project-1', name: 'Opening Show', updatedAt: '2026-01-02T03:04:05.000Z' }]);
  });
  it('rejects an empty project name', async () => {
    const service = new ProjectService(new InMemoryProjectRepository());
    await expect(service.createProject('  ')).rejects.toThrow('Project name is required');
  });
  it('renames and deletes a project', async () => {
    const repository = new InMemoryProjectRepository();
    const dates = [new Date('2026-01-02T03:04:05Z'), new Date('2026-01-03T03:04:05Z')];
    const service = new ProjectService(repository, () => dates.shift() ?? new Date(), () => 'project-1');
    await service.createProject('Opening Show');
    await expect(service.renameProject('project-1', '  Finale  ')).resolves.toMatchObject({ name: 'Finale', updatedAt: '2026-01-03T03:04:05.000Z' });
    await service.deleteProject('project-1');
    await expect(service.listProjects()).resolves.toEqual([]);
  });
});
