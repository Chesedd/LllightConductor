import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../../domain/project';
import { ProjectService } from '../../application/projectService';
import { ProjectWorkspace, type UnsavedDecision, type WorkspaceSnapshot } from '../../application/projectWorkspace';
import { InMemoryProjectRepository } from '../../persistence/projectRepository';
import { ProjectFileService, TauriProjectFileGateway } from '../../persistence/projectFileService';
import { LocalStorageRecentProjectsRepository } from '../../persistence/recentProjectsRepository';

export type Section = 'Projects' | 'Editor' | 'Devices' | 'Settings';
interface AppStateValue extends WorkspaceSnapshot {
  section: Section; error: string | null;
  navigate: (section: Section) => void; createProject: (name: string) => Promise<void>; openProject: () => Promise<void>;
  openRecent: (path: string) => Promise<void>; removeRecent: (path: string) => Promise<void>; save: () => Promise<void>; saveAs: () => Promise<void>;
  updateProject: (project: Project) => void; clearError: () => void;
}
const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children, workspace: supplied }: { children: ReactNode; workspace?: ProjectWorkspace }) {
  const workspace = useMemo(() => supplied ?? new ProjectWorkspace(new ProjectFileService(new TauriProjectFileGateway()), new LocalStorageRecentProjectsRepository()), [supplied]);
  const creator = useMemo(() => new ProjectService(new InMemoryProjectRepository()), []);
  const [snapshot, setSnapshot] = useState(workspace.snapshot()); const [section, setSection] = useState<Section>('Projects'); const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((choice: UnsavedDecision) => void) | null>(null); const [confirming, setConfirming] = useState(false);
  const sync = () => setSnapshot(workspace.snapshot());
  const run = async (operation: () => Promise<unknown>) => { try { setError(null); await operation(); sync(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); sync(); } };
  const confirmUnsaved = () => new Promise<UnsavedDecision>(resolve => { resolver.current = resolve; setConfirming(true); });
  const decide = (choice: UnsavedDecision) => { setConfirming(false); resolver.current?.(choice); resolver.current = null; };
  useEffect(() => { void run(() => workspace.initialize()); }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  const value: AppStateValue = { ...snapshot, section, error, clearError: () => setError(null), navigate: (next) => { if (next === 'Projects' && section === 'Editor') void run(async () => { if (await workspace.close(confirmUnsaved)) setSection(next); }); else setSection(next); },
    createProject: async name => run(async () => { const project = await creator.createProject(name); if (await workspace.newProject(() => project, confirmUnsaved)) setSection('Editor'); }),
    openProject: async () => run(async () => { if (await workspace.chooseAndOpen(confirmUnsaved)) setSection('Editor'); }),
    openRecent: async path => run(async () => { if (await workspace.openRecent(path, confirmUnsaved)) setSection('Editor'); }), removeRecent: path => run(() => workspace.removeRecent(path)),
    save: () => run(() => workspace.save()), saveAs: () => run(() => workspace.saveAs()), updateProject: project => { workspace.replaceProject(project); sync(); },
  };
  return <AppStateContext.Provider value={value}>{children}{confirming && <UnsavedDialog onChoose={decide}/>} {error && <ErrorDialog message={error} onClose={() => setError(null)}/>}</AppStateContext.Provider>;
}

function UnsavedDialog({ onChoose }: { onChoose: (choice: UnsavedDecision) => void }) { return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><h2>Unsaved changes</h2><p>Save your changes before continuing?</p><div className="dialog-actions"><button className="button secondary" onClick={() => onChoose('cancel')}>Cancel</button><button className="button secondary" onClick={() => onChoose('discard')}>Don't Save</button><button className="button primary" onClick={() => onChoose('save')}>Save</button></div></section></div>; }
function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) { return <div className="dialog-backdrop"><section className="dialog" role="alertdialog" aria-modal="true"><h2>Project operation failed</h2><p>{message}</p><div className="dialog-actions"><button className="button primary" onClick={onClose}>OK</button></div></section></div>; }
// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() { const state = useContext(AppStateContext); if (!state) throw new Error('useAppState must be used within AppStateProvider'); return state; }
