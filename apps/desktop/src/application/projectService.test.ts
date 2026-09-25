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
});
