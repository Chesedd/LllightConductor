# Editor history and practical timeline tools

## Project history

`ProjectWorkspace` is the application boundary for all persisted edits. It owns a bounded, session-only history of immutable `Project` snapshots: `past`, `current`, and `future`. The default capacity is 100 undo states; when full, the oldest states are discarded. History is deliberately absent from Project File V3.

One successful domain transaction creates one entry. Pointer previews, selection, playback, playhead, waveform state, zoom, and scrolling never enter history. A rejected operation leaves current state, dirty state, and the redo branch unchanged. A successful edit after undo clears the redo branch. New and Open reset history to the new baseline; Save and Save As do not.

Undo and redo pause playback. The React selection is reconciled against event IDs in the restored Project, so surviving stable IDs stay selected and removed IDs disappear.

## Saved checkpoint and dirty state

The workspace keeps an in-memory identity for the exact Project snapshot most recently written or opened. Dirty means `current !== savedCheckpoint`; it is not inferred from the last action or from a history index. Consequently, undoing to a saved snapshot becomes clean, undoing past it becomes dirty, and redoing to it becomes clean. A new, never-saved Project has no checkpoint and is dirty.

## Selection and atomic batches

Timeline selection is a transient set of event IDs. Click replaces the set; Ctrl-click or Cmd-click toggles membership. Multi-selection has a read-only inspector summary (count, channels, earliest start, latest end). Delete, move, paste, and duplicate use atomic batch operations: validation occurs for the whole proposed result before a Project is produced, and the operation produces exactly one history entry.

A group move uses one delta for every interval. The delta is clamped as a group at zero and, when audio duration is known, at the audio end. Durations, channels, relative timing, and IDs remain unchanged. Selected events' old locations do not collide with the proposal; unselected same-channel events do.

## Snapping

The editor offers Off/On and 10, 25, 50, 100, 250, 500, and 1000 ms grids. `snapTime` is a pure integer-millisecond utility. It clamps negative input to zero, chooses the nearest grid line, and resolves exact half-grid ties toward the later time. Alt temporarily bypasses snapping during a drag.

Create snaps both boundaries and discards a zero-length result. Move snaps one anchor and preserves duration and group timing. Resize snaps only the active edge. Enabling snapping does not rewrite existing intervals.

## Clipboard and duplicate

The internal, session-only clipboard contains lightweight interval values plus the earliest copied start as `anchorTimeMs`; it never contains a Project or DOM state. Copy changes neither Project, history, nor dirty state. Paste places that anchor at the playhead, preserves channels and relative timing, and generates new stable IDs. The whole paste is rejected for a missing channel, overlap, invalid interval, or audio overrun. Successful pasted events become the selection.

The clipboard is cleared on New/Open (a Project identity change), so cross-project paste is intentionally unsupported. A topology edit does not clear it; later paste safely validates its channel references.

Duplicate uses the current grid as its positive offset when Snap is on and 100 ms otherwise. It creates new IDs, is atomic, and selects the new events.

## Shortcuts and transient state

| Action | Shortcut |
| --- | --- |
| Undo | Ctrl/Cmd+Z |
| Redo | Ctrl+Y or Ctrl/Cmd+Shift+Z |
| Copy | Ctrl/Cmd+C |
| Paste at playhead | Ctrl/Cmd+V |
| Duplicate | Ctrl/Cmd+D |
| Delete selection | Delete or Backspace |

Shortcuts are ignored when the target is an `input`, `textarea`, or editable element. Selection, clipboard, snap settings, drag previews, viewport, playback, and waveform cache are editor/session state. Score v1 intervals, topology, and audio references remain persisted Project state.

## Current limits

There is no beat/BPM detection, beat snapping, marquee or range selection, cross-project clipboard mapping, runtime compiler, or hardware communication. Snapshot history is appropriate for the current small Project aggregate and is isolated behind `ProjectHistory` so its storage strategy can be replaced later.
