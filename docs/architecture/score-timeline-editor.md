# Score timeline editor

The score editor is a DOM-based editor for Score v1 `LightInterval` events. It does not change Score v1 persistence or its half-open `[startMs,endMs)` time semantics.

## Layout and coordinates

The editor has a fixed label column and one horizontally scrolling timed viewport containing the ruler, waveform, lane event surfaces, hover time, and playhead. The score does not own a second horizontal viewport. Every position is derived from the existing `timeToX`/`xToTime` viewport and is recalculated after zoom or scroll. Lanes come from `buildScoreLaneModel`, preserving Costume → Master → Pico → Channel topology order. The score rows scroll vertically while ruler and waveform remain fixed; the label column mirrors that same vertical scroll.

Each label includes the channel display name, Costume/Pico breadcrumb, and channel type. Identity and joins always use stable IDs, never display names. Empty score lanes remain visible; a project without output channels shows an instruction to add them in the Project Tree.

## Editing and selection

Dragging empty lane space in either direction creates an interval. A four-pixel UI threshold distinguishes a drag from a click; it is not a domain minimum duration. Clicking an event selects its stable ID in transient React state. Selection survives zoom and scrolling, and resets when the project changes or a topology cascade removes the event.

Dragging the body moves an event and preserves duration. Selected events expose left and right resize handles. Move previews clamp to zero and, when audio has a known duration, to the end of audio. A resize that would invert an interval has no valid preview. Pointer capture keeps edits active outside the original element; cancellation drops the preview.

All create, move, and resize gestures use a transient preview. Mouse movement never mutates the Project. Pointer-up performs exactly one workspace operation. Same-channel overlap is highlighted before commit using the same half-open comparison as Score v1, so adjacent intervals are valid. Domain operations remain authoritative and failures leave the prior Project intact while the application presents a friendly error.

Starting an event edit pauses playback. Playback, seeking, selection, hover, previews, zoom, and scrolling are transient and do not dirty the Project. Only successful create, move, resize, delete, and Inspector timing commits do so.

## Inspector, keyboard, and accessibility

The Event Inspector displays kind, stable ID, channel, start, end, and duration. Start and End accept raw non-negative milliseconds, `MM:SS.mmm`, or `HH:MM:SS.mmm`; parsing and formatting are pure domain time utilities. Inspector changes are validated before one resize operation. Delete Event is visible and does not require confirmation.

Every event is a focusable button with a channel-and-time accessible label and an `aria-pressed` selected state. Delete and Backspace remove the selection outside text fields. Escape clears selection (and pointer cancellation clears an active gesture). Exact Inspector inputs provide a keyboard-accessible editing alternative.

## Scope and limitations

Rendering intentionally uses absolutely positioned DOM blocks rather than Canvas, making pointer interaction, focus, and accessible state straightforward. There is no virtualization yet because expected scores are small. This version deliberately excludes snapping, copy/paste, multi-selection, undo/redo, runtime compilation, and hardware preview.
