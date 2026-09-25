import { useMemo, useState } from 'react';
import { Cpu, FolderKanban, Plus, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ProjectService } from '../application/projectService';
import { InMemoryProjectRepository } from '../persistence/projectRepository';

type Section = 'Projects' | 'Editor' | 'Devices' | 'Settings';
const nav = [
  { name: 'Projects' as const, icon: FolderKanban }, { name: 'Editor' as const, icon: SlidersHorizontal },
  { name: 'Devices' as const, icon: Cpu }, { name: 'Settings' as const, icon: Settings },
];

export function App() {
  const [section, setSection] = useState<Section>('Projects');
  const [projectCreated, setProjectCreated] = useState(false);
  const service = useMemo(() => new ProjectService(new InMemoryProjectRepository()), []);
  const createDemoProject = async () => { await service.createProject('Untitled light show'); setProjectCreated(true); };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Sparkles size={19} /></span><span>Lllight<br/><strong>Conductor</strong></span></div>
      <nav aria-label="Main navigation">{nav.map(({ name, icon: Icon }) => <button key={name} className={section === name ? 'nav-item active' : 'nav-item'} onClick={() => setSection(name)}><Icon size={19}/><span>{name}</span></button>)}</nav>
      <div className="version">Local workspace <span>v0.1</span></div>
    </aside>
    <main>
      <header><div><p className="eyebrow">WORKSPACE</p><h1>{section}</h1></div><div className="status"><i /> Offline mode</div></header>
      {section === 'Projects' ? <section className="projects">
        <div className="hero"><div><p className="eyebrow violet">LIGHT SHOW STUDIO</p><h2>Bring every beat<br/>into the <em>light.</em></h2><p className="intro">Design synchronized performances for every costume, channel, and moment — from one focused workspace.</p></div><div className="orb" aria-hidden="true"><span/><span/><span/></div></div>
        <div className="section-heading"><div><h3>Your projects</h3><p>Pick up where you left off, or begin a new show.</p></div><button className="primary" onClick={createDemoProject}><Plus size={17}/> New project</button></div>
        {projectCreated ? <article className="project-card"><div className="project-icon"><Sparkles/></div><div><h4>Untitled light show</h4><p>Just now · No audio · 0 costumes</p></div><button onClick={() => setSection('Editor')}>Open</button></article> : <div className="empty"><div className="empty-icon"><FolderKanban size={30}/></div><h4>No projects yet</h4><p>Create your first project to start orchestrating light.</p><button onClick={createDemoProject}><Plus size={17}/> Create project</button></div>}
      </section> : <Placeholder section={section}/>} 
    </main>
  </div>;
}

function Placeholder({ section }: { section: Exclude<Section, 'Projects'> }) {
  const descriptions = { Editor: 'The score timeline and audio workspace will live here.', Devices: 'Hardware discovery and diagnostics will live here.', Settings: 'Application preferences will live here.' };
  return <section className="placeholder"><div className="empty-icon"><Sparkles size={30}/></div><h2>{section}</h2><p>{descriptions[section]}</p><span>Planned for a future stage</span></section>;
}
