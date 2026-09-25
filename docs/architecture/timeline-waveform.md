# Timeline waveform architecture

The editor keeps three responsibilities separate: `AudioPlaybackController` owns transport time and playback, `WaveformExtractor` produces display-only amplitude data, and the timeline viewport owns zoom, scroll, and coordinates. No waveform code advances show time.

## Waveform data and extraction

`WaveformData` contains integer `durationMs`, original `sampleCount`, and bounded `{ min, max }` peaks. `WebAudioWaveformExtractor` fetches the resolved Tauri asset URL, decodes it with Web Audio, and immediately reduces every channel into at most 20,000 intervals. Decoded PCM is therefore never placed in React state. A session-only promise cache is keyed by the complete audio reference; failed promises are evicted, and peaks are not persisted in `.lightshow`.

The Canvas renderer aggregates the dense peaks again for every visible pixel. This keeps DOM and draw work proportional to viewport width while retaining useful detail when zooming. The ruler, playhead, and interaction overlay remain independent components/layers rather than Canvas samples.

## Coordinates and viewport

Reusable pure `timeToX` and `xToTime` functions use integer `TimelineTimeMs`, pixels per second, and horizontal scroll offset. Scale is bounded from 8 to 2,000 px/s. Fit derives scale from current observed panel width and duration; resize therefore recalculates it. Manual zoom preserves the approximate visual center and leaves Fit mode. Scroll, Fit, zoom, hover, and drag are transient UI state.

The ruler chooses a “nice” interval from milliseconds through minutes based on minimum label spacing. Its labels use the domain time formatter. Future score lanes can share the same viewport utilities and ruler without depending on waveform data.

## Transport and interaction

The playhead is positioned exclusively from `transport.currentTimeMs`. Clicking or dragging maps the pointer through `xToTime`, clamps it to the track, and calls transport `seek`; the existing accessible range input remains available. These operations do not edit the project.

During playback, auto-follow scrolls forward only after the playhead crosses 82% of the viewport. A manual scroll suppresses following for 1.5 seconds, avoiding an immediate fight with the user. Project/audio changes reset the viewport and clear old peaks. Each asynchronous extraction effect has a cancellation guard, so a stale result cannot update the next project.

Missing media is never analyzed. Decode failures show **Waveform unavailable** but do not affect playback controls or project validity. Analysis shows an inline **Analyzing audio…** state without blocking the tree or inspector.

## Current limitations

Peak data has one dense resolution rather than a multiresolution pyramid, Fit has a minimum scale (so exceptionally long tracks may still scroll), and scrubbing performs seeks without audition snippets. Score lanes and events are intentionally out of scope.
