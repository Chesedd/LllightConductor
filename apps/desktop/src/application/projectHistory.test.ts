import { describe, expect, it } from 'vitest';
import type { Project } from '../domain/project';
import { ProjectHistory } from './projectHistory';

const project = (name: string): Project => ({ schemaVersion: 3, id: name, name, createdAt: '', updatedAt: '', audio: null, costumes: [], score: { version: 1, events: [] }, deviceBindings: [] });
describe('ProjectHistory', () => {
  it('undoes, redoes, and clears redo only after a successful new commit', () => { const history = new ProjectHistory(); const a = project('A'); const b = project('B'); const c = project('C'); history.reset(a); history.commit(b); expect(history.undo()).toBe(a); expect(history.canRedo).toBe(true); expect(history.commit(a)).toBe(false); expect(history.canRedo).toBe(true); expect(history.redo()).toBe(b); history.commit(c); expect(history.canRedo).toBe(false); });
  it('limits retained undo states', () => { const history = new ProjectHistory(2); history.reset(project('A')); history.commit(project('B')); history.commit(project('C')); history.commit(project('D')); expect(history.undoCount).toBe(2); expect(history.undo()?.name).toBe('C'); expect(history.undo()?.name).toBe('B'); expect(history.undo()).toBeNull(); });
});
