# Runtime Score v1

Runtime Score is a compiled, transient snapshot of a Project. It is not the editable Authoring Score and is never stored in a `.lightshow` file. The three independent versions are Project schema `2`, Authoring Score `1`, and Runtime Score `1`.

```text
CompiledShowV1 { version: 1, durationMs, masters[] }
CompiledMasterScore { masterId, costumeId, frames[] }
RuntimeFrame { timeMs, transitions[] }
RuntimeTransition {
  slaveId, slaveLogicalAddress, channelId,
  hardwareOutputIdentifier, state: "ON" | "OFF"
}
```

Each master is included even when it has no frames, so a later uploader can identify every destination. Display names and transport details (ports, USB identities, GPIO bytes, and protocols) are deliberately absent. Logical addresses and output identifiers are resolved at compile time: changing topology or score makes the snapshot stale.

## Execution semantics

Before playback, a runtime **must reset every controlled output to OFF**. It then establishes show time zero, applies the frame at `0` (if present), and continues in ascending time order. Thus an authoring interval `[0, 1000)` is ON at show start. Authoring intervals use `[startMs, endMs)` semantics.

Frames group every transition for the same master and millisecond. Adjacent intervals on one channel, such as `[1000, 2000)` and `[2000, 3000)`, are normalized to ON at 1000 and OFF at 3000; there is no physical OFF pulse at 2000. Separated intervals retain their OFF gap.

Masters are ordered by `masterId` (then `costumeId`), frames by ascending `timeMs`, and transitions by logical address, hardware output identifier, slave ID, channel ID, and state. These comparisons are explicit and do not depend on source arrays, traversal side effects, or `Map` iteration. Canonical diagnostic serialization is controlled-construction, two-space JSON and is byte-for-byte stable for equivalent inputs.

`durationMs` is the audio duration when one is available; otherwise it is the maximum interval end, or zero for an empty score. Runtime v1 does not trim events to duration: events beyond a known audio duration are invalid.

The intended future boundary is `Project → Compiler → CompiledShow → per-master payload → ESP32`. Runtime v1 defines only the first two arrows; it defines no binary format, packet framing, serial/UART transport, discovery, upload, firmware, synchronization, or hardware playback.

