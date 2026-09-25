import { Music, Music2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import type { Project } from '../../domain/project';

export function ProjectCard({ project, onOpen, onRename, onDelete }: { project: Project; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  return <article className="project-card">
    <div className="project-icon"><Sparkles /></div>
    <div className="project-details"><h3>{project.name}</h3><p>{project.costumes.length} costumes <span>·</span> {project.audio ? <><Music size={13}/> Audio attached</> : <><Music2 size={13}/> No audio</>}</p></div>
    <div className="card-actions"><button className="icon-button" aria-label={`Rename ${project.name}`} onClick={onRename}><Pencil size={15}/></button><button className="icon-button danger-text" aria-label={`Delete ${project.name}`} onClick={onDelete}><Trash2 size={15}/></button><button className="button secondary" onClick={onOpen}>Open</button></div>
  </article>;
}
