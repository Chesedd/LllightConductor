import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Braces, ChevronDown, ChevronRight, Copy, FolderKanban, Music, Pause, Play, Redo2, Save, Undo2, Upload } from 'lucide-react';
import { useAppState } from '../state/AppState';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import type { ChannelId, ControllerId, CostumeId, EntityId, Project } from '../../domain/project';
import { formatTimelineTime, parseTimelineTime, timelineTime } from '../../domain/timelineTime';
import { TimelineSurface } from '../components/TimelineSurface';
import { isEditableTarget } from '../keyboard';
import { snapTime } from '../../timeline/snapping';

type Selection = { kind: 'costume'; id: CostumeId } | { kind: 'master' | 'pico'; id: ControllerId } | { kind: 'channel'; id: ChannelId };
type CreateRequest = { kind: 'costume' } | { kind: 'pico'; parentId: ControllerId } | { kind: 'channel'; parentId: ControllerId };
type DeleteRequest = { selection: Selection; name: string };
type ScoreClipboard = { events: { channelId: ChannelId; startMs: number; endMs: number }[]; anchorTimeMs: number };
type Channel = Project['costumes'][number]['master']['slaves'][number]['channels'][number];

export function EditorPage() {
  const app = useAppState(); const { project, navigate, topology, audio, score } = app;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [removeAudioRequested, setRemoveAudioRequested] = useState(false);
  const [selectedScoreEventIds, setSelectedScoreEventIds] = useState<Set<EntityId>>(new Set());
  const [addIntervalChannel, setAddIntervalChannel] = useState<Channel | null>(null);
  const [clipboard, setClipboard] = useState<ScoreClipboard | null>(null); const [snapEnabled, setSnapEnabled] = useState(true); const [gridMs, setGridMs] = useState(100);
  useEffect(() => { setSelection(null); setSelectedScoreEventIds(new Set()); setClipboard(null); setAddIntervalChannel(null); }, [project?.id]);
  useEffect(() => { const existing = new Set(project?.score.events.map(event => event.id)); setSelectedScoreEventIds(current => new Set([...current].filter(id => existing.has(id)))); }, [project]);
  const copy = () => { const events = project?.score.events.filter(event => selectedScoreEventIds.has(event.id)) ?? []; if (!events.length) return; const anchorTimeMs = Math.min(...events.map(event => event.startMs)); setClipboard({ anchorTimeMs, events: events.map(({ channelId, startMs, endMs }) => ({ channelId, startMs, endMs })) }); };
  const pasteAt = (anchor: number) => { if (!clipboard) return; const destination = snapEnabled ? snapTime(anchor, gridMs) : Math.max(0, anchor); const offset = destination - clipboard.anchorTimeMs; const ids = score.addMany(clipboard.events.map(event => ({ ...event, startMs: event.startMs + offset, endMs: event.endMs + offset }))); if (ids) setSelectedScoreEventIds(new Set(ids)); };
  const duplicate = () => { const events = project?.score.events.filter(event => selectedScoreEventIds.has(event.id)) ?? []; if (!events.length) return; const offset = snapEnabled ? gridMs : 100; const ids = score.addMany(events.map(({ channelId, startMs, endMs }) => ({ channelId, startMs: startMs + offset, endMs: endMs + offset }))); if (ids) setSelectedScoreEventIds(new Set(ids)); };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (isEditableTarget(event.target)) return; const modifier = event.ctrlKey || event.metaKey; const lower = event.key.toLowerCase(); if (modifier && lower === 'z') { event.preventDefault(); if (event.shiftKey) app.redo(); else app.undo(); return; } if (modifier && lower === 'y') { event.preventDefault(); app.redo(); return; } if (modifier && lower === 'c') { event.preventDefault(); copy(); return; } if (modifier && lower === 'v') { event.preventDefault(); pasteAt(audio.transport.currentTimeMs); return; } if (modifier && lower === 'd') { event.preventDefault(); duplicate(); return; } if (event.key === 'Escape') setSelectedScoreEventIds(new Set()); if ((event.key === 'Delete' || event.key === 'Backspace') && selectedScoreEventIds.size) { event.preventDefault(); if (score.removeMany([...selectedScoreEventIds])) setSelectedScoreEventIds(new Set()); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  if (!project) return <section className="page-content"><EmptyState icon={<FolderKanban size={28}/>} title="No project open" description="Open a project before entering the editor." action={<button className="button primary" onClick={() => navigate('Projects')}>Back to Projects</button>} /></section>;

  const deleteEntity = () => {
    if (!deleteRequest) return;
    const { selection: target } = deleteRequest;
    const succeeds = target.kind === 'costume' ? topology.deleteCostume(target.id) : target.kind === 'pico' ? topology.deletePico(target.id) : target.kind === 'channel' ? topology.deleteChannel(target.id) : false;
    if (succeeds && selection && contains(project, target, selection)) setSelection(null);
    setDeleteRequest(null);
  };
  return <section className="editor" aria-label={`${project.name} editor`}>
    <EditorToolbar onDuplicate={duplicate} canDuplicate={selectedScoreEventIds.size > 0} />
    <div className="editor-body">
      <ProjectTree project={project} selection={selection} onSelect={value => { setSelection(value); setSelectedScoreEventIds(new Set()); }} onCreate={setCreateRequest} onDelete={(item, name) => setDeleteRequest({ selection: item, name })} />
      <div className="timeline-column"><AudioPanel onRemove={() => setRemoveAudioRequested(true)}/><TimelineSurface projectId={project.id} selectedEventIds={selectedScoreEventIds} onSelectEvents={ids => { setSelectedScoreEventIds(ids); if (ids.size) setSelection(null); }} snapEnabled={snapEnabled} gridMs={gridMs} onSnapEnabled={setSnapEnabled} onGridMs={setGridMs}/></div>
      <Inspector project={project} selection={selection} selectedEventIds={selectedScoreEventIds} onDeleted={() => setSelectedScoreEventIds(new Set())} onAddInterval={setAddIntervalChannel} />
    </div>
    {createRequest && <CreateDialog request={createRequest} costumeNumber={project.costumes.length + 1} onClose={() => setCreateRequest(null)} />}
    {addIntervalChannel && <AddScoreEventDialog channel={addIntervalChannel} project={project} startMs={audio.transport.currentTimeMs} onClose={() => setAddIntervalChannel(null)} onAdd={(startMs, endMs) => { const ids = score.addMany([{ channelId: addIntervalChannel.id, startMs, endMs }]); if (!ids) return false; setAddIntervalChannel(null); setSelection(null); setSelectedScoreEventIds(new Set(ids)); return true; }} />}
    {deleteRequest && <ConfirmationDialog title={`Delete ${labelFor(deleteRequest.selection)} “${deleteRequest.name}”?`} description="This also removes its child topology and cannot be undone." confirmLabel="Delete" danger onCancel={() => setDeleteRequest(null)} onConfirm={deleteEntity} />}
    {removeAudioRequested && <ConfirmationDialog title="Remove audio track?" description="The reference will be removed from this project. The audio file on disk will not be deleted." confirmLabel="Remove Audio" danger onCancel={() => setRemoveAudioRequested(false)} onConfirm={() => { audio.removeAudio(); setRemoveAudioRequested(false); }} />}
  </section>;
}

export function EditorToolbar({ onDuplicate = () => {}, canDuplicate = false }: { onDuplicate?: () => void; canDuplicate?: boolean }) {
  const { project, dirty, filePath, save, saveAs, audio, undo, redo, canUndo, canRedo, compilation, preparation } = useAppState();
  const [showSummary, setShowSummary] = useState(false); const [showArtifact, setShowArtifact] = useState(false); const [showPreparedSummary, setShowPreparedSummary] = useState(false); const [showPreparedArtifact, setShowPreparedArtifact] = useState(false);
  const canPlay = audio.transport.durationMs > 0 && audio.transport.status !== 'playing';
  const compiled = compilation.result; const frames = compiled?.masters.reduce((sum, master) => sum + master.frames.length, 0) ?? 0; const transitions = compiled?.masters.reduce((sum, master) => sum + master.frames.reduce((inner, frame) => inner + frame.transitions.length, 0), 0) ?? 0;
  const prepared = preparation.result; const preparedFrames = prepared?.masters.reduce((sum, master) => sum + master.frames.length, 0) ?? 0; const batches = prepared?.masters.reduce((sum, master) => sum + master.frames.reduce((inner, frame) => inner + frame.slaveBatches.length, 0), 0) ?? 0; const updates = prepared?.masters.reduce((sum, master) => sum + master.frames.reduce((inner, frame) => inner + frame.slaveBatches.reduce((batchSum, batch) => batchSum + batch.updates.length, 0), 0), 0) ?? 0;
  return <div className="editor-toolbar" aria-label="Project toolbar">
    <button className="transport" disabled={!canPlay} aria-label="Play" onClick={() => void audio.play()}><Play size={16}/></button><button className="transport" disabled={audio.transport.status !== 'playing'} aria-label="Pause" onClick={audio.pause}><Pause size={16}/></button><output className="time-display" aria-label="Playback time">{formatTimelineTime(audio.transport.currentTimeMs)} / {formatTimelineTime(audio.transport.durationMs)}</output>
    <button className="button secondary" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 size={15}/> Undo</button><button className="button secondary" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 size={15}/> Redo</button><button className="button secondary" disabled={!canDuplicate} onClick={onDuplicate}><Copy size={15}/> Duplicate</button>
    <div className="project-session"><strong>{project?.name}{dirty ? ' *' : ''}</strong><span title={filePath ?? undefined}>{filePath ?? 'Unsaved project'}</span></div><div className="toolbar-spacer"/>
    <button className="button secondary" onClick={() => void save()}><Save size={15}/> Save</button><button className="button secondary" onClick={() => void saveAs()}>Save As</button><button className="button primary" onClick={() => { if (compilation.compile()) setShowSummary(true); }}><Braces size={15}/> Compile</button>{compiled && <button className="button secondary" onClick={() => setShowArtifact(true)}>View Runtime Score</button>}<button className="button primary" disabled={!compiled} onClick={() => { if (preparation.prepare()) setShowPreparedSummary(true); }}>Prepare for Hardware</button>{prepared && <button className="button secondary" onClick={() => setShowPreparedArtifact(true)}>View Prepared Show</button>}<button className="button secondary" disabled><Upload size={15}/> Upload</button>
    {showSummary && compiled && <div className="dialog-backdrop"><section className="dialog compile-dialog" role="dialog" aria-modal="true" aria-labelledby="compile-title"><h2 id="compile-title">Compiled successfully</h2><dl><div><dt>Duration</dt><dd>{formatTimelineTime(compiled.durationMs)}</dd></div><div><dt>Masters</dt><dd>{compiled.masters.length}</dd></div><div><dt>Frames</dt><dd>{frames}</dd></div><div><dt>Transitions</dt><dd>{transitions}</dd></div></dl><div className="dialog-actions"><button className="button secondary" onClick={() => { setShowSummary(false); setShowArtifact(true); }}>View Runtime Score</button><button className="button primary" onClick={() => setShowSummary(false)}>Done</button></div></section></div>}
    {showArtifact && compiled && <div className="dialog-backdrop"><section className="dialog runtime-preview" role="dialog" aria-modal="true" aria-labelledby="runtime-title"><h2 id="runtime-title">Runtime Score v1</h2><p>Canonical diagnostic JSON. The compiled artifact is not saved in the project.</p><pre aria-label="Runtime Score JSON">{compilation.serialized()}</pre><div className="dialog-actions"><button className="button primary" onClick={() => setShowArtifact(false)}>Close</button></div></section></div>}
    {showPreparedSummary && prepared && <div className="dialog-backdrop"><section className="dialog compile-dialog" role="dialog" aria-modal="true" aria-labelledby="prepared-summary-title"><h2 id="prepared-summary-title">Hardware preparation successful</h2><dl><div><dt>Duration</dt><dd>{formatTimelineTime(prepared.masters.reduce((maximum, master) => Math.max(maximum, master.durationMs), 0))}</dd></div><div><dt>Masters</dt><dd>{prepared.masters.length}</dd></div><div><dt>Frames</dt><dd>{preparedFrames}</dd></div><div><dt>Slave batches</dt><dd>{batches}</dd></div><div><dt>Output updates</dt><dd>{updates}</dd></div></dl><div className="dialog-actions"><button className="button secondary" onClick={() => { setShowPreparedSummary(false); setShowPreparedArtifact(true); }}>View Prepared Show</button><button className="button primary" onClick={() => setShowPreparedSummary(false)}>Done</button></div></section></div>}
    {showPreparedArtifact && prepared && <div className="dialog-backdrop"><section className="dialog runtime-preview" role="dialog" aria-modal="true" aria-labelledby="prepared-title"><h2 id="prepared-title">Prepared Show v1</h2><p>Canonical diagnostic JSON. This is not an upload wire format.</p><pre aria-label="Prepared Show JSON">{preparation.serialized()}</pre><div className="dialog-actions"><button className="button primary" onClick={() => setShowPreparedArtifact(false)}>Close</button></div></section></div>}
  </div>;
}

function AudioPanel({ onRemove }: { onRemove: () => void }) {
  const { project, audio } = useAppState(); const track = project?.audio;
  return <section className="audio-panel" aria-label="Audio track"><div className="audio-icon"><Music size={19}/></div><div className="audio-details">
    {!track ? <><strong>No audio track</strong><span>Import an MP3 or WAV file to enable playback.</span></> : <><strong>{track.displayName}</strong><span>{track.durationMs === undefined ? 'Duration unavailable' : formatTimelineTime(track.durationMs)}{track.mediaType ? ` · ${track.mediaType}` : ''}</span>{audio.availability === 'missing' && <em>Audio file is missing. Locate it to restore playback.</em>}{audio.availability === 'error' && <em>The audio file could not be decoded or played.</em>}</>}
  </div><div className="audio-actions">{!track ? <button className="button primary" onClick={() => void audio.importAudio()}>Import Audio</button> : <>{audio.availability === 'missing' && <button className="button primary" onClick={() => void audio.locateAudio()}>Locate Audio</button>}<button className="button secondary" onClick={() => void audio.importAudio()}>Replace Audio</button><button className="button secondary" onClick={onRemove}>Remove Audio</button></>}</div>
  {track && <input className="seek-slider" aria-label="Seek audio" type="range" min={0} max={audio.transport.durationMs || track.durationMs || 0} step={1} value={audio.transport.currentTimeMs} disabled={audio.availability !== 'ready'} onChange={event => audio.seek(timelineTime(Number(event.currentTarget.value)))}/>}</section>;
}

function Toggle({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) { return <button className="tree-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={open} onClick={event => { event.stopPropagation(); onClick(); }}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>; }
function TreeRow({ selected, depth, children, onClick }: { selected: boolean; depth: number; children: ReactNode; onClick: () => void }) { return <div className={`tree-item ${selected ? 'selected' : ''}`} style={{ paddingLeft: 7 + depth * 14 }} onClick={onClick}>{children}</div>; }
function MoveButtons({ label, index, length, move }: { label: string; index: number; length: number; move: (to: number) => void }) { return <span className="tree-actions"><button aria-label={`Move ${label} up`} disabled={index === 0} onClick={event => { event.stopPropagation(); move(index - 1); }}>↑</button><button aria-label={`Move ${label} down`} disabled={index === length - 1} onClick={event => { event.stopPropagation(); move(index + 1); }}>↓</button></span>; }

export function ProjectTree({ project, selection, onSelect, onCreate, onDelete }: { project: Project; selection: Selection | null; onSelect: (value: Selection) => void; onCreate: (value: CreateRequest) => void; onDelete: (item: Selection, name: string) => void }) {
  const { topology } = useAppState();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <aside className="project-tree" aria-label="Project structure"><div className="panel-heading"><p className="panel-label">PROJECT STRUCTURE</p><button className="button small primary" onClick={() => onCreate({ kind: 'costume' })}>Add Costume</button></div>
    {project.costumes.length === 0 ? <div className="tree-empty-state"><strong>No costumes yet</strong><button className="button secondary" onClick={() => onCreate({ kind: 'costume' })}>Add Costume</button></div> : project.costumes.map((costume, costumeIndex) => {
      const costumeOpen = !collapsed.has(costume.id); const masterOpen = !collapsed.has(costume.master.id);
      return <div key={costume.id} className="tree-branch">
        <TreeRow depth={0} selected={selection?.kind === 'costume' && selection.id === costume.id} onClick={() => onSelect({ kind: 'costume', id: costume.id })}><Toggle open={costumeOpen} label={costume.name} onClick={() => toggle(costume.id)}/><span className="tree-kind">Costume</span><strong>{costume.name}</strong><MoveButtons label={costume.name} index={costumeIndex} length={project.costumes.length} move={to => topology.moveCostume(costumeIndex, to)}/><button className="tree-delete" onClick={event => { event.stopPropagation(); onDelete({ kind: 'costume', id: costume.id }, costume.name); }}>Delete</button></TreeRow>
        {costumeOpen && <div>
          <TreeRow depth={1} selected={selection?.kind === 'master' && selection.id === costume.master.id} onClick={() => onSelect({ kind: 'master', id: costume.master.id })}><Toggle open={masterOpen} label={costume.master.displayName} onClick={() => toggle(costume.master.id)}/><span className="tree-kind">ESP32</span><strong>{costume.master.displayName}</strong></TreeRow>
          {masterOpen && <div>{costume.master.slaves.length === 0 ? <div className="tree-empty-state nested"><span>No Pico controllers</span><button className="button secondary" onClick={() => onCreate({ kind: 'pico', parentId: costume.master.id })}>Add Pico</button></div> : costume.master.slaves.map((pico, picoIndex) => {
            const picoOpen = !collapsed.has(pico.id);
            return <div key={pico.id}><TreeRow depth={2} selected={selection?.kind === 'pico' && selection.id === pico.id} onClick={() => onSelect({ kind: 'pico', id: pico.id })}><Toggle open={picoOpen} label={pico.displayName} onClick={() => toggle(pico.id)}/><span className="tree-kind">Pico {pico.logicalAddress}</span><strong>{pico.displayName}</strong><MoveButtons label={pico.displayName} index={picoIndex} length={costume.master.slaves.length} move={to => topology.movePico(costume.master.id, picoIndex, to)}/><button className="tree-delete" onClick={event => { event.stopPropagation(); onDelete({ kind: 'pico', id: pico.id }, pico.displayName); }}>Delete</button></TreeRow>
              {picoOpen && (pico.channels.length === 0 ? <div className="tree-empty-state nested channel-empty"><span>No channels</span><button className="button secondary" onClick={() => onCreate({ kind: 'channel', parentId: pico.id })}>Add Channel</button></div> : pico.channels.map((channel, channelIndex) => <TreeRow key={channel.id} depth={3} selected={selection?.kind === 'channel' && selection.id === channel.id} onClick={() => onSelect({ kind: 'channel', id: channel.id })}><span className="tree-leaf"/><span className="tree-kind">EL wire</span><strong>{channel.displayName}</strong><MoveButtons label={channel.displayName} index={channelIndex} length={pico.channels.length} move={to => topology.moveChannel(pico.id, channelIndex, to)}/><button className="tree-delete" onClick={event => { event.stopPropagation(); onDelete({ kind: 'channel', id: channel.id }, channel.displayName); }}>Delete</button></TreeRow>))}
              {picoOpen && pico.channels.length > 0 && <button className="tree-add" onClick={() => onCreate({ kind: 'channel', parentId: pico.id })}>+ Add Channel</button>}
            </div>;
          })}{costume.master.slaves.length > 0 && <button className="tree-add master-add" onClick={() => onCreate({ kind: 'pico', parentId: costume.master.id })}>+ Add Pico</button>}</div>}
        </div>}
      </div>;
    })}
  </aside>;
}

function CreateDialog({ request, costumeNumber, onClose }: { request: CreateRequest; costumeNumber: number; onClose: () => void }) {
  const { topology } = useAppState(); const kind = request.kind;
  const [name, setName] = useState(kind === 'costume' ? `Costume ${costumeNumber}` : kind === 'pico' ? 'Raspberry Pi Pico' : 'EL Wire Channel'); const [output, setOutput] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); const success = kind === 'costume' ? topology.addCostume(name) : kind === 'pico' ? topology.addPico(request.parentId, name) : topology.addChannel(request.parentId, name, output); if (success) onClose(); };
  return <div className="dialog-backdrop"><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-title" onSubmit={submit}><h2 id="create-title">Add {kind === 'costume' ? 'Costume' : kind === 'pico' ? 'Pico' : 'Channel'}</h2><label htmlFor="new-name">Display name</label><input id="new-name" autoFocus value={name} onChange={event => setName(event.target.value)}/>{kind === 'channel' && <><label htmlFor="new-output">Hardware output identifier</label><input id="new-output" placeholder="GP0, OUT1, CH3…" value={output} onChange={event => setOutput(event.target.value)}/></>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Add {kind === 'costume' ? 'Costume' : kind === 'pico' ? 'Pico' : 'Channel'}</button></div></form></div>;
}

function Inspector({ project, selection, selectedEventIds, onDeleted, onAddInterval }: { project: Project; selection: Selection | null; selectedEventIds: ReadonlySet<EntityId>; onDeleted: () => void; onAddInterval: (channel: Channel) => void }) {
  const { topology, score } = useAppState();
  const selectedEvents = project.score.events.filter(event => selectedEventIds.has(event.id));
  if (selectedEvents.length > 1) { const channels = new Map(project.costumes.flatMap(costume => costume.master.slaves).flatMap(pico => pico.channels).map(channel => [channel.id, channel.displayName])); return <aside className="inspector"><p className="panel-label">EVENT INSPECTOR</p><h2>{selectedEvents.length} intervals selected</h2><div className="property-readonly"><span>Channels</span><strong>{[...new Set(selectedEvents.map(event => channels.get(event.channelId) ?? event.channelId))].join(', ')}</strong></div><div className="property-readonly"><span>Earliest start</span><strong>{formatTimelineTime(Math.min(...selectedEvents.map(event => event.startMs)))}</strong></div><div className="property-readonly"><span>Latest end</span><strong>{formatTimelineTime(Math.max(...selectedEvents.map(event => event.endMs)))}</strong></div><button className="button danger" onClick={() => { if (score.removeMany([...selectedEventIds])) onDeleted(); }}>Delete Intervals</button></aside>; }
  const scoreEvent = selectedEvents[0];
  if (scoreEvent) { const channel = project.costumes.flatMap(costume => costume.master.slaves).flatMap(pico => pico.channels).find(value => value.id === scoreEvent.channelId); return <ScoreEventInspector key={scoreEvent.id} event={scoreEvent} channelName={channel?.displayName ?? 'Unknown channel'} onSave={(startMs, endMs) => score.resize(scoreEvent.id, { startMs, endMs })} onDelete={() => { if (score.remove(scoreEvent.id)) onDeleted(); }}/>; }
  if (!selection) return <aside className="inspector"><p className="panel-label">INSPECTOR</p><div className="inspector-empty"><strong>No selection</strong><p>Select a costume, controller, or channel to edit its properties.</p></div></aside>;
  for (const costume of project.costumes) {
    if (selection.kind === 'costume' && selection.id === costume.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="Costume" id={costume.id} fields={[{ label: 'Name', value: costume.name, save: value => topology.renameCostume(costume.id, value) }]} summary={`${costume.master.displayName} · ${costume.master.slaves.length} Pico controller(s)`}/>;
    if (selection.kind === 'master' && selection.id === costume.master.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="ESP32 Master" id={costume.master.id} type="ESP32" fields={[{ label: 'Display name', value: costume.master.displayName, save: value => topology.renameMaster(costume.master.id, value) }]}/>;
    for (const pico of costume.master.slaves) {
      if (selection.kind === 'pico' && selection.id === pico.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="Pico Controller" id={pico.id} type="Raspberry Pi Pico" fields={[{ label: 'Display name', value: pico.displayName, save: value => topology.renamePico(pico.id, value) }, { label: 'Logical address', value: String(pico.logicalAddress ?? ''), inputMode: 'numeric', save: value => topology.setPicoAddress(pico.id, Number(value)) }]} action={<button type="button" className="button secondary" onClick={() => { if (!pico.channels.some(channel => channel.protocolOutputId !== undefined) || window.confirm('Replace all existing Pico Output IDs with sequential IDs in topology order?')) topology.autoAssignOutputIds(pico.id); }}>Auto Assign Output IDs</button>}/>;
      const channel = pico.channels.find(value => selection.kind === 'channel' && value.id === selection.id);
      if (channel) return <ChannelInspector key={`${selection.kind}-${selection.id}`} channel={channel} picoName={pico.displayName} onAddInterval={() => onAddInterval(channel)}/>;
    }
  }
  return <aside className="inspector"><p className="panel-label">INSPECTOR</p><p className="muted">The selected element no longer exists.</p></aside>;
}

function ScoreEventInspector({ event, channelName, onSave, onDelete }: { event: Project['score']['events'][number]; channelName: string; onSave: (start: number, end: number) => boolean; onDelete: () => void }) {
  const [start, setStart] = useState(formatTimelineTime(event.startMs)); const [end, setEnd] = useState(formatTimelineTime(event.endMs)); const [validation, setValidation] = useState<string | null>(null);
  const submit = (formEvent: FormEvent) => { formEvent.preventDefault(); const startMs = parseTimelineTime(start); const endMs = parseTimelineTime(end); if (startMs === null || endMs === null) { setValidation('Enter time as MM:SS.mmm, HH:MM:SS.mmm, or milliseconds.'); return; } if (endMs <= startMs) { setValidation('The interval must end after it starts.'); return; } setValidation(null); onSave(startMs, endMs); };
  return <aside className="inspector"><p className="panel-label">EVENT INSPECTOR</p><h2>Light Interval</h2><div className="property-readonly"><span>Channel</span><strong>{channelName}</strong></div><form onSubmit={submit}><label className="inspector-field"><span>Start</span><input aria-label="Start" value={start} onChange={e => setStart(e.target.value)}/></label><label className="inspector-field"><span>End</span><input aria-label="End" value={end} onChange={e => setEnd(e.target.value)}/></label>{validation && <p className="field-error" role="alert">{validation}</p>}<button className="button primary">Apply timing</button></form><div className="property-readonly event-duration"><span>Duration</span><strong>{formatTimelineTime(timelineTime(event.endMs - event.startMs))}</strong></div><button className="button danger" onClick={onDelete}>Delete Event</button><div className="stable-id"><span>Stable event ID</span><code>{event.id}</code></div></aside>;
}

function ChannelInspector({ channel, picoName, onAddInterval }: { channel: Channel; picoName: string; onAddInterval: () => void }) {
  const { topology } = useAppState(); const [name, setName] = useState(channel.displayName); const [hardware, setHardware] = useState(channel.hardwareOutputIdentifier); const [outputId, setOutputId] = useState(channel.protocolOutputId === undefined ? '' : String(channel.protocolOutputId)); const [validation, setValidation] = useState<string | null>(null);
  const submit = (event: FormEvent) => { event.preventDefault(); let parsed: number | undefined; if (outputId !== '') { if (!/^\d+$/.test(outputId)) { setValidation('Pico Output ID must be an integer from 0 to 255.'); return; } parsed = Number(outputId); if (parsed > 255) { setValidation('Pico Output ID must be an integer from 0 to 255.'); return; } } setValidation(null); if (name !== channel.displayName && !topology.renameChannel(channel.id, name)) return; if (hardware !== channel.hardwareOutputIdentifier && !topology.setChannelOutput(channel.id, hardware)) return; if (parsed !== channel.protocolOutputId) topology.setChannelProtocolOutputId(channel.id, parsed); };
  return <aside className="inspector"><p className="panel-label">INSPECTOR</p><h2>EL Wire Channel</h2><div className="property-readonly"><span>Controller / channel type</span><strong>el-wire</strong></div><form onSubmit={submit}><label className="inspector-field"><span>Display name</span><input value={name} onChange={event => setName(event.target.value)}/></label><label className="inspector-field"><span>Hardware output identifier</span><input value={hardware} onChange={event => setHardware(event.target.value)}/></label><label className="inspector-field"><span>Pico Output ID</span><input aria-label="Pico Output ID" inputMode="numeric" min={0} max={255} value={outputId} onChange={event => setOutputId(event.target.value)} /><small>Numeric output ID used by Pico Protocol v2 (0–255). Clear to remove the mapping. Pico: {picoName}.</small></label>{validation && <p className="field-error" role="alert">{validation}</p>}<button className="button primary">Apply changes</button></form><section className="inspector-score-action"><p className="panel-label">SCORE</p><button type="button" className="button secondary" onClick={onAddInterval}>+ Add Interval</button></section><div className="stable-id"><span>Stable ID</span><code>{channel.id}</code></div></aside>;
}

function AddScoreEventDialog({ channel, project, startMs, onClose, onAdd }: { channel: Channel; project: Project; startMs: number; onClose: () => void; onAdd: (startMs: number, endMs: number) => boolean }) {
  const audioDurationMs = project.audio?.durationMs;
  const defaultEndMs = audioDurationMs === undefined ? startMs + 1000 : Math.min(startMs + 1000, audioDurationMs);
  const [start, setStart] = useState(() => formatTimelineTime(timelineTime(startMs)));
  const [end, setEnd] = useState(() => formatTimelineTime(timelineTime(defaultEndMs)));
  const [validation, setValidation] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedStart = parseTimelineTime(start); const parsedEnd = parseTimelineTime(end);
    if (parsedStart === null || parsedEnd === null) { setValidation('Enter time as MM:SS.mmm, HH:MM:SS.mmm, or milliseconds.'); return; }
    if (parsedEnd <= parsedStart) { setValidation('The interval must end after it starts.'); return; }
    if (audioDurationMs !== undefined && parsedEnd > audioDurationMs) { setValidation('The interval cannot extend past the audio duration.'); return; }
    if (project.score.events.some(item => item.channelId === channel.id && parsedStart < item.endMs && item.startMs < parsedEnd)) { setValidation('The interval overlaps another event on this channel.'); return; }
    setValidation(null);
    if (!onAdd(parsedStart, parsedEnd)) setValidation('The interval could not be added. Check its timing and channel.');
  };
  return <div className="dialog-backdrop"><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-interval-title" onSubmit={submit}><h2 id="add-interval-title">Add Light Interval</h2><div className="property-readonly"><span>Channel</span><strong>{channel.displayName}</strong></div><label htmlFor="interval-start">Start</label><input id="interval-start" aria-label="Start" autoFocus value={start} onChange={event => setStart(event.target.value)}/><label htmlFor="interval-end">End</label><input id="interval-end" aria-label="End" value={end} onChange={event => setEnd(event.target.value)}/>{validation && <p className="field-error" role="alert">{validation}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Add Interval</button></div></form></div>;
}

function InspectorForm({ title, id, type, summary, fields, action }: { title: string; id: string; type?: string; summary?: string; fields: { label: string; value: string; inputMode?: 'numeric'; save: (value: string) => boolean }[]; action?: ReactNode }) {
  const [values, setValues] = useState(() => fields.map(field => field.value));
  const submit = (event: FormEvent) => { event.preventDefault(); fields.forEach((field, index) => { if (values[index] !== field.value) field.save(values[index]); }); };
  return <aside className="inspector"><p className="panel-label">INSPECTOR</p><h2>{title}</h2>{type && <div className="property-readonly"><span>Controller / channel type</span><strong>{type}</strong></div>}{summary && <p className="inspector-summary">{summary}</p>}<form onSubmit={submit}>{fields.map((field, index) => { const inputId = `inspector-${id}-${index}`; return <label className="inspector-field" key={field.label} htmlFor={inputId}><span>{field.label}</span><input id={inputId} inputMode={field.inputMode} value={values[index]} onChange={event => setValues(current => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))}/></label>; })}<button className="button primary">Apply changes</button>{action}</form><div className="stable-id"><span>Stable ID</span><code>{id}</code></div></aside>;
}

function labelFor(selection: Selection) { return selection.kind === 'costume' ? 'Costume' : selection.kind === 'pico' ? 'Pico' : 'Channel'; }
function contains(project: Project, ancestor: Selection, selected: Selection) {
  if (ancestor.id === selected.id) return true;
  if (ancestor.kind === 'costume') { const costume = project.costumes.find(value => value.id === ancestor.id); return !!costume && (costume.master.id === selected.id || costume.master.slaves.some(pico => pico.id === selected.id || pico.channels.some(channel => channel.id === selected.id))); }
  if (ancestor.kind === 'pico') { const pico = project.costumes.flatMap(value => value.master.slaves).find(value => value.id === ancestor.id); return !!pico?.channels.some(channel => channel.id === selected.id); }
  return false;
}
