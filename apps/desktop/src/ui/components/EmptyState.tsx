import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action, compact = false }: { icon: ReactNode; title: string; description: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state${compact ? ' compact' : ''}`}>
    <div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}
  </div>;
}
