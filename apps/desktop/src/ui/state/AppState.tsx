import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStableId, type ChannelId, type ControllerId, type CostumeId, type EntityId, type Project } from '../../domain/project';
import { addChannel, addCostume, addSlave, autoAssignChannelProtocolOutputIds, bindEsp32, changeChannelHardwareOutputIdentifier, changeSlaveLogicalAddress, removeChannel, removeCostume, removeSlave, renameChannel, renameCostume, renameMaster, renameSlave, reorderChannels, reorderCostumes, reorderSlaves, setChannelProtocolOutputId, unbindEsp32 } from '../../domain/projectOperations';
import { ProjectService } from '../../application/projectService';
import { ProjectWorkspace, type UnsavedDecision, type WorkspaceSnapshot } from '../../application/projectWorkspace';
import { InMemoryProjectRepository } from '../../persistence/projectRepository';
import { ProjectFileService, TauriProjectFileGateway } from '../../persistence/projectFileService';
import { LocalStorageRecentProjectsRepository } from '../../persistence/recentProjectsRepository';
import { removeProjectAudio, setProjectAudio } from '../../domain/audioOperations';
import { AudioMediaService, TauriAudioMediaGateway } from '../../media/audioMediaService';
import { AudioPlaybackController, HtmlAudioPlaybackAdapter, type PlaybackState } from '../../media/audioPlayback';
import { timelineTime, type TimelineTimeMs } from '../../domain/timelineTime';
import { WaveformCache, WebAudioWaveformExtractor, type WaveformData, type WaveformExtractor } from '../../media/waveform';
import { compileProject, ScoreCompilerError, serializeCompiledShow } from '../../runtime/scoreCompiler';
import type { CompiledShowV1 } from '../../runtime/runtimeScore';
import { PreparationError, prepareCompiledShow, serializePreparedShow } from '../../preparation/prepareCompiledShow';
import type { PreparedShowBundleV1 } from '../../preparation/preparedShow';
import { DesktopEsp32Connection } from '../../desktopEsp32/connection';
import { TauriSerialPortGateway, type SerialPortDescriptor } from '../../desktopEsp32/transport';

export type Section = 'Projects' | 'Editor' | 'Devices' | 'Settings';
interface AppStateValue extends WorkspaceSnapshot {
  section: Section; error: string | null;
  navigate: (section: Section) => void; createProject: (name: string) => Promise<void>; openProject: () => Promise<void>;
  openRecent: (path: string) => Promise<void>; removeRecent: (path: string) => Promise<void>; save: () => Promise<void>; saveAs: () => Promise<void>;
  updateProject: (project: Project) => void; clearError: () => void;
  compilation: { result: CompiledShowV1 | null; compile: () => boolean; clear: () => void; serialized: () => string | null };
  preparation: { result: PreparedShowBundleV1 | null; prepare: () => boolean; serialized: () => string | null };
  undo: () => boolean; redo: () => boolean;
  hardware:{connection:DesktopEsp32Connection;ports:SerialPortDescriptor[];revision:number;refreshPorts:()=>Promise<void>;connect:(port:string)=>Promise<void>;disconnect:()=>Promise<void>;refreshStatus:()=>Promise<void>;bind:(masterId:ControllerId)=>boolean;unbind:(masterId:ControllerId)=>boolean;upload:(masterId:ControllerId)=>Promise<void>;cancelUpload:()=>Promise<void>;start:()=>Promise<void>;stop:()=>Promise<void>};
  audio: {
    availability: 'none' | 'loading' | 'ready' | 'missing' | 'error'; transport: PlaybackState;
    waveform: { status: 'idle' | 'loading' | 'ready' | 'error'; data: WaveformData | null; error: string | null };
    importAudio: () => Promise<void>; locateAudio: () => Promise<void>; removeAudio: () => void;
    play: () => Promise<void>; pause: () => void; seek: (position: TimelineTimeMs) => void;
  };
  topology: {
    addCostume: (name: string) => boolean; renameCostume: (id: CostumeId, name: string) => boolean; deleteCostume: (id: CostumeId) => boolean; moveCostume: (from: number, to: number) => boolean;
    renameMaster: (id: ControllerId, name: string) => boolean; addPico: (masterId: ControllerId, name: string) => boolean; renamePico: (id: ControllerId, name: string) => boolean; setPicoAddress: (id: ControllerId, address: number) => boolean; deletePico: (id: ControllerId) => boolean; movePico: (masterId: ControllerId, from: number, to: number) => boolean;
    addChannel: (picoId: ControllerId, name: string, output: string) => boolean; renameChannel: (id: ChannelId, name: string) => boolean; setChannelOutput: (id: ChannelId, output: string) => boolean; setChannelProtocolOutputId: (id: ChannelId, outputId: number | undefined) => boolean; autoAssignOutputIds: (picoId: ControllerId) => boolean; deleteChannel: (id: ChannelId) => boolean; moveChannel: (picoId: ControllerId, from: number, to: number) => boolean;
  };
  score: { add: (input: { channelId: ChannelId; startMs: TimelineTimeMs; endMs: TimelineTimeMs }) => boolean; addMany: (inputs: { channelId: ChannelId; startMs: TimelineTimeMs; endMs: TimelineTimeMs }[]) => EntityId[] | null; move: (id: EntityId, startMs: TimelineTimeMs) => boolean; moveMany: (ids: EntityId[], deltaMs: TimelineTimeMs) => boolean; resize: (id: EntityId, input: { startMs?: TimelineTimeMs; endMs?: TimelineTimeMs }) => boolean; remove: (id: EntityId) => boolean; removeMany: (ids: EntityId[]) => boolean };
}
const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children, workspace: supplied, playback: suppliedPlayback, media: suppliedMedia, waveformExtractor: suppliedExtractor }: { children: ReactNode; workspace?: ProjectWorkspace; playback?: AudioPlaybackController; media?: AudioMediaService; waveformExtractor?: WaveformExtractor }) {
  const workspace = useMemo(() => supplied ?? new ProjectWorkspace(new ProjectFileService(new TauriProjectFileGateway()), new LocalStorageRecentProjectsRepository()), [supplied]);
  const creator = useMemo(() => new ProjectService(new InMemoryProjectRepository()), []);
  const [snapshot, setSnapshot] = useState(workspace.snapshot()); const [section, setSection] = useState<Section>('Projects'); const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledShowV1 | null>(null);
  const [prepared, setPrepared] = useState<PreparedShowBundleV1 | null>(null);
  const connection=useMemo(()=>new DesktopEsp32Connection(new TauriSerialPortGateway()),[]);const [ports,setPorts]=useState<SerialPortDescriptor[]>([]);const [hardwareRevision,setHardwareRevision]=useState(0);const hardwareSync=()=>setHardwareRevision(v=>v+1);
  const playback = useMemo(() => suppliedPlayback ?? new AudioPlaybackController(new HtmlAudioPlaybackAdapter()), [suppliedPlayback]);
  const media = useMemo(() => suppliedMedia ?? new AudioMediaService(new TauriAudioMediaGateway()), [suppliedMedia]);
  const waveformExtractor = useMemo(() => suppliedExtractor ?? new WebAudioWaveformExtractor(), [suppliedExtractor]);
  const waveformCache = useMemo(() => new WaveformCache(), []);
  const [transport, setTransport] = useState(playback.snapshot()); const [audioAvailability, setAudioAvailability] = useState<'none' | 'loading' | 'ready' | 'missing' | 'error'>('none');
  const [waveform, setWaveform] = useState<AppStateValue['audio']['waveform']>({ status: 'idle', data: null, error: null });
  const preloadedAudio = useRef<string | null>(null);
  const resolver = useRef<((choice: UnsavedDecision) => void) | null>(null); const [confirming, setConfirming] = useState(false);
  const sync = () => setSnapshot(workspace.snapshot());
  const run = async (operation: () => Promise<unknown>) => { try { setError(null); await operation(); sync(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); sync(); } };
  const confirmUnsaved = () => new Promise<UnsavedDecision>(resolve => { resolver.current = resolve; setConfirming(true); });
  const decide = (choice: UnsavedDecision) => { setConfirming(false); resolver.current?.(choice); resolver.current = null; };
  const invalidate = () => { setCompiled(null); setPrepared(null); };
  const edit = (operation: (project: Project, timestamp: Date) => Project) => { try { setError(null); workspace.editProject(operation); invalidate(); sync(); return true; } catch (cause) { setError(friendlyError(cause)); sync(); return false; } };
  const workspaceAction = <T,>(operation: () => T): T | null => { try { setError(null); const result = operation(); invalidate(); sync(); return result; } catch (cause) { setError(friendlyError(cause)); sync(); return null; } };
  useEffect(() => { void run(() => workspace.initialize()); }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => playback.subscribe(setTransport), [playback]);
  useEffect(() => { setCompiled(null); setPrepared(null); }, [snapshot.project?.id]);
  useEffect(()=>()=>{void connection.disconnect();},[connection]);
  const audioReference = snapshot.project?.audio?.reference;
  useEffect(() => {
    let current = true; const referenceKey = audioReference ? JSON.stringify(audioReference) : null; const alreadyLoaded = referenceKey !== null && preloadedAudio.current === referenceKey; preloadedAudio.current = null; if (!alreadyLoaded) playback.unload(); setWaveform({ status: audioReference ? 'loading' : 'idle', data: null, error: null });
    if (!audioReference) { setAudioAvailability('none'); return () => { current = false; }; }
    setAudioAvailability('loading');
    void media.resolve(audioReference).then(async result => {
      if (!current) return;
      if (result.status === 'missing') { setAudioAvailability('missing'); setWaveform({ status: 'idle', data: null, error: null }); return; }
      if (result.status === 'unsupported') { setAudioAvailability('error'); setWaveform({ status: 'idle', data: null, error: null }); return; }
      if (!alreadyLoaded) { try { await playback.load(result.url); if (current) setAudioAvailability('ready'); } catch { if (current) setAudioAvailability('error'); } } else setAudioAvailability('ready');
      void waveformCache.get(referenceKey!, () => waveformExtractor.extract(result.url)).then(data => { if (current) setWaveform({ status: 'ready', data, error: null }); }).catch(cause => { if (current) setWaveform({ status: 'error', data: null, error: cause instanceof Error ? cause.message : String(cause) }); });
    }).catch(cause => { if (current) { setAudioAvailability('error'); setError(cause instanceof Error ? cause.message : String(cause)); } });
    return () => { current = false; };
  }, [snapshot.project?.id, audioReference, media, playback, waveformCache, waveformExtractor]); // intentionally follows persisted media identity
  const chooseAudio = async () => { const path = await media.choose(); if (!path) return; setAudioAvailability('loading'); const resolved = await media.resolve({ type: 'external-uri', uri: path }); if (resolved.status !== 'available') throw new Error('The selected audio file cannot be read.'); const metadata = await playback.load(resolved.url); preloadedAudio.current = JSON.stringify({ type: 'external-uri', uri: path }); workspace.editProject((project, at) => setProjectAudio(project, { displayName: media.displayName(path), uri: path, durationMs: metadata.durationMs, mediaType: metadata.mediaType ?? media.mediaType(path) }, createStableId, at)); setAudioAvailability('ready'); setCompiled(null); setPrepared(null); sync(); };
  const value: AppStateValue = { ...snapshot, section, error, clearError: () => setError(null), navigate: (next) => { if (next === 'Projects' && section === 'Editor') void run(async () => { if (await workspace.close(confirmUnsaved)) setSection(next); }); else setSection(next); },
    createProject: async name => run(async () => { const project = await creator.createProject(name); if (await workspace.newProject(() => project, confirmUnsaved)) setSection('Editor'); }),
    openProject: async () => run(async () => { if (await workspace.chooseAndOpen(confirmUnsaved)) setSection('Editor'); }),
    openRecent: async path => run(async () => { if (await workspace.openRecent(path, confirmUnsaved)) setSection('Editor'); }), removeRecent: path => run(() => workspace.removeRecent(path)),
    save: () => run(() => workspace.save()), saveAs: () => run(() => workspace.saveAs()), updateProject: project => { workspace.replaceProject(project); invalidate(); sync(); }, undo: () => { playback.pause(); return workspaceAction(() => workspace.undo()) ?? false; }, redo: () => { playback.pause(); return workspaceAction(() => workspace.redo()) ?? false; },
    compilation: { result: compiled, compile: () => { if (!snapshot.project) return false; try { setError(null); setPrepared(null); setCompiled(compileProject(snapshot.project)); return true; } catch (cause) { setCompiled(null); setPrepared(null); setError(compilerFriendlyError(cause)); return false; } }, clear: () => { setCompiled(null); setPrepared(null); }, serialized: () => compiled ? serializeCompiledShow(compiled) : null },
    preparation: { result: prepared, prepare: () => { if (!snapshot.project || !compiled) return false; try { setError(null); setPrepared(prepareCompiledShow(snapshot.project, compiled)); return true; } catch (cause) { setPrepared(null); setError(preparationFriendlyError(cause)); return false; } }, serialized: () => prepared ? serializePreparedShow(prepared) : null },
    hardware:{connection,ports,revision:hardwareRevision,refreshPorts:()=>run(async()=>{setPorts(await connection.listPorts());}),connect:port=>run(async()=>{await connection.connect(port);hardwareSync();}),disconnect:()=>run(async()=>{await connection.disconnect();hardwareSync();}),refreshStatus:()=>run(async()=>{await connection.refreshStatus();hardwareSync();}),bind:masterId=>edit((project,at)=>bindEsp32(project,masterId,connection.identity?.deviceId??'',createStableId,at)),unbind:masterId=>edit((project,at)=>unbindEsp32(project,masterId,at)),upload:masterId=>run(async()=>{const show=prepared?.masters.find(m=>m.masterId===masterId);if(!show)throw new Error('No current prepared artifact exists for this Master.');await connection.uploadAndActivate(show,hardwareSync);hardwareSync();}),cancelUpload:()=>run(async()=>{await connection.cancelUpload();hardwareSync();}),start:()=>run(async()=>{await connection.start();hardwareSync();}),stop:()=>run(async()=>{await connection.stop();hardwareSync();})},
    audio: { availability: audioAvailability, transport, waveform, importAudio: () => run(chooseAudio), locateAudio: () => run(chooseAudio), removeAudio: () => { playback.unload(); edit((project, at) => removeProjectAudio(project, at)); setAudioAvailability('none'); setWaveform({ status: 'idle', data: null, error: null }); }, play: () => run(() => playback.play()), pause: () => playback.pause(), seek: value => playback.seek(timelineTime(value)) },
    topology: {
      addCostume: name => edit((project, at) => addCostume(project, name, createStableId, at)), renameCostume: (id, name) => edit((project, at) => renameCostume(project, id, name, at)), deleteCostume: id => edit((project, at) => removeCostume(project, id, at)), moveCostume: (from, to) => edit((project, at) => reorderCostumes(project, from, to, at)),
      renameMaster: (id, name) => edit((project, at) => renameMaster(project, id, name, at)), addPico: (id, name) => edit((project, at) => addSlave(project, id, { displayName: name }, createStableId, at)), renamePico: (id, name) => edit((project, at) => renameSlave(project, id, name, at)), setPicoAddress: (id, address) => edit((project, at) => changeSlaveLogicalAddress(project, id, address, at)), deletePico: id => edit((project, at) => removeSlave(project, id, at)), movePico: (id, from, to) => edit((project, at) => reorderSlaves(project, id, from, to, at)),
      addChannel: (id, name, output) => edit((project, at) => addChannel(project, id, { displayName: name, hardwareOutputIdentifier: output }, createStableId, at)), renameChannel: (id, name) => edit((project, at) => renameChannel(project, id, name, at)), setChannelOutput: (id, output) => edit((project, at) => changeChannelHardwareOutputIdentifier(project, id, output, at)), setChannelProtocolOutputId: (id, outputId) => edit((project, at) => setChannelProtocolOutputId(project, id, outputId, at)), autoAssignOutputIds: id => edit((project, at) => autoAssignChannelProtocolOutputIds(project, id, at)), deleteChannel: id => edit((project, at) => removeChannel(project, id, at)), moveChannel: (id, from, to) => edit((project, at) => reorderChannels(project, id, from, to, at)),
    },
    score: {
      add: input => workspaceAction(() => { workspace.addLightInterval(input); return true; }) ?? false,
      addMany: inputs => workspaceAction(() => workspace.addScoreEvents(inputs)),
      move: (id, startMs) => workspaceAction(() => { workspace.moveLightInterval(id, startMs); return true; }) ?? false,
      moveMany: (ids, deltaMs) => workspaceAction(() => { workspace.moveScoreEvents(ids, deltaMs); return true; }) ?? false,
      resize: (id, input) => workspaceAction(() => { workspace.resizeLightInterval(id, input); return true; }) ?? false,
      remove: id => workspaceAction(() => { workspace.removeScoreEvent(id); return true; }) ?? false,
      removeMany: ids => workspaceAction(() => { workspace.removeScoreEvents(ids); return true; }) ?? false,
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
  if (message.includes('overlaps another event')) return 'This channel already has a light interval at that time.';
  if (message.includes('positive duration')) return 'The interval must end after it starts.';
  if (message.includes('audio duration')) return 'The interval cannot extend past the end of the audio track.';
  return message.replace(/^.*?: /, '');
}

function compilerFriendlyError(cause: unknown) {
  if (!(cause instanceof ScoreCompilerError)) return friendlyError(cause);
  const id = cause.entityId ? ` '${cause.entityId}'` : '';
  switch (cause.code) {
    case 'invalid-target': return `A runtime target${id} is incomplete or invalid. Check its Pico logical address and hardware output identifier.`;
    case 'missing-channel': return `A score event references a channel${id} that no longer exists.`;
    case 'unsupported-channel': return `Channel${id} uses a type that cannot play EL Wire intervals.`;
    case 'duplicate-target': return `Two channels resolve to the same Pico address and hardware output. Each runtime target must be unique.`;
    default: return cause.message;
  }
}
function preparationFriendlyError(cause: unknown) {
  if (!(cause instanceof PreparationError)) return friendlyError(cause);
  return cause.message;
}
