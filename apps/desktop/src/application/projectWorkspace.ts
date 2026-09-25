import { createStableId, type ChannelId, type EntityId, type IdGenerator, type Project } from '../domain/project';
import type { TimelineTimeMs } from '../domain/timelineTime';
import { addScoreEvents, createLightInterval, moveLightInterval, moveScoreEvents, removeScoreEvent, removeScoreEvents, resizeLightInterval } from '../score/scoreOperations';
import { ProjectHistory } from './projectHistory';
import type { ProjectFileService } from '../persistence/projectFileService';
import type { RecentProject, RecentProjectsRepository } from '../persistence/recentProjectsRepository';

export type UnsavedDecision = 'save' | 'discard' | 'cancel';
export interface WorkspaceSnapshot { project: Project | null; filePath: string | null; dirty: boolean; recentProjects: RecentProject[]; canUndo: boolean; canRedo: boolean }

export class ProjectWorkspace {
  private state: WorkspaceSnapshot = { project: null, filePath: null, dirty: false, recentProjects: [], canUndo: false, canRedo: false };
  private readonly history: ProjectHistory; private savedProject: Project | null = null;
  constructor(private readonly files: ProjectFileService, private readonly recent: RecentProjectsRepository, private readonly now = () => new Date(), private readonly createId: IdGenerator = createStableId, historyCapacity = 100) { this.history = new ProjectHistory(historyCapacity); }
  snapshot(): WorkspaceSnapshot { return { ...this.state, recentProjects: [...this.state.recentProjects] }; }
  async initialize() { this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  private sync(project: Project | null) { this.state = { ...this.state, project, dirty: project !== this.savedProject, canUndo: this.history.canUndo, canRedo: this.history.canRedo }; }
  setNewProject(project: Project) { this.savedProject = null; this.history.reset(project); this.state = { ...this.state, filePath: null }; this.sync(project); }
  replaceProject(project: Project) { if (this.history.commit(project)) this.sync(project); }
  editProject(operation: (project: Project, timestamp: Date) => Project) {
    if (!this.state.project) throw new Error('No project is open');
    this.replaceProject(operation(this.state.project, this.now()));
  }
  addLightInterval(input: { channelId: ChannelId; startMs: TimelineTimeMs; endMs: TimelineTimeMs }) { this.editProject((project, at) => createLightInterval(project, input, this.createId, at)); }
  moveLightInterval(eventId: EntityId, startMs: TimelineTimeMs) { this.editProject((project, at) => moveLightInterval(project, eventId, startMs, at)); }
  resizeLightInterval(eventId: EntityId, input: { startMs?: TimelineTimeMs; endMs?: TimelineTimeMs }) { this.editProject((project, at) => resizeLightInterval(project, eventId, input, at)); }
  removeScoreEvent(eventId: EntityId) { this.editProject((project, at) => removeScoreEvent(project, eventId, at)); }
  removeScoreEvents(eventIds: readonly EntityId[]) { this.editProject((project, at) => removeScoreEvents(project, eventIds, at)); }
  moveScoreEvents(eventIds: readonly EntityId[], deltaMs: TimelineTimeMs) { this.editProject((project, at) => moveScoreEvents(project, eventIds, deltaMs, at)); }
  addScoreEvents(inputs: Parameters<typeof addScoreEvents>[1]) { let ids: EntityId[] = []; this.editProject((project, at) => { const result = addScoreEvents(project, inputs, this.createId, at); ids = result.eventIds; return result.project; }); return ids; }
  undo() { const project = this.history.undo(); if (project) this.sync(project); return !!project; }
  redo() { const project = this.history.redo(); if (project) this.sync(project); return !!project; }
  async save(): Promise<boolean> { if (!this.state.project) return false; return this.state.filePath ? this.saveAt(this.state.filePath) : this.saveAs(); }
  async saveAs(): Promise<boolean> { if (!this.state.project) return false; const path = await this.files.chooseSavePath(this.state.project); return path ? this.saveAt(path) : false; }
  private async saveAt(path: string) { const project = this.state.project!; await this.files.save(project, path); this.savedProject = project; this.state = { ...this.state, filePath: path }; this.sync(project); await this.touchRecent(path, project.name); return true; }
  async chooseAndOpen(confirm: () => Promise<UnsavedDecision>): Promise<boolean> { return this.guard(confirm, async () => { const path = await this.files.chooseOpenPath(); return path ? this.openPath(path) : false; }); }
  async openRecent(path: string, confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, () => this.openPath(path)); }
  async newProject(create: () => Project, confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, async () => { this.setNewProject(create()); return true; }); }
  async close(confirm: () => Promise<UnsavedDecision>) { return this.guard(confirm, async () => { this.savedProject = null; this.history.reset(null); this.state = { ...this.state, project: null, filePath: null, dirty: false, canUndo: false, canRedo: false }; return true; }); }
  async removeRecent(path: string) { await this.recent.remove(path); this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  private async openPath(path: string) { const project = await this.files.open(path); this.savedProject = project; this.history.reset(project); this.state = { ...this.state, filePath: path }; this.sync(project); await this.touchRecent(path, project.name); return true; }
  private async touchRecent(path: string, displayName: string) { await this.recent.touch({ path, displayName, lastOpenedAt: this.now().toISOString() }); this.state = { ...this.state, recentProjects: await this.recent.list() }; }
  private async guard(confirm: () => Promise<UnsavedDecision>, action: () => Promise<boolean>): Promise<boolean> {
    if (this.state.project && this.state.dirty) { const decision = await confirm(); if (decision === 'cancel') return false; if (decision === 'save' && !await this.save()) return false; }
    return action();
  }
}
