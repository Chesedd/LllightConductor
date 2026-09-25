# Prepared Master Binary v1

This is the canonical, execution-only serialization of one `PreparedMasterShowV1`. It is independent of Project, Score, Prepared Show, and both wire-protocol versions. `masterId`, `costumeId`, channel IDs, and hardware output strings are deliberately absent.

All integers are unsigned little-endian. The header is: ASCII `PMB1` (4), format version `u8=1`, reserved `u8=0`, duration milliseconds `u32`, frame count `u16`. Each frame is `timeMs u32`, `batchCount u8`; each batch is `slaveAddress u8`, `updateCount u8`; each update is `outputId u8`, `state u8` (`0=OFF`, `1=ON`). A `u32` time permits 49.7 days. Counts bound a show at 65,535 frames, 255 slaves per frame, and—by validation policy—31 updates per Pico batch.

Canonical serialization retains the already-defined order of frames, batches, and updates. It rejects non-increasing frames, a frame after duration, invalid/duplicate slave addresses, empty batches, more than 31 updates, invalid/duplicate outputs, invalid states, and integer overflow. The decoder rejects truncation, trailing bytes, nonzero reserved fields, and the same structural errors.

The protocol limit is 512 KiB per binary artifact. `SHA-256(canonical bytes)` is its artifact ID and whole-artifact integrity check; it is not authentication.

## Golden artifact

The fixture is duration 1000 ms; at time 0, slave 7/output 0 is ON; at time 1000 it is OFF.

```text
504d42310100e80300000200000000000107010001e80300000107010000
SHA-256: 444045197d1c91ca42dd4a1a23e1ee4ae7c7da3a962d0d4838f0458724f1a1f6
```

