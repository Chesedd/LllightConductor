# Prepared Show v1

Prepared Show v1 is the canonical desktop-side, hardware-ready JSON diagnostic representation. It is **not** the future desktop-to-ESP32 upload wire format.

```ts
interface PreparedShowBundleV1 {
  version: 1;
  masters: PreparedMasterShowV1[];
}
interface PreparedMasterShowV1 {
  masterId: string;
  costumeId: string;
  durationMs: number;
  frames: PreparedFrameV1[];
}
interface PreparedFrameV1 {
  timeMs: number;
  slaveBatches: PreparedSlaveBatchV1[];
}
interface PreparedSlaveBatchV1 {
  slaveAddress: number; // Protocol v1: 0..254; 255 is reserved
  updates: PreparedOutputUpdateV1[]; // 1..31
}
interface PreparedOutputUpdateV1 {
  outputId: number; // uint8
  state: "ON" | "OFF";
}
```

Every runtime frame is grouped by `slaveLogicalAddress`. Masters use the compiler's deterministic master ordering; frames are ascending by `timeMs`, slave batches by `slaveAddress`, and updates by `outputId`. Duplicate output updates in one batch are invalid. No partial value is returned on error. A master with no transitions is represented with its compiled `durationMs` and `frames: []`; duration is never independently recomputed.

The 31-update ceiling derives from Protocol v1's 64-byte payload: one count byte and two bytes per update. A larger same-time Pico update is rejected to preserve the firmware's one-batch/one-`SET_OUTPUTS` boundary.

The model corresponds directly to the ESP32 firmware structs `PreparedMasterShow`, `PreparedFrame`, `PreparedSlaveBatch`, and `PreparedOutputUpdate`. The compatibility test reproduces the built-in demo: slave 7, output IDs 0–3, and frames at 0, 500, 1000, 1500, 2000, and 2500 ms.
