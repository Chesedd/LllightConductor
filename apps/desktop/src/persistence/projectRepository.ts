import type { Project, ProjectId } from '../domain/project';

export interface ProjectSummary { id: ProjectId; name: string; updatedAt: string }
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: ProjectId): Promise<Project | null>;
  save(project: Project): Promise<void>;
}

export class InMemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<ProjectId, Project>();
  async list(): Promise<ProjectSummary[]> { return [...this.#projects.values()].map(({ id, name, updatedAt }) => ({ id, name, updatedAt })); }
  async get(id: ProjectId): Promise<Project | null> { return this.#projects.get(id) ?? null; }
  async save(project: Project): Promise<void> { this.#projects.set(project.id, project); }
}
