import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Project, ProjectId } from '../../domain/project';
import { ProjectService } from '../../application/projectService';
import { InMemoryProjectRepository } from '../../persistence/projectRepository';

export type Section = 'Projects' | 'Editor' | 'Devices' | 'Settings';

interface AppStateValue {
  section: Section;
  projects: Project[];
  activeProject: Project | null;
  navigate: (section: Section) => void;
  createProject: (name: string) => Promise<void>;
  renameProject: (id: ProjectId, name: string) => Promise<void>;
  deleteProject: (id: ProjectId) => Promise<void>;
  openProject: (id: ProjectId) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => new ProjectService(new InMemoryProjectRepository()), []);
  const [section, setSection] = useState<Section>('Projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<ProjectId | null>(null);

  const value: AppStateValue = {
    section,
    projects,
    activeProject: projects.find(({ id }) => id === activeProjectId) ?? null,
    navigate: setSection,
    createProject: async (name) => {
      const project = await service.createProject(name);
      setProjects((current) => [project, ...current]);
    },
    renameProject: async (id, name) => {
      const project = await service.renameProject(id, name);
      setProjects((current) => current.map((item) => item.id === id ? project : item));
    },
    deleteProject: async (id) => {
      await service.deleteProject(id);
      setProjects((current) => current.filter((project) => project.id !== id));
      setActiveProjectId((current) => current === id ? null : current);
    },
    openProject: (id) => {
      setActiveProjectId(id);
      setSection('Editor');
    },
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState must be used within AppStateProvider');
  return state;
}
