import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type UIEvent } from 'react';
import { Music, Minus, Plus } from 'lucide-react';
import { timelineTime } from '../../domain/timelineTime';
import { chooseTickInterval, fitPixelsPerSecond, formatRulerTime, MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, timeToX, xToTime } from '../../timeline/timelineViewport';
import { useAppState } from '../state/AppState';
import { WaveformCanvas } from './WaveformCanvas';

export function TimelineSurface({ projectId }: { projectId: string }) {
  const { audio } = useAppState(); const duration = audio.transport.durationMs;
  const viewportRef = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(0); const [scale, setScale] = useState(80); const [scrollLeft, setScrollLeft] = useState(0); const [fit, setFit] = useState(true); const [hover, setHover] = useState<number | null>(null); const [dragging, setDragging] = useState(false); const manualScrollUntil = useRef(0);
  useEffect(() => { setScrollLeft(0); setFit(true); setHover(null); }, [projectId]);
  useEffect(() => { const node = viewportRef.current; if (!node) return; setWidth(Math.round(node.getBoundingClientRect().width)); if (!globalThis.ResizeObserver) return; const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width))); observer.observe(node); return () => observer.disconnect(); }, []);
  const fitted = fitPixelsPerSecond(width, duration); const pixelsPerSecond = fit ? fitted : scale; const contentWidth = Math.max(width, duration / 1_000 * pixelsPerSecond); const viewport = useMemo(() => ({ pixelsPerSecond, scrollLeft }), [pixelsPerSecond, scrollLeft]);
  useEffect(() => { if (fit) { scrollElement(viewportRef.current, 0); setScrollLeft(0); } }, [fit, fitted]);
  useEffect(() => { if (audio.transport.status !== 'playing' || Date.now() < manualScrollUntil.current || !viewportRef.current) return; const x = timeToX(audio.transport.currentTimeMs, viewport); if (x > width * .82) scrollElement(viewportRef.current, Math.min(contentWidth - width, scrollLeft + width * .55), true); }, [audio.transport.currentTimeMs, audio.transport.status, contentWidth, scrollLeft, viewport, width]);
  const seekAt = useCallback((clientX: number) => { const rect = viewportRef.current?.getBoundingClientRect(); if (rect) audio.seek(xToTime(clientX - rect.left, { pixelsPerSecond, scrollLeft }, duration)); }, [audio, duration, pixelsPerSecond, scrollLeft]);
  const pointerMove = (event: ReactPointerEvent) => { const rect = viewportRef.current?.getBoundingClientRect(); if (rect) setHover(xToTime(event.clientX - rect.left, viewport, duration)); if (dragging) seekAt(event.clientX); };
  const zoom = (factor: number) => { const old = pixelsPerSecond; const next = Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, old * factor)); const centerTime = (scrollLeft + width / 2) / old; setFit(false); setScale(next); requestAnimationFrame(() => scrollElement(viewportRef.current, Math.max(0, centerTime * next - width / 2))); };
  const tick = chooseTickInterval(pixelsPerSecond); const firstTick = Math.ceil(scrollLeft / pixelsPerSecond * 1_000 / tick) * tick; const ticks = []; for (let time = firstTick; time <= duration && timeToX(timelineTime(time), viewport) <= width; time += tick) ticks.push(time);
  if (audio.availability === 'none') return <div className="timeline-empty"><Music size={32}/><h2>Import audio to create the show timeline.</h2><button className="button primary" onClick={() => void audio.importAudio()}>Import Audio to Timeline</button></div>;
  if (audio.availability === 'missing') return <div className="timeline-empty"><Music size={32}/><h2>Audio file is missing.</h2><p>Locate or replace the audio track to display its waveform.</p></div>;
  return <section className="timeline-surface" aria-label="Audio timeline">
    <div className="timeline-controls"><span>{Math.round(pixelsPerSecond)} px/s</span><button aria-label="Zoom out" onClick={() => zoom(.7)}><Minus size={14}/></button><button aria-label="Zoom in" onClick={() => zoom(1.4)}><Plus size={14}/></button><button onClick={() => setFit(true)}>Fit</button></div>
    <div className="timeline-scroll" ref={viewportRef} data-testid="timeline-scroll" onScroll={(event: UIEvent<HTMLDivElement>) => { setScrollLeft(event.currentTarget.scrollLeft); manualScrollUntil.current = Date.now() + 1_500; }}>
      <div className="timeline-content" style={{ width: contentWidth }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); seekAt(event.clientX); }} onPointerMove={pointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onPointerLeave={() => { if (!dragging) setHover(null); }}>
        <div className="time-ruler">{ticks.map(time => <span key={time} style={{ left: time / 1_000 * pixelsPerSecond }}><i/>{formatRulerTime(timelineTime(time), tick)}</span>)}</div>
        <div className="waveform-area">{audio.waveform.status === 'loading' && <div className="waveform-message">Analyzing audio…</div>}{audio.waveform.status === 'error' && <div className="waveform-message error"><strong>Waveform unavailable</strong><small>{audio.waveform.error}</small></div>}{audio.waveform.data && <WaveformCanvas data={audio.waveform.data} width={width} height={190} contentWidth={contentWidth} scrollLeft={scrollLeft}/>}<div className="playhead" aria-label="Playhead" style={{ left: audio.transport.currentTimeMs / 1_000 * pixelsPerSecond }}><span/></div>{hover !== null && <div className="hover-time" style={{ left: hover / 1_000 * pixelsPerSecond }}>{formatRulerTime(timelineTime(hover), timelineTime(1))}</div>}</div>
      </div>
    </div>
  </section>;
}

function scrollElement(element: HTMLDivElement | null, left: number, smooth = false) { if (!element) return; if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' }); else element.scrollLeft = left; }
