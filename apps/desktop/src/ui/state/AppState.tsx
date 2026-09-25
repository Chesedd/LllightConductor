import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStableId, type ChannelId, type ControllerId, type CostumeId, type Project } from '../../domain/project';
import { addChannel, addCostume, addSlave, changeChannelHardwareOutputIdentifier, changeSlaveLogicalAddress, removeChannel, removeCostume, removeSlave, renameChannel, renameCostume, renameMaster, renameSlave, reorderChannels, reorderCostumes, reorderSlaves } from '../../domain/projectOperations';
import { ProjectService } from '../../application/projectService';
import { ProjectWorkspace, type UnsavedDecision, type WorkspaceSnapshot } from '../../application/projectWorkspace';
import { InMemoryProjectRepository } from '../../persistence/projectRepository';
import { ProjectFileService, TauriProjectFileGateway } from '../../persistence/projectFileService';
import { LocalStorageRecentProjectsRepository } from '../../persistence/recentProjectsRepository';
import { removeProjectAudio, setProjectAudio } from '../../domain/audioOperations';
import { AudioMediaService, TauriAudioMediaGateway } from '../../media/audioMediaService';
import { AudioPlaybackController, HtmlAudioPlaybackAdapter, type PlaybackState } from '../../media/audioPlayback';
import { timelineTime, type TimelineTimeMs } from '../../domain/timelineTime';

export type Section = 'Projects' | 'Editor' | 'Devices' | 'Settings';
interface AppStateValue extends WorkspaceSnapshot {
  section: Section; error: string | null;
  navigate: (section: Section) => void; createProject: (name: string) => Promise<void>; openProject: () => Promise<void>;
  openRecent: (path: string) => Promise<void>; removeRecent: (path: string) => Promise<void>; save: () => Promise<void>; saveAs: () => Promise<void>;
  updateProject: (project: Project) => void; clearError: () => void;
  audio: {
    availability: 'none' | 'loading' | 'ready' | 'missing' | 'error'; transport: PlaybackState;
    importAudio: () => Promise<void>; locateAudio: () => Promise<void>; removeAudio: () => void;
    play: () => Promise<void>; pause: () => void; seek: (position: TimelineTimeMs) => void;
  };
  topology: {
    addCostume: (name: string) => boolean; renameCostume: (id: CostumeId, name: string) => boolean; deleteCostume: (id: CostumeId) => boolean; moveCostume: (from: number, to: number) => boolean;
    renameMaster: (id: ControllerId, name: string) => boolean; addPico: (masterId: ControllerId, name: string) => boolean; renamePico: (id: ControllerId, name: string) => boolean; setPicoAddress: (id: ControllerId, address: number) => boolean; deletePico: (id: ControllerId) => boolean; movePico: (masterId: ControllerId, from: number, to: number) => boolean;
    addChannel: (picoId: ControllerId, name: string, output: string) => boolean; renameChannel: (id: ChannelId, name: string) => boolean; setChannelOutput: (id: ChannelId, output: string) => boolean; deleteChannel: (id: ChannelId) => boolean; moveChannel: (picoId: ControllerId, from: number, to: number) => boolean;
  };
}
const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children, workspace: supplied, playback: suppliedPlayback, media: suppliedMedia }: { children: ReactNode; workspace?: ProjectWorkspace; playback?: AudioPlaybackController; media?: AudioMediaService }) {
  const workspace = useMemo(() => supplied ?? new ProjectWorkspace(new ProjectFileService(new TauriProjectFileGateway()), new LocalStorageRecentProjectsRepository()), [supplied]);
  const creator = useMemo(() => new ProjectService(new InMemoryProjectRepository()), []);
  const [snapshot, setSnapshot] = useState(workspace.snapshot()); const [section, setSection] = useState<Section>('Projects'); const [error, setError] = useState<string | null>(null);
  const playback = useMemo(() => suppliedPlayback ?? new AudioPlaybackController(new HtmlAudioPlaybackAdapter()), [suppliedPlayback]);
  const media = useMemo(() => suppliedMedia ?? new AudioMediaService(new TauriAudioMediaGateway()), [suppliedMedia]);
  const [transport, setTransport] = useState(playback.snapshot()); const [audioAvailability, setAudioAvailability] = useState<'none' | 'loading' | 'ready' | 'missing' | 'error'>('none');
  const resolver = useRef<((choice: UnsavedDecision) => void) | null>(null); const [confirming, setConfirming] = useState(false);
  const sync = () => setSnapshot(workspace.snapshot());
  const run = async (operation: () => Promise<unknown>) => { try { setError(null); await operation(); sync(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); sync(); } };
  const confirmUnsaved = () => new Promise<UnsavedDecision>(resolve => { resolver.current = resolve; setConfirming(true); });
  const decide = (choice: UnsavedDecision) => { setConfirming(false); resolver.current?.(choice); resolver.current = null; };
  const edit = (operation: (project: Project, timestamp: Date) => Project) => { try { setError(null); workspace.editProject(operation); sync(); return true; } catch (cause) { setError(friendlyError(cause)); sync(); return false; } };
  useEffect(() => { void run(() => workspace.initialize()); }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => playback.subscribe(setTransport), [playback]);
  const audioReference = snapshot.project?.audio?.reference;
  useEffect(() => {
    let current = true; playback.unload();
    if (!audioReference) { setAudioAvailability('none'); return () => { current = false; }; }
    setAudioAvailability('loading');
    void media.resolve(audioReference).then(async result => {
      if (!current) return;
      if (result.status === 'missing') { setAudioAvailability('missing'); return; }
      if (result.status === 'unsupported') { setAudioAvailability('error'); return; }
      try { await playback.load(result.url); if (current) setAudioAvailability('ready'); } catch { if (current) setAudioAvailability('error'); }
    }).catch(cause => { if (current) { setAudioAvailability('error'); setError(cause instanceof Error ? cause.message : String(cause)); } });
    return () => { current = false; playback.unload(); };
  }, [snapshot.project?.id, audioReference, media, playback]); // intentionally follows persisted media identity
  const chooseAudio = async () => { const path = await media.choose(); if (!path) return; setAudioAvailability('loading'); const resolved = await media.resolve({ type: 'external-uri', uri: path }); if (resolved.status !== 'available') throw new Error('The selected audio file cannot be read.'); const metadata = await playback.load(resolved.url); workspace.editProject((project, at) => setProjectAudio(project, { displayName: media.displayName(path), uri: path, durationMs: metadata.durationMs, mediaType: metadata.mediaType ?? media.mediaType(path) }, createStableId, at)); sync(); setAudioAvailability('ready'); };
  const value: AppStateValue = { ...snapshot, section, error, clearError: () => setError(null), navigate: (next) => { if (next === 'Projects' && section === 'Editor') void run(async () => { if (await workspace.close(confirmUnsaved)) setSection(next); }); else setSection(next); },
    createProject: async name => run(async () => { const project = await creator.createProject(name); if (await workspace.newProject(() => project, confirmUnsaved)) setSection('Editor'); }),
    openProject: async () => run(async () => { if (await workspace.chooseAndOpen(confirmUnsaved)) setSection('Editor'); }),
    openRecent: async path => run(async () => { if (await workspace.openRecent(path, confirmUnsaved)) setSection('Editor'); }), removeRecent: path => run(() => workspace.removeRecent(path)),
    save: () => run(() => workspace.save()), saveAs: () => run(() => workspace.saveAs()), updateProject: project => { workspace.replaceProject(project); sync(); },
    audio: { availability: audioAvailability, transport, importAudio: () => run(chooseAudio), locateAudio: () => run(chooseAudio), removeAudio: () => { playback.unload(); edit((project, at) => removeProjectAudio(project, at)); setAudioAvailability('none'); }, play: () => run(() => playback.play()), pause: () => playback.pause(), seek: value => playback.seek(timelineTime(value)) },
    topology: {
      addCostume: name => edit((project, at) => addCostume(project, name, createStableId, at)), renameCostume: (id, name) => edit((project, at) => renameCostume(project, id, name, at)), deleteCostume: id => edit((project, at) => removeCostume(project, id, at)), moveCostume: (from, to) => edit((project, at) => reorderCostumes(project, from, to, at)),
      renameMaster: (id, name) => edit((project, at) => renameMaster(project, id, name, at)), addPico: (id, name) => edit((project, at) => addSlave(project, id, { displayName: name }, createStableId, at)), renamePico: (id, name) => edit((project, at) => renameSlave(project, id, name, at)), setPicoAddress: (id, address) => edit((project, at) => changeSlaveLogicalAddress(project, id, address, at)), deletePico: id => edit((project, at) => removeSlave(project, id, at)), movePico: (id, from, to) => edit((project, at) => reorderSlaves(project, id, from, to, at)),
      addChannel: (id, name, output) => edit((project, at) => addChannel(project, id, { displayName: name, hardwareOutputIdentifier: output }, createStableId, at)), renameChannel: (id, name) => edit((project, at) => renameChannel(project, id, name, at)), setChannelOutput: (id, output) => edit((project, at) => changeChannelHardwareOutputIdentifier(project, id, output, at)), deleteChannel: id => edit((project, at) => removeChannel(project, id, at)), moveChannel: (id, from, to) => edit((project, at) => reorderChannels(project, id, from, to, at)),
    },
  };
  return <AppStateContext.Provider value={value}>{children}{confirming && <UnsavedDialog onChoose={decide}/>} {error && <ErrorDialog message={error} onClose={() => setError(null)}/>}</AppStateContext.Provider>;
}

function UnsavedDialog({ onChoose }: { onChoose: (choice: UnsavedDecision) => void }) { return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true"><h2>Unsaved changes</h2><p>Save your changes before continuing?</p><div className="dialog-actions"><button className="button secondary" onClick={() => onChoose('cancel')}>Cancel</button><button className="button secondary" onClick={() => onChoose('discard')}>Don't Save</button><button className="button primary" onClick={() => onChoose('save')}>Save</button></div></section></div>; }
function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) { return <div className="dialog-backdrop"><section className="dialog" role="alertdialog" aria-modal="true"><h2>Project operation failed</h2><p>{message}</p><div className="dialog-actions"><button className="button primary" onClick={onClose}>OK</button></div></section></div>; }
// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() { const state = useContext(AppStateContext); if (!state) throw new Error('useAppState must be used within AppStateProvider'); return state; }

function friendlyError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes('Logical address must be unique')) return 'That logical address is already used by another Pico in this costume.';
  if (message.includes('Logical address must be a non-negative integer')) return 'Logical address must be a non-negative whole number.';
  if (message.includes('Hardware output identifier must be unique')) return 'That hardware output identifier is already used by another channel on this Pico.';
  return message.replace(/^.*?: /, '');
}
