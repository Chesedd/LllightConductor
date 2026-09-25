# Desktop ↔ ESP32 Protocol v1

## Scope and layers

This protocol connects the desktop application to exactly one ESP32 Master over a reliable-ish byte stream. It carries identity, a prepared artifact, control, and compact diagnostics. It does **not** reuse or extend ESP32 ↔ Pico Protocol v1. The layering is messages → binary frames → a future byte transport; v1 defines only the first two. Serial discovery, serial APIs, firmware integration, persistence, synchronization, networking, and authentication are out of scope.

The pipeline remains Project → Runtime Compiler → Hardware Preparation → one Prepared Master Binary per physical Master → this protocol → ESP32 scheduler → Pico protocol. The ESP32 never sees editor-domain identifiers.

## Frame

All multibyte values are unsigned little-endian.

| Offset | Size | Field |
|---:|---:|---|
| 0 | 2 | magic `D3 32` |
| 2 | 1 | protocol version (`1`) |
| 3 | 1 | message type |
| 4 | 2 | request/response sequence |
| 6 | 4 | session ID |
| 10 | 2 | payload length |
| 12 | 0..1024 | payload |
| end | 4 | CRC-32/ISO-HDLC |

A 16-byte empty frame is small while `u16` sequence naturally wraps modulo 65,536 and `u32` sessions avoid accidental reuse. The deliberately enforced 1024-byte payload cap bounds ESP32 parser/staging RAM and still amortizes serial overhead; an upload chunk has a four-byte offset and at most 1020 data bytes.

CRC-32/ISO-HDLC parameters are polynomial `0x04C11DB7` (reflected implementation `0xEDB88320`), init `0xFFFFFFFF`, refin/refout true, xorout `0xFFFFFFFF`. Coverage starts at version (offset 2), includes the header remainder and payload, and excludes magic and CRC. Standard vector ASCII `123456789` produces `CBF43926`. CRC32 is chosen over CRC16 because this protocol transfers hundreds of KiB in 1 KiB units.

The streaming parser accepts arbitrary/empty/partial reads and multiple frames. It scans for magic, retains a possible first magic byte, rejects length above 1024 before buffering a body, emits errors for bad CRC/version, advances one byte after corrupt data, and resumes scanning. Transport read boundaries have no meaning.

## Messages and payloads

| Code | Message | Payload |
|---:|---|---|
| `01`/`02` | HELLO / HELLO_ACK | HELLO: payload schema `u8`; ACK: protocol `u8`, device UUID 16 bytes, firmware semver 3×`u8`, state `u8`, capability flags `u8` |
| `03`/`04` | ACK / NACK | empty / reason `u8` |
| `10`/`11` | GET_STATUS / STATUS | empty / status below |
| `20`/`21` | BEGIN_UPLOAD / UPLOAD_READY | format `u8`, length `u32`, SHA-256 32; ready: accepted length `u32`, max data/chunk `u16` |
| `22` | UPLOAD_CHUNK | offset `u32`, data |
| `23`/`24` | END_UPLOAD / UPLOAD_COMPLETE | empty / artifact SHA-256 |
| `30` | ACTIVATE_SHOW | artifact SHA-256 |
| `31`/`32` | START_SHOW / STOP_SHOW | empty |

Firmware version and protocol version are separate. A desktop can therefore distinguish reachability, incompatible framing, and the displayed firmware release. `deviceId` is a persistent 128-bit UUID/octet string, stable across reboot; COM names are never identity. Hardware derivation is a firmware concern. Capability flags are zero in v1; there is no elaborate negotiation.

NACK codes are: `1 UNKNOWN_MESSAGE`, `2 INVALID_PAYLOAD`, `3 BAD_SESSION`, `4 INVALID_STATE`, `5 UNSUPPORTED_VERSION`, `6 UPLOAD_TOO_LARGE`, `7 UPLOAD_OFFSET`, `8 UPLOAD_CONFLICT`, `9 HASH_MISMATCH`, `10 INVALID_SHOW`, `11 NO_SHOW`, `12 BUSY`, `13 INTERNAL_ERROR`.

## Session, sequence, and replay

The desktop chooses a fresh non-cryptographic `u32 sessionId` and begins with HELLO. Responses copy request session and sequence. Within a session, sequence values wrap modulo 65,536; a client must not reuse a still-cacheable value for a different request. The device caches completed request responses for the session. An exact repeated sequence returns the cached response and performs no side effect again. A production implementation must retain enough request fingerprint/cache history to reject conflicting reuse and document its finite cache window.

A new valid HELLO establishes the session, clears replay history, and cancels only an incomplete upload. It preserves active/candidate artifacts and does not stop a running show. Disconnect has no control side effect: after START the Master is autonomous.

## Upload, atomicity, and activation

The desktop selects the artifact matching the physical Master, then sends BEGIN_UPLOAD → UPLOAD_READY, sequential UPLOAD_CHUNK → ACK, END_UPLOAD → UPLOAD_COMPLETE, and separately ACTIVATE_SHOW → ACK. The 512 KiB policy gives bounded storage while accommodating typical prepared shows.

Chunks begin at offset zero and advance contiguously. A repeated already-written range with identical bytes is idempotently ACKed; differing bytes produce `UPLOAD_CONFLICT`. A gap, overrun, or incomplete END produces `UPLOAD_OFFSET`. Reconnect does not resume an upload.

The device assembles into staging, checks exact length, SHA-256, decodes Prepared Master Binary v1, and revalidates it. Failure discards staging but never the old active show. Success creates one validated candidate and returns its hash. ACTIVATE atomically replaces the active show only when its requested hash matches the candidate. Thus upload and activation are intentionally distinct; v1 keeps at most one candidate and one active show. Storage is volatile in the reference model; flash/NVS policy is future work.

BEGIN is allowed in IDLE or READY, but not RUNNING (`BUSY`). START is invalid while uploading and requires an active show. START's ACK means accepted, not that physical frame zero has reached GPIO; subsequent STATUS becomes RUNNING after internal Pico preparation. ESP32 owns the monotonic clock. STOP is idempotent, stops scheduling, uses the firmware's safe RESET_OUTPUTS path, and returns to READY (or IDLE without a show). Multi-Master or scheduled starts are not defined.

## State, status, and faults

Wire states are `0 IDLE`, `1 UPLOADING`, `2 READY`, `3 RUNNING`, `4 FAULT`. STATUS is: state `u8`; active-present `u8` + 32 hash bytes; candidate-present `u8` + 32 hash bytes; duration `u32`; diagnostic position `u32`; connected and required Pico counts `u8,u8`; fault category `u8`; fault detail `u16`; late-frame count `u32`; max lateness µs `u32`; reserved `u16`; status schema `u8=1`. Position is observational and never an authoritative playback clock.

Fault categories are `NONE`, `PROTOCOL`, `UPLOAD`, `INVALID_SHOW`, `PICO_UNAVAILABLE`, `PICO_PROTOCOL`, `SCHEDULER`, and `INTERNAL`; detail is a small implementation-defined number, not a debug string.

## Throughput and baud recommendation

With 8-N-1, each byte costs ten line bits. For 1020 data bytes, a chunk request plus ACK uses about 1052 wire bytes, an overhead factor of 1.031. Ignoring small BEGIN/END processing pauses, estimated upload seconds are:

| artifact | 115200 | 460800 | 921600 |
|---:|---:|---:|---:|
| 10 KiB | 0.92 s | 0.23 s | 0.11 s |
| 50 KiB | 4.58 s | 1.15 s | 0.57 s |
| 100 KiB | 9.17 s | 2.29 s | 1.15 s |
| 250 KiB | 22.92 s | 5.73 s | 2.86 s |

Start at **460800 baud**: it reduces a maximum-size transfer to roughly 12 seconds while offering more bridge/cable margin than 921600. Implementations may offer 921600 after hardware qualification; protocol semantics do not depend on baud.

## Golden framing and security

Tests contain literal complete frames for HELLO, HELLO_ACK, ACK, NACK, GET_STATUS, STATUS, every upload message, ACTIVATE, START, and STOP. The canonical prepared bytes/hash are in the format specification; these fixtures are intended for later cross-language firmware tests.

CRC detects transmission corruption. SHA-256 identifies and checks an assembled artifact. Neither authenticates a desktop or device, and there is no confidentiality, replay protection across malicious sessions, encryption, authorization, or OTA security in v1. Deployments needing hostile-device protection require a future authenticated protocol version.
