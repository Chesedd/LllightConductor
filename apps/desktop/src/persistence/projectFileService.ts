import { invoke } from '@tauri-apps/api/core';
import type { Project } from '../domain/project';
import { parseProjectFile, ProjectFileError, serializeProjectFile } from './projectFile';

export interface ProjectFileGateway {
  chooseOpenPath(): Promise<string | null>;
  chooseSavePath(suggestedName: string): Promise<string | null>;
  readText(path: string): Promise<string>;
  atomicWriteText(path: string, contents: string): Promise<void>;
}

export class TauriProjectFileGateway implements ProjectFileGateway {
  chooseOpenPath() { return invoke<string | null>('choose_project_to_open'); }
  chooseSavePath(suggestedName: string) { return invoke<string | null>('choose_project_save_path', { suggestedName }); }
  readText(path: string) { return invoke<string>('read_project_file', { path }); }
  atomicWriteText(path: string, contents: string) { return invoke<void>('atomic_write_project_file', { path, contents }); }
}

export class ProjectFileService {
  constructor(private readonly gateway: ProjectFileGateway) {}
  chooseOpenPath() { return this.gateway.chooseOpenPath(); }
  chooseSavePath(project: Project) { return this.gateway.chooseSavePath(`${safeFilename(project.name)}.lightshow`); }
  async open(path: string): Promise<Project> {
    try { return parseProjectFile(await this.gateway.readText(path)); }
    catch (error) { if (error instanceof ProjectFileError) throw error; throw new ProjectFileError('io', `Could not open project file: ${errorMessage(error)}`, error); }
  }
  async save(project: Project, path: string): Promise<void> {
    try { await this.gateway.atomicWriteText(path, serializeProjectFile(project)); }
    catch (error) { throw new ProjectFileError('io', `Could not save project file: ${errorMessage(error)}`, error); }
  }
}

const safeFilename = (name: string) => [...name].map(character => '<>:"/\\|?*'.includes(character) || character.charCodeAt(0) < 32 ? '_' : character).join('').trim() || 'Untitled';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
