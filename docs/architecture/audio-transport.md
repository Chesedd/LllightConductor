# Audio transport architecture

## Track lifecycle and reference strategy

A project has zero or one `AudioTrack`. Import, Replace, and Locate store an `external-uri` reference whose `uri` value is the native path returned by the Tauri file picker. Despite the legacy discriminator name, the value is an opaque external locator, not a hand-built `file://` URL. Audio bytes remain in their original file and are never copied into the small JSON `.lightshow` document.

The UI and domain do not turn this locator into a WebView URL. `AudioMediaService` is the boundary that checks it through a Tauri command and converts an available native path with Tauri's asset-protocol `convertFileSrc`. This preserves Windows path handling. Moving or deleting the source can invalidate the reference.

The MVP picker filters MP3 and WAV. Actual decoding remains subject to the operating-system WebView media runtime. A selected file is accepted only after browser metadata has loaded and yielded a valid duration; unsupported, unreadable, and corrupt files therefore remain recoverable media errors rather than project corruption.

## Time foundation

`TimelineTimeMs` is a non-negative safe integer count of milliseconds from show start (zero). Persisted duration, transport position, seek input, formatting, and adapter callbacks all use that unit. Floating-point browser seconds are converted only inside `HtmlAudioPlaybackAdapter`, at the browser boundary.

## Playback abstraction

`AudioPlaybackController` owns the session state (`idle`, `loading`, `ready`, `playing`, `paused`, or `error`), current time, duration, completion/restart behavior, and the `load`, `play`, `pause`, `seek`, and `unload` operations. It delegates decoding and playback to `AudioPlaybackAdapter`; the production adapter wraps an off-DOM `HTMLAudioElement`, while tests use a fake. Position events are throttled by the adapter to roughly ten updates per second.

The app resolves and loads a project's track whenever project or audio identity changes. Cleanup unloads the previous source, stops playback, and resets position, so New/Open/Close cannot leak audio across projects. A missing reference leaves the project and costume topology open, disables playback, and offers Locate, Replace, and Remove. Locate runs the same validation pipeline as import and updates the persisted reference.

## Persisted and runtime state

`AudioTrack` persists stable ID, display filename, external reference, integer `durationMs`, and a media type when reliably inferred. Import, Replace, Locate, and Remove are aggregate edits and mark `ProjectWorkspace` dirty. Play, Pause, Seek, decoder state, status, and current position live only in the playback controller and never pass through `Project` or the v1 persistence DTO, so reopening always begins at zero.

The future waveform/timeline should observe this controller's `PlaybackState.currentTimeMs` and call its seek operation. It must not introduce a second playback clock. Peak extraction and rendering are intentionally outside this stage.
