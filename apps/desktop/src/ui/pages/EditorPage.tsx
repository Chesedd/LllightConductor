import { ChevronRight, Clock3, FolderKanban, Minus, Pause, Play, Plus, Upload } from 'lucide-react';
import { useAppState } from '../state/AppState';
import { EmptyState } from '../components/EmptyState';

export function EditorPage() {
  const { activeProject, navigate } = useAppState();
  if (!activeProject) return <section className="page-content"><EmptyState icon={<FolderKanban size={28}/>} title="No project open" description="Open a project before entering the editor." action={<button className="button primary" onClick={() => navigate('Projects')}>Back to Projects</button>} /></section>;
  return <section className="editor" aria-label={`${activeProject.name} editor`}>
    <EditorToolbar />
    <div className="editor-body"><ProjectTree projectName={activeProject.name} />
      <div className="timeline-placeholder"><div className="timeline-ruler" aria-hidden="true">00:00 <span>00:10</span><span>00:20</span><span>00:30</span></div><Clock3 size={34}/><h2>Timeline will appear here</h2><p>Waveform and lighting tracks will be added in a future stage.</p></div>
    </div>
  </section>;
}

export function EditorToolbar() {
  return <div className="editor-toolbar" aria-label="Editor toolbar">
    <button className="transport" disabled aria-label="Play"><Play size={16}/></button><button className="transport" disabled aria-label="Pause"><Pause size={16}/></button>
    <div className="time-display">00:00:00.000</div><div className="toolbar-spacer"/>
    <div className="zoom"><button disabled aria-label="Zoom out"><Minus size={14}/></button><span>100%</span><button disabled aria-label="Zoom in"><Plus size={14}/></button></div>
    <button className="button secondary" disabled>Compile</button><button className="button secondary" disabled><Upload size={15}/> Upload</button>
  </div>;
}

export function ProjectTree({ projectName }: { projectName: string }) {
  return <aside className="project-tree" aria-label="Project structure"><p className="panel-label">PROJECT STRUCTURE</p><div className="tree-item selected"><ChevronRight size={14}/><FolderKanban size={15}/><strong>{projectName}</strong></div><div className="tree-empty">No costumes yet</div></aside>;
}
