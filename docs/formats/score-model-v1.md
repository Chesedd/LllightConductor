# Score model v1

## Purpose and boundary

Score v1 is the authoring model for a whole project's shared show timeline. It records lighting intent, not runtime or hardware commands. GPIO levels, ON/OFF transitions, UART packets, ESP32 commands, Pico addresses, and compiler output do not belong here. A later compiler may derive those artifacts.

Score model versioning is independent from `.lightshow` file `schemaVersion`: the current file is V3 while the embedded score is V1.

```ts
type Score = { version: 1; events: ScoreEvent[] };
type ScoreEvent = LightInterval;
type LightInterval = {
  id: string;
  kind: 'light-interval';
  channelId: string;
  startMs: TimelineTimeMs;
  endMs: TimelineTimeMs;
};
```

The discriminated `ScoreEvent` union currently contains only `light-interval`; future event kinds must be added explicitly. In particular, this version makes no claim that addressable LEDs can use binary intervals: color, brightness, animation, or segment semantics require a future kind.

## LightInterval semantics

A light interval means its logical output channel is on during **`[startMs, endMs)`**: start is inclusive and end is exclusive. Both values use the project's safe-integer, millisecond `TimelineTimeMs` system. `startMs >= 0` and `endMs > startMs`; negative, fractional, zero-duration, and reversed intervals are invalid.

`channelId` must reference an existing `el-wire` or `digital-output` Output Channel. Costume, master, and Pico IDs are not valid targets. IDs are stable: moving, resizing, renaming topology, reordering topology, or changing a hardware output identifier does not change an event ID or reference. Copying would create a new ID, but copy/paste is outside V1.

All costumes use the same project time. Events on different channels may overlap without limit. On one channel, intervals overlap exactly when `A.startMs < B.endMs && B.startMs < A.endMs`; such scores are invalid. Adjacent intervals such as `[1000,2000)` and `[2000,3000)` are valid and remain distinct so author intent is preserved.

Array order has no temporal meaning. Persistence uses a deterministic `startMs`, `endMs`, then `id` order for convenience.

## Aggregate behavior

Create, move, resize, and remove are immutable domain operations. Move preserves duration; move and resize preserve the stable event ID. Collision errors are typed and expose the channel, conflicting event ID, and attempted range for presentation by a future editor.

If audio has a known duration, every `endMs` must be at or before it. Score can exist without audio. Assigning/replacing audio is rejected with a typed conflict when the new duration is shorter than the maximum score end; removing audio preserves score.

Deleting a Channel deletes its events. Deleting a Pico or Costume deletes events of all descendant channels while retaining the existing device-binding cleanup. Rename, reorder, and hardware-output changes never rewrite score.

`buildScoreLaneModel` is the editor-facing read model: lanes follow topology order and events are joined by stable channel ID. Score editing UI, drag/resize, snapping, undo, compilation, protocols, and preview are intentionally outside this stage.
