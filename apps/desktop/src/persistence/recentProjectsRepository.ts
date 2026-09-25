export interface RecentProject { path: string; displayName: string; lastOpenedAt: string }
export interface RecentProjectsRepository { list(): Promise<RecentProject[]>; touch(entry: RecentProject): Promise<void>; remove(path: string): Promise<void> }

export class LocalStorageRecentProjectsRepository implements RecentProjectsRepository {
  constructor(private readonly storage: Storage = localStorage, private readonly key = 'lllight-conductor.recent-projects.v1') {}
  async list() { return parse(this.storage.getItem(this.key)); }
  async touch(entry: RecentProject) { const entries = (await this.list()).filter(({ path }) => path !== entry.path); this.storage.setItem(this.key, JSON.stringify([entry, ...entries].slice(0, 10))); }
  async remove(path: string) { this.storage.setItem(this.key, JSON.stringify((await this.list()).filter(entry => entry.path !== path))); }
}

export class InMemoryRecentProjectsRepository implements RecentProjectsRepository {
  entries: RecentProject[] = [];
  async list() { return [...this.entries]; }
  async touch(entry: RecentProject) { this.entries = [entry, ...this.entries.filter(({ path }) => path !== entry.path)].slice(0, 10); }
  async remove(path: string) { this.entries = this.entries.filter(entry => entry.path !== path); }
}

function parse(raw: string | null): RecentProject[] {
  if (!raw) return [];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is RecentProject => typeof item === 'object' && item !== null && typeof (item as RecentProject).path === 'string' && typeof (item as RecentProject).displayName === 'string' && typeof (item as RecentProject).lastOpenedAt === 'string') : []; } catch { return []; }
}
