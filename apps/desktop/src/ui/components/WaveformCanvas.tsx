import { useEffect, useRef } from 'react';
import type { WaveformData } from '../../media/waveform';

export function WaveformCanvas({ data, width, height, contentWidth, scrollLeft }: { data: WaveformData; width: number; height: number; contentWidth: number; scrollLeft: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const canvas = ref.current; if (!canvas || width <= 0 || height <= 0) return; const ratio = devicePixelRatio || 1; canvas.width = width * ratio; canvas.height = height * ratio; const context = canvas.getContext('2d'); if (!context) return; context.scale(ratio, ratio); context.clearRect(0, 0, width, height); context.strokeStyle = '#a77cff'; context.lineWidth = 1; context.beginPath(); const middle = height / 2;
    for (let x = 0; x < width; x++) { const from = Math.floor((x + scrollLeft) / contentWidth * data.peaks.length); const to = Math.max(from + 1, Math.ceil((x + scrollLeft + 1) / contentWidth * data.peaks.length)); let min = 1; let max = -1; for (let index = from; index < Math.min(to, data.peaks.length); index++) { min = Math.min(min, data.peaks[index].min); max = Math.max(max, data.peaks[index].max); } if (min <= max) { context.moveTo(x + .5, middle - max * middle * .85); context.lineTo(x + .5, middle - min * middle * .85); } }
    context.stroke();
  }, [data, width, height, contentWidth, scrollLeft]);
  return <canvas ref={ref} className="waveform-canvas" style={{ width, height, left: scrollLeft }} aria-hidden="true"/>;
}
