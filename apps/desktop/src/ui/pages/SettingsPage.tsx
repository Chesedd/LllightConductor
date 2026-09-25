import { Code2, Cpu, Music, SlidersHorizontal } from 'lucide-react';

const categories = [
  { title: 'General', description: 'Workspace behavior and appearance', icon: SlidersHorizontal },
  { title: 'Audio', description: 'Future playback and output options', icon: Music },
  { title: 'Hardware', description: 'Future device connection preferences', icon: Cpu },
  { title: 'Developer', description: 'Diagnostics and advanced tooling', icon: Code2 },
];
export function SettingsPage() { return <section className="page-content"><div className="section-heading"><div><p className="eyebrow violet">PREFERENCES</p><h2>Settings</h2><p>Application options will become available as their features are implemented.</p></div></div><div className="settings-list">{categories.map(({ title, description, icon: Icon }) => <section className="settings-row" key={title}><span><Icon size={18}/></span><div><h3>{title}</h3><p>{description}</p></div><span className="coming-soon">Coming later</span></section>)}</div></section>; }
