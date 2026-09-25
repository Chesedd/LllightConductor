# Lllight Conductor project file v1

Lllight Conductor MVP projects use one human-readable JSON file with the `.lightshow` extension. The file is not a ZIP or an asset package.

## Envelope and fields

The root is a JSON object whose required `schemaVersion` is `1`. It contains:

- `id`, `name`, `createdAt`, and `updatedAt` (timestamps are canonical ISO 8601 strings);
- nullable `audio`, containing stable metadata and either a `project-asset` name or an `external-uri` reference; audio bytes are never copied into the project;
- `costumes`; each costume owns its logical master/slave/channel topology and stable entity IDs;
- `deviceBindings`, durable links from logical controller IDs to physical device identities;
- `provisionalScore`, currently `{ "format": "provisional", "version": 1 }`.

`provisionalScore` is an internal placeholder, **not** a stable public score/event contract.

```json
{
  "schemaVersion": 1,
  "id": "project-id",
  "name": "Opening Show",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "audio": null,
  "costumes": [],
  "provisionalScore": { "format": "provisional", "version": 1 },
  "deviceBindings": []
}
```

## Deliberately excluded state

The current page, selection, playhead, zoom, dialogs, errors, online/offline status, serial ports, last-seen data, dirty flag, and the `.lightshow` file's absolute path are application-session state and are not persisted in the aggregate. Recent-project path/name/time metadata is stored separately in application-local storage.

## Validation and compatibility

Readers parse untrusted JSON, inspect `schemaVersion`, validate every v1 field, map the persistence DTO to the domain aggregate, and then enforce domain invariants. Files with missing or malformed versions are rejected. A version newer than the reader supports is rejected rather than interpreted as v1. A future version can add an explicit `PersistedProjectV1 → PersistedProjectV2` migration before domain mapping.

Saves write and flush a temporary sibling file before replacing the target. This prevents a partially written JSON document from overwriting the prior project; Windows additionally uses a rollback backup because its standard rename does not replace an existing file.
