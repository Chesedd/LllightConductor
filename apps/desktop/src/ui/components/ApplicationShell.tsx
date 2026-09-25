import { Cpu, FolderKanban, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useAppState, type Section } from '../state/AppState';
import { ProjectsPage } from '../pages/ProjectsPage';
import { EditorPage } from '../pages/EditorPage';
import { DevicesPage } from '../pages/DevicesPage';
import { SettingsPage } from '../pages/SettingsPage';

const navigation = [
  { name: 'Projects' as const, icon: FolderKanban },
  { name: 'Editor' as const, icon: SlidersHorizontal },
  { name: 'Devices' as const, icon: Cpu },
  { name: 'Settings' as const, icon: Settings },
];

export function ApplicationShell() {
  const { section, navigate } = useAppState();
  return <div className="app-shell">
    <Navigation current={section} onNavigate={navigate} />
    <main className="app-main">
      <PageHeader title={section} />
      {section === 'Projects' && <ProjectsPage />}
      {section === 'Editor' && <EditorPage />}
      {section === 'Devices' && <DevicesPage />}
      {section === 'Settings' && <SettingsPage />}
    </main>
  </div>;
}

function Navigation({ current, onNavigate }: { current: Section; onNavigate: (section: Section) => void }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark"><Sparkles size={19} /></span><span>Lllight<br/><strong>Conductor</strong></span></div>
    <nav aria-label="Main navigation">{navigation.map(({ name, icon: Icon }) =>
      <button key={name} className={current === name ? 'nav-item active' : 'nav-item'} aria-current={current === name ? 'page' : undefined} onClick={() => onNavigate(name)}><Icon size={19}/><span>{name}</span></button>
    )}</nav>
    <div className="version">Local workspace <span>v0.1</span></div>
  </aside>;
}

export function PageHeader({ title }: { title: string }) {
  return <header className="page-header"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1></div><div className="status"><i /> Offline mode</div></header>;
}
