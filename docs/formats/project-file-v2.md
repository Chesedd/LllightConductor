# Lllight Conductor project file V2

`.lightshow` V2 is human-readable JSON with root `schemaVersion: 2`. It persists project identity/timestamps, nullable audio, topology, device bindings, and the first committed score representation:

```json
{
  "schemaVersion": 2,
  "id": "project-id",
  "name": "Opening Show",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "audio": null,
  "costumes": [],
  "score": { "version": 1, "events": [] },
  "deviceBindings": []
}
```

File schema and score model versions are separate compatibility axes. Readers structurally parse untrusted JSON and then run aggregate validation. Malformed score fields, unknown event kinds, duplicate event IDs, invalid timing/overlap/audio bounds, unsupported channel capability, and dangling channel references are rejected.

## V1 migration

V1 stored only `provisionalScore: { "format": "provisional", "version": 1 }`; it contained no approved user events. The reader validates that marker, migrates it to empty Score v1, and maps the rest into the current domain. Open does not alter the V1 file. A later Save serializes the aggregate as V2.

Atomic file replacement and exclusions described by V1 remain unchanged. Audio bytes, UI/editor/transport state, runtime hardware state, dirty state, recent-project metadata, and absolute project path are not persisted.
