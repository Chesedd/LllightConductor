import { ChevronRight, Clock3, FolderKanban, Minus, Pause, Play, Plus, Save, Upload } from 'lucide-react';
import { useAppState } from '../state/AppState';
import { EmptyState } from '../components/EmptyState';
import type { Project } from '../../domain/project';

export function EditorPage() {
  const { project, navigate } = useAppState();
  if (!project) return <section className="page-content"><EmptyState icon={<FolderKanban size={28}/>} title="No project open" description="Open a project before entering the editor." action={<button className="button primary" onClick={() => navigate('Projects')}>Back to Projects</button>} /></section>;
  return <section className="editor" aria-label={`${project.name} editor`}>
    <EditorToolbar />
    <div className="editor-body"><ProjectTree project={project} />
      <div className="timeline-placeholder"><div className="timeline-ruler" aria-hidden="true">00:00 <span>00:10</span><span>00:20</span><span>00:30</span></div><Clock3 size={34}/><h2>Timeline will appear here</h2><p>Waveform and lighting tracks will be added in a future stage.</p></div>
    </div>
  </section>;
}

export function EditorToolbar() {
  const { project, dirty, filePath, save, saveAs } = useAppState();
  return <div className="editor-toolbar" aria-label="Project toolbar">
    <button className="transport" disabled aria-label="Play"><Play size={16}/></button><button className="transport" disabled aria-label="Pause"><Pause size={16}/></button>
    <div className="project-session"><strong>{project?.name}{dirty ? ' *' : ''}</strong><span title={filePath ?? undefined}>{filePath ?? 'Unsaved project'}</span></div><div className="toolbar-spacer"/>
    <div className="zoom"><button disabled aria-label="Zoom out"><Minus size={14}/></button><span>100%</span><button disabled aria-label="Zoom in"><Plus size={14}/></button></div>
    <button className="button secondary" onClick={() => void save()}><Save size={15}/> Save</button><button className="button secondary" onClick={() => void saveAs()}>Save As</button><button className="button secondary" disabled><Upload size={15}/> Upload</button>
  </div>;
}

export function ProjectTree({ project }: { project: Project }) {
  return <aside className="project-tree" aria-label="Project structure"><p className="panel-label">PROJECT STRUCTURE</p><div className="tree-item selected"><ChevronRight size={14}/><FolderKanban size={15}/><strong>{project.name}</strong></div>
    {project.costumes.length === 0 ? <div className="tree-empty">No costumes yet</div> : project.costumes.map(costume => <div key={costume.id} className="tree-branch"><div className="tree-item">{costume.name}</div><div className="tree-item">{costume.master.displayName}</div>{costume.master.slaves.map(slave => <div key={slave.id}><div className="tree-item">{slave.displayName}</div>{slave.channels.map(channel => <div className="tree-item" key={channel.id}>{channel.displayName}</div>)}</div>)}</div>)}
  </aside>;
}
