# Current Project domain model

`Project` is the aggregate root. It owns stable identity and timestamps, optional audio metadata/reference, ordered logical hardware topology, Score v1, and durable device bindings. Project-changing operations return a new aggregate and update `updatedAt`.

## Logical topology and identity

```text
Project
└── Costume[]
    └── MasterController
        └── SlaveController[] (Pico in the current hardware)
            └── OutputChannel[]
```

All entities have opaque stable IDs generated with `crypto.randomUUID` in production and injected generators in tests. Display names, topology positions, logical addresses, and hardware output identifiers are not identity. `DeviceBinding` associates a logical controller with a physical device; connection/discovery state remains runtime-only.

Output channel IDs are the only topology references stored by Score. Consequently rename, reorder, and hardware-output edits preserve the score. Channel/Pico/Costume deletion cascades to affected events so the aggregate cannot retain dangling references. Controller deletion continues to clean its device bindings.

## Audio and score

Audio is optional. Its reference is a project asset or external URI; optional known duration is non-negative integer `TimelineTimeMs`. Score v1 may exist without audio. When duration is known, score events must fit within it; assigning shorter audio is rejected rather than silently truncating user work, while removing audio preserves score.

Score semantics and invariants are specified in [score-model-v1.md](score-model-v1.md). `validateProject` checks topology/binding integrity plus score version, event IDs and uniqueness, supported kind/channel capability, integer ranges, channel references, same-channel overlap, and audio bounds.

## Version boundaries

The in-memory aggregate uses the current project shape, while persistence uses explicit DTOs and migrations. `.lightshow` `schemaVersion` and embedded `score.version` are intentionally independent. The current writer emits file V2 containing Score v1. A V1 file is validated and migrated in memory to the current project with empty Score v1; opening alone never rewrites the source file.

UI state (page, selection, dialogs, zoom, scroll and playhead), dirty state, filesystem path, transport/decoder state, discovery, and connection status are excluded from Project.
