import type { Project } from '../domain/project';

export const DEFAULT_HISTORY_CAPACITY = 100;

/** Session-only snapshot history. Project operations are immutable, so snapshots do not clone media data. */
export class ProjectHistory {
  private past: Project[] = [];
  private future: Project[] = [];
  private current: Project | null = null;

  constructor(private readonly capacity = DEFAULT_HISTORY_CAPACITY) {}
  reset(project: Project | null) { this.current = project; this.past = []; this.future = []; }
  commit(project: Project) {
    if (project === this.current) return false;
    if (this.current) this.past.push(this.current);
    if (this.past.length > this.capacity) this.past.splice(0, this.past.length - this.capacity);
    this.current = project; this.future = [];
    return true;
  }
  undo() { const project = this.past.pop(); if (!project) return null; if (this.current) this.future.push(this.current); this.current = project; return project; }
  redo() { const project = this.future.pop(); if (!project) return null; if (this.current) this.past.push(this.current); this.current = project; return project; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get undoCount() { return this.past.length; }
}
