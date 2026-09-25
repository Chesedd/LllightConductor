import type { Project } from '../domain/project';
import type { ProjectFileService } from '../persistence/projectFileService';
import type { RecentProject, RecentProjectsRepository } from '../persistence/recentProjectsRepository';

export type UnsavedDecision = 'save' | 'discard' | 'cancel';
export interface WorkspaceSnapshot { project: Project | null; filePath: string | null; dirty: boolean; recentProjects: RecentProject[] }

export class ProjectWorkspace {
  private state: WorkspaceSnapshot = { project: null, filePath: null, dirty: false, recentProjects: [] };
  constructor(private readonly files: ProjectFileService, private readonly recent: RecentProjectsRepository, private readonly now = () => new Date()) {}
  snapshot(): WorkspaceSnapshot { return { ...this.state, recentProjects: [...this.state.recentProjects] }; }
  async initialize() { this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  setNewProject(project: Project) { this.state = { ...this.state, project, filePath: null, dirty: true }; }
  replaceProject(project: Project) { this.state = { ...this.state, project, dirty: true }; }
  editProject(operation: (project: Project, timestamp: Date) => Project) {
    if (!this.state.project) throw new Error('No project is open');
    this.replaceProject(operation(this.state.project, this.now()));
  }
  async save(): Promise<boolean> { if (!this.state.project) return false; return this.state.filePath ? this.saveAt(this.state.filePath) : this.saveAs(); }
  async saveAs(): Promise<boolean> { if (!this.state.project) return false; const path = await this.files.chooseSavePath(this.state.project); return path ? this.saveAt(path) : false; }
  private async saveAt(path: string) { const project = this.state.project!; await this.files.save(project, path); this.state = { ...this.state, filePath: path, dirty: false }; await this.touchRecent(path, project.name); return true; }
  async chooseAndOpen(confirm: () => Promise<UnsavedDecision>): Promise<boolean> { return this.guard(confirm, async () => { const path = await this.files.chooseOpenPath(); return path ? this.openPath(path) : false; }); }
  async openRecent(path: string, confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, () => this.openPath(path)); }
  async newProject(create: () => Project, confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, async () => { this.setNewProject(create()); return true; }); }
  async close(confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, async () => { this.state = { ...this.state, project: null, filePath: null, dirty: false }; return true; }); }
  async removeRecent(path: string) { await this.recent.remove(path); this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  private async openPath(path: string) { const project = await this.files.open(path); this.state = { ...this.state, project, filePath: path, dirty: false }; await this.touchRecent(path, project.name); return true; }
  private async touchRecent(path: string, displayName: string) { await this.recent.touch({ path, displayName, lastOpenedAt: this.now().toISOString() }); this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  private async guard(confirm: () => Promise<UnsavedDecision>, action: () => Promise<boolean>): Promise<boolean> {
    if (this.state.project && this.state.dirty) { const decision = await confirm(); if (decision === 'cancel') return false; if (decision === 'save' && !await this.save()) return false; }
    return action();
  }
}
