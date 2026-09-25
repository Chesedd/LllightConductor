import { useState, type FormEvent } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import type { Project } from '../../domain/project';
import { useAppState } from '../state/AppState';
import { EmptyState } from '../components/EmptyState';
import { ProjectCard } from '../components/ProjectCard';
import { ConfirmationDialog } from '../components/ConfirmationDialog';

export function ProjectsPage() {
  const { projects, createProject, renameProject, deleteProject, openProject } = useAppState();
  const [form, setForm] = useState<{ mode: 'create' | 'rename'; project?: Project } | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  return <section className="page-content projects-page">
    <div className="section-heading"><div><p className="eyebrow violet">LIGHT SHOW WORKSPACE</p><h2>Projects</h2><p>Create and manage your local, in-memory show projects.</p></div><button className="button primary" onClick={() => setForm({ mode: 'create' })}><Plus size={17}/> New Project</button></div>
    {projects.length === 0 ? <EmptyState icon={<FolderKanban size={28}/>} title="No projects yet" description="Create your first project to start orchestrating light." action={<button className="button primary" onClick={() => setForm({ mode: 'create' })}><Plus size={17}/> Create project</button>} /> :
      <div className="project-list">{projects.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => openProject(project.id)} onRename={() => setForm({ mode: 'rename', project })} onDelete={() => setDeleting(project)} />)}</div>}
    {form && <ProjectNameDialog mode={form.mode} initialName={form.project?.name ?? ''} onCancel={() => setForm(null)} onSubmit={async (name) => { if (form.project) await renameProject(form.project.id, name); else await createProject(name); setForm(null); }} />}
    {deleting && <ConfirmationDialog title="Delete project?" description={`“${deleting.name}” will be removed from this session. This action cannot be undone.`} confirmLabel="Delete project" danger onCancel={() => setDeleting(null)} onConfirm={() => { void deleteProject(deleting.id); setDeleting(null); }} />}
  </section>;
}

function ProjectNameDialog({ mode, initialName, onCancel, onSubmit }: { mode: 'create' | 'rename'; initialName: string; onCancel: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) void onSubmit(name); };
  return <div className="dialog-backdrop" role="presentation"><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="project-form-title" onSubmit={submit}>
    <h2 id="project-form-title">{mode === 'create' ? 'New Project' : 'Rename project'}</h2><p>Choose a clear name for your light show.</p>
    <label htmlFor="project-name">Project name</label><input id="project-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="My light show" />
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={!name.trim()}>{mode === 'create' ? 'Create project' : 'Save name'}</button></div>
  </form></div>;
}
