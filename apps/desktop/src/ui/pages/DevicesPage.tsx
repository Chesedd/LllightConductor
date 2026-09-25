import { Activity, Cable, Cpu } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../components/EmptyState';

export function DevicesPage() {
  return <section className="page-content"><div className="section-heading"><div><p className="eyebrow violet">HARDWARE</p><h2>Device workspace</h2><p>Connection, assignment, and health information will be managed here.</p></div></div>
    <div className="device-grid"><Panel title="Connected devices" icon={<Cable size={17}/>}><EmptyState compact icon={<Cpu size={24}/>} title="No physical devices connected" description="Hardware discovery is not available at this stage." /></Panel><Panel title="Assigned devices" icon={<Cpu size={17}/>}><p className="muted">Devices assigned to project costumes will appear here.</p></Panel><Panel title="Device diagnostics" icon={<Activity size={17}/>}><p className="muted">Select a connected device to view diagnostics.</p></Panel></div>
  </section>;
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <section className="panel"><h3>{icon}{title}</h3>{children}</section>; }
