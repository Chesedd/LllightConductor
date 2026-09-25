import type { Project } from '../domain/project';
import type { ProjectRepository } from '../persistence/projectRepository';
import { emptyScore } from '../score/score';

export class ProjectService {
  constructor(private readonly projects: ProjectRepository, private readonly now = () => new Date(), private readonly createId = () => crypto.randomUUID()) {}

  listProjects() { return this.projects.list(); }
  async createProject(name: string): Promise<Project> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Project name is required');
    const timestamp = this.now().toISOString();
    const project: Project = { id: this.createId(), name: normalizedName, createdAt: timestamp, updatedAt: timestamp, audio: null, costumes: [], score: emptyScore() };
    await this.projects.save(project);
    return project;
  }
}
