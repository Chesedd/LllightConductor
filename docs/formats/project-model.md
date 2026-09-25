# Project domain model (schema v1)

`CURRENT_PROJECT_SCHEMA_VERSION` is the version of the persisted project schema, not the application version. The current value is **1**. A future persistence layer can inspect it and apply explicit `v1 → v2` migrations; this stage does not define a file or JSON format.

## Aggregate

`Project` is the aggregate root. It owns stable identity, name, creation/update timestamps, an optional `AudioTrack`, ordered costumes, the provisional score, and durable device bindings. A project-changing domain operation produces a new value and advances `updatedAt`.

An audio reference is either a project asset name or an external URI. This keeps the model independent of Windows paths and leaves copying/resolution policy to persistence. Optional duration and media type are descriptive metadata.

## Logical hardware topology

```text
Project
└── Costume[]
    └── MasterController
        └── SlaveController[]
            └── OutputChannel[]
```

Every entity has a stable, opaque ID that survives rename, reorder, save/load, and future timeline editing. IDs are UUIDs in production (`crypto.randomUUID`); generators are injected in tests. Display names are never identifiers.

Controller and channel `type` fields are discriminated string unions with known current values and a `custom:` extension. They model capabilities without introducing a plugin system. A slave's optional non-negative logical address is topology configuration, not a UART packet field. A channel's hardware output identifier is opaque to the domain; the domain does not impose a GPIO numbering scheme.

## Logical versus physical devices

Topology describes the intended show configuration. `DeviceBinding` separately associates a logical controller ID with a stable physical device type and hardware ID. Bindings may therefore survive reconnection, while discovery and connection state do not leak into the project.

Online/offline status, last-seen timestamps, serial ports, errors, and discovered devices are runtime hardware/communication state and are **not persisted project data**. Likewise, selected tabs, dialogs, zoom, selection, and playhead position belong to UI state.

## Integrity rules

- Project, costume, controller, and channel names are non-empty after trimming.
- Entity and binding IDs are non-empty and unique across the project aggregate.
- Slave logical addresses, when present, are non-negative integers and unique within their master.
- Hardware output identifiers are non-empty and unique within their slave.
- Constructors/operations reject invalid direct input early; the aggregate validator checks complete imported or reconstructed data and cross-entity uniqueness.

## Score status

The score is deliberately a versioned `ProvisionalScore` marker. It specifies no events, timing, duration, or values. Its presence reserves the project boundary without turning the former `start/duration/value` spike into a contract. Timeline behavior and the final score schema will be designed separately.

## Not covered by schema v1 implementation

No project-file serialization, filesystem strategy, migration engine, audio import/playback, timeline behavior, protocol, discovery, or connection handling is defined in this stage.
