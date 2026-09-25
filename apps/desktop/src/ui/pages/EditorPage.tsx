import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Clock3, FolderKanban, Minus, Music, Pause, Play, Plus, Save, Upload } from 'lucide-react';
import { useAppState } from '../state/AppState';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import type { ChannelId, ControllerId, CostumeId, Project } from '../../domain/project';
import { formatTimelineTime, timelineTime } from '../../domain/timelineTime';

type Selection = { kind: 'costume'; id: CostumeId } | { kind: 'master' | 'pico'; id: ControllerId } | { kind: 'channel'; id: ChannelId };
type CreateRequest = { kind: 'costume' } | { kind: 'pico'; parentId: ControllerId } | { kind: 'channel'; parentId: ControllerId };
type DeleteRequest = { selection: Selection; name: string };

export function EditorPage() {
  const { project, navigate, topology, audio } = useAppState();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [removeAudioRequested, setRemoveAudioRequested] = useState(false);
  useEffect(() => setSelection(null), [project?.id]);
  if (!project) return <section className="page-content"><EmptyState icon={<FolderKanban size={28}/>} title="No project open" description="Open a project before entering the editor." action={<button className="button primary" onClick={() => navigate('Projects')}>Back to Projects</button>} /></section>;

  const deleteEntity = () => {
    if (!deleteRequest) return;
    const { selection: target } = deleteRequest;
    const succeeds = target.kind === 'costume' ? topology.deleteCostume(target.id) : target.kind === 'pico' ? topology.deletePico(target.id) : target.kind === 'channel' ? topology.deleteChannel(target.id) : false;
    if (succeeds && selection && contains(project, target, selection)) setSelection(null);
    setDeleteRequest(null);
  };
  return <section className="editor" aria-label={`${project.name} editor`}>
    <EditorToolbar />
    <div className="editor-body">
      <ProjectTree project={project} selection={selection} onSelect={setSelection} onCreate={setCreateRequest} onDelete={(item, name) => setDeleteRequest({ selection: item, name })} />
      <div className="timeline-column"><AudioPanel onRemove={() => setRemoveAudioRequested(true)}/><div className="timeline-placeholder"><div className="timeline-ruler" aria-hidden="true">00:00 <span>00:10</span><span>00:20</span><span>00:30</span></div><Clock3 size={34}/><h2>Timeline will appear here</h2><p>Waveform and lighting tracks will be added in a future stage.</p></div></div>
      <Inspector project={project} selection={selection} />
    </div>
    {createRequest && <CreateDialog request={createRequest} costumeNumber={project.costumes.length + 1} onClose={() => setCreateRequest(null)} />}
    {deleteRequest && <ConfirmationDialog title={`Delete ${labelFor(deleteRequest.selection)} “${deleteRequest.name}”?`} description="This also removes its child topology and cannot be undone." confirmLabel="Delete" danger onCancel={() => setDeleteRequest(null)} onConfirm={deleteEntity} />}
    {removeAudioRequested && <ConfirmationDialog title="Remove audio track?" description="The reference will be removed from this project. The audio file on disk will not be deleted." confirmLabel="Remove Audio" danger onCancel={() => setRemoveAudioRequested(false)} onConfirm={() => { audio.removeAudio(); setRemoveAudioRequested(false); }} />}
  </section>;
}

export function EditorToolbar() {
  const { project, dirty, filePath, save, saveAs, audio } = useAppState();
  const canPlay = audio.availability === 'ready' && audio.transport.status !== 'playing';
  return <div className="editor-toolbar" aria-label="Project toolbar">
    <button className="transport" disabled={!canPlay} aria-label="Play" onClick={() => void audio.play()}><Play size={16}/></button><button className="transport" disabled={audio.transport.status !== 'playing'} aria-label="Pause" onClick={audio.pause}><Pause size={16}/></button><output className="time-display" aria-label="Playback time">{formatTimelineTime(audio.transport.currentTimeMs)} / {formatTimelineTime(audio.transport.durationMs)}</output>
    <div className="project-session"><strong>{project?.name}{dirty ? ' *' : ''}</strong><span title={filePath ?? undefined}>{filePath ?? 'Unsaved project'}</span></div><div className="toolbar-spacer"/>
    <div className="zoom"><button disabled aria-label="Zoom out"><Minus size={14}/></button><span>100%</span><button disabled aria-label="Zoom in"><Plus size={14}/></button></div>
    <button className="button secondary" onClick={() => void save()}><Save size={15}/> Save</button><button className="button secondary" onClick={() => void saveAs()}>Save As</button><button className="button secondary" disabled><Upload size={15}/> Upload</button>
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

function Inspector({ project, selection }: { project: Project; selection: Selection | null }) {
  const { topology } = useAppState();
  if (!selection) return <aside className="inspector"><p className="panel-label">INSPECTOR</p><div className="inspector-empty"><strong>No selection</strong><p>Select a costume, controller, or channel to edit its properties.</p></div></aside>;
  for (const costume of project.costumes) {
    if (selection.kind === 'costume' && selection.id === costume.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="Costume" id={costume.id} fields={[{ label: 'Name', value: costume.name, save: value => topology.renameCostume(costume.id, value) }]} summary={`${costume.master.displayName} · ${costume.master.slaves.length} Pico controller(s)`}/>;
    if (selection.kind === 'master' && selection.id === costume.master.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="ESP32 Master" id={costume.master.id} type="ESP32" fields={[{ label: 'Display name', value: costume.master.displayName, save: value => topology.renameMaster(costume.master.id, value) }]}/>;
    for (const pico of costume.master.slaves) {
      if (selection.kind === 'pico' && selection.id === pico.id) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="Pico Controller" id={pico.id} type="Raspberry Pi Pico" fields={[{ label: 'Display name', value: pico.displayName, save: value => topology.renamePico(pico.id, value) }, { label: 'Logical address', value: String(pico.logicalAddress ?? ''), inputMode: 'numeric', save: value => topology.setPicoAddress(pico.id, Number(value)) }]}/>;
      const channel = pico.channels.find(value => selection.kind === 'channel' && value.id === selection.id);
      if (channel) return <InspectorForm key={`${selection.kind}-${selection.id}`} title="EL Wire Channel" id={channel.id} type="el-wire" fields={[{ label: 'Display name', value: channel.displayName, save: value => topology.renameChannel(channel.id, value) }, { label: 'Hardware output identifier', value: channel.hardwareOutputIdentifier, save: value => topology.setChannelOutput(channel.id, value) }]}/>;
    }
  }
  return <aside className="inspector"><p className="panel-label">INSPECTOR</p><p className="muted">The selected element no longer exists.</p></aside>;
}

function InspectorForm({ title, id, type, summary, fields }: { title: string; id: string; type?: string; summary?: string; fields: { label: string; value: string; inputMode?: 'numeric'; save: (value: string) => boolean }[] }) {
  const [values, setValues] = useState(() => fields.map(field => field.value));
  const submit = (event: FormEvent) => { event.preventDefault(); fields.forEach((field, index) => { if (values[index] !== field.value) field.save(values[index]); }); };
  return <aside className="inspector"><p className="panel-label">INSPECTOR</p><h2>{title}</h2>{type && <div className="property-readonly"><span>Controller / channel type</span><strong>{type}</strong></div>}{summary && <p className="inspector-summary">{summary}</p>}<form onSubmit={submit}>{fields.map((field, index) => { const inputId = `inspector-${id}-${index}`; return <label className="inspector-field" key={field.label} htmlFor={inputId}><span>{field.label}</span><input id={inputId} inputMode={field.inputMode} value={values[index]} onChange={event => setValues(current => current.map((value, valueIndex) => valueIndex === index ? event.target.value : value))}/></label>; })}<button className="button primary">Apply changes</button></form><div className="stable-id"><span>Stable ID</span><code>{id}</code></div></aside>;
}

function labelFor(selection: Selection) { return selection.kind === 'costume' ? 'Costume' : selection.kind === 'pico' ? 'Pico' : 'Channel'; }
function contains(project: Project, ancestor: Selection, selected: Selection) {
  if (ancestor.id === selected.id) return true;
  if (ancestor.kind === 'costume') { const costume = project.costumes.find(value => value.id === ancestor.id); return !!costume && (costume.master.id === selected.id || costume.master.slaves.some(pico => pico.id === selected.id || pico.channels.some(channel => channel.id === selected.id))); }
  if (ancestor.kind === 'pico') { const pico = project.costumes.flatMap(value => value.master.slaves).find(value => value.id === ancestor.id); return !!pico?.channels.some(channel => channel.id === selected.id); }
  return false;
}
