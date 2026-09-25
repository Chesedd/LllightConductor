# Score compiler

The score compiler is a pure TypeScript library. It indexes topology and validates logical execution targets, groups interval endpoints per channel, sorts each channel timeline, folds simultaneous endpoint deltas, and emits only actual state changes. Finally it groups changes into per-master frames and applies the canonical ordering documented in [Runtime Score v1](../formats/runtime-score-v1.md).

Compilation is atomic: errors throw a typed `ScoreCompilerError` and no partial artifact is returned. Codes are `unsupported-event`, `unsupported-channel`, `missing-channel`, `missing-slave`, `missing-master`, `invalid-target`, `duplicate-target`, `invalid-time`, and `project-invalid`. A duplicate route is the same master, slave logical address, and hardware output identifier resolving to different channels.

With `T` topology entities and `E` interval events, indexing and grouping are linear and sorting is bounded by `O(E log E)`. No global pairwise event comparison is performed, and the authoring Project is never mutated.

The editor keeps the result only in React application state. Compile, preview, save, zoom, seek, and playback do not modify the Project or history. Domain edits and Undo/Redo clear the artifact; saving alone preserves it.

