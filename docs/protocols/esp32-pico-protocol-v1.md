# ESP32 Master ↔ Raspberry Pi Pico Protocol v1

Status: **stable host reference**, version `1`. This document is normative for future ESP32 and Pico implementations. TypeScript implements framing and semantics only, not UART.

## 1. Roles, scope, and layers

The ESP32 Master receives and stores its future prepared Master Score, owns the costume show clock, schedules transitions, knows its Pico logical addresses, and controls command ordering. A Pico Slave is only an actuator/controller: it does not store the show score, schedule a timeline, or own an independent show clock. It applies commands, acknowledges them, and reports compact status/errors.

Keeping the score off Pico removes ESP32↔Pico clock synchronization, reduces Pico memory and firmware complexity, avoids clock drift, and leaves one runtime scheduler implementation. `SET_OUTPUTS` means **validate the complete command and apply it now**; it contains no show timestamp.

The independent layers are: protocol messages → binary framing/encoding → byte transport. This stage implements the first two. No API assumes one UART read equals one frame. Protocol v1 excludes desktop↔ESP32 transfer, score upload, real I/O, and firmware.

## 2. Topology and identifiers

One ESP32 may control multiple Pico slaves. `slaveAddress` is a byte `0..254`; `255` is reserved for a possible future broadcast design and **MUST NOT be sent or accepted in v1**. The protocol therefore works with point-to-point UARTs and does not depend on a shared bus.

A Pico output has numeric `outputId` `0..255`, mapped by Pico configuration to a GPIO/output driver. Runtime Score v1 remains transport-neutral and retains opaque string `hardwareOutputIdentifier`. A future hardware-preparation stage must explicitly map:

```text
CompiledMasterScore + per-device mapping (hardwareOutputIdentifier -> uint8 outputId)
  -> PreparedMasterFrame { timeMs, updates[{ slaveAddress, outputId, state }] }
```

`"15"`, `"GP15"`, and `"relay-left"` are equally opaque. Implementations MUST NOT infer IDs with `parseInt`. The host `prepareOutputUpdate` helper models this boundary without changing Runtime Score v1.

## 3. Frame layout

All multi-byte integers are **unsigned little-endian**.

| Offset | Size | Field | Rule |
|---:|---:|---|---|
| 0 | 2 | magic | bytes `A5 5A` |
| 2 | 1 | version | `01` for v1 |
| 3 | 1 | messageType | registry below |
| 4 | 1 | slaveAddress | `0..254` |
| 5 | 2 | sequence | modulo 65536 |
| 7 | 4 | sessionId | non-security session nonce |
| 11 | 2 | payloadLength | `0..64` |
| 13 | N | payload | exactly N bytes |
| 13+N | 2 | crc | little-endian CRC-16 |

Fixed overhead is 15 bytes. Session in every frame rejects delayed prior-session data. The 64-byte limit prevents unbounded allocation and permits 31 batch updates. Uint16 sequence gives practical correlation/wrap distance; byte addresses and output IDs are ample for a costume.

### CRC

CRC is **CRC-16/CCITT-FALSE**: polynomial `0x1021`, init `0xFFFF`, `refin=false`, `refout=false`, `xorout=0x0000`. It covers `version` at offset 2 through the final payload byte; magic and CRC are excluded. The result is appended low byte first. Published check input ASCII `123456789` produces `0x29B1`.

CRC provides accidental-error integrity, **not security/authentication**. V1 has no encryption or authenticity because this is a local wired costume link.

## 4. Messages and payloads

| Code | Name | Direction | Payload |
|---:|---|---|---|
| `01` | `HELLO` | Master→Pico | empty |
| `02` | `HELLO_ACK` | Pico→Master | `firmwareId:u16`, `capabilities:u16`, `configuredOutputCount:u8` |
| `03` | `PING` | Master→Pico | opaque `token:u32` |
| `04` | `PONG` | Pico→Master | identical `token:u32` |
| `05` | `RESET_OUTPUTS` | Master→Pico | empty |
| `06` | `SET_OUTPUTS` | Master→Pico | batch below |
| `07` | `ACK` | Pico→Master | empty |
| `08` | `NACK` | Pico→Master | `errorCode:u8` |
| `09` | `GET_STATUS` | Master→Pico | empty |
| `0A` | `STATUS` | Pico→Master | status below |

Responses repeat address, sequence, and session from the request header, so ACK needs no redundant payload. Responses are not acknowledged. Unlisted message codes are unknown.

HELLO proposes the header session/version. HELLO_ACK proves address/version/session and supplies basic identity/capabilities. Capability bit 0 means `SET_OUTPUTS`; other v1 bits are reserved zero. Firmware IDs are deployment-defined. PING/PONG echoes its token. RESET validates an empty payload, turns every configured output OFF, then ACKs.

### SET_OUTPUTS atomic batch

```text
offset  size  field
0       1     count (1..31)
1       1     update[0].outputId
2       1     update[0].state (0=OFF, 1=ON)
...     ...   repeated count times
```

Length MUST be `1 + 2*count`; an output may occur only once. There is no toggle and no separate `SET_OUTPUT`: count 1 is canonical. Pico MUST parse the whole frame; validate shape, every state, every configured ID, and uniqueness; apply all desired states as one logical operation as tightly as its driver permits; then ACK. Any invalid member causes NACK and **no output changes**.

### STATUS

```text
offset  size  field
0       1     protocolVersion (=1)
1       1     slaveAddress
2       1     sessionActive (0 or 1)
3       1     configuredOutputCount
4       2     errorFlags, little-endian
6       1     stateBitmapLength (0..32)
7       N     output state bitmap
```

Length MUST be `7 + stateBitmapLength`. Bit `outputId % 8` of byte `floor(outputId/8)` is ON. The bitmap may end after the highest configured ID; omitted upper bits mean OFF/unconfigured. Count says how many IDs are valid. Error-flag assignments remain firmware integration details; consumers tolerate unknown bits. This is deliberately not extensive telemetry.

### NACK codes

| Code | Name | Meaning |
|---:|---|---|
| `01` | `UNKNOWN_MESSAGE` | unsupported type |
| `02` | `INVALID_PAYLOAD` | wrong length/count/shape/duplicate ID |
| `03` | `INVALID_OUTPUT` | unconfigured output ID |
| `04` | `INVALID_STATE` | state is not 0 or 1 |
| `05` | `BAD_SESSION` | inactive or mismatched session |
| `06` | `UNSUPPORTED_VERSION` | recognizable envelope, unsupported version |
| `07` | `BUSY` | temporarily cannot accept |
| `08` | `INTERNAL_ERROR` | controller/actuator failure |

Bad magic, length, or CRC is normally dropped without NACK because address/sequence is untrusted. A receiver may NACK unsupported version only when it safely recognizes the common envelope; otherwise it drops it. V1 MUST NOT interpret an unknown-version payload as v1.

## 5. Session, sequence, duplicates, and retry

At boot Pico sets outputs OFF, has no session, and NACKs non-HELLO requests with `BAD_SESSION`. ESP32 chooses an unpredictable (not cryptographic) uint32 session ID, sends HELLO, and awaits matching HELLO_ACK. A different valid HELLO session makes Pico set all outputs OFF, clear duplicate state, activate it, and respond. Repeated HELLO in the current session does not reset outputs.

Every Master request has uint16 sequence, incremented modulo 65536 (`65535 → 0`). Responses echo it. Pico stores the **last completed request sequence and exact response in the active session**. An immediately repeated sequence is not executed and replays cached ACK/NACK/response. This one-entry cache handles normal ordered UART retry, not arbitrary replay after intervening commands. Master MUST constrain outstanding requests and not reuse a sequence while old data can remain in flight. A new session resets the cache.

For control/setup: send, await matching response, retry identical bytes/sequence after a recommended 50 ms timeout, maximum 3 attempts total. Deployments may tune this.

`SET_OUTPUTS` is ACKed, but the ESP32 show scheduler MUST NOT globally block its clock. It tracks ACK asynchronously and marks slave fault on timeout. Retry is allowed only while the command remains the desired state for **all** affected outputs. Once a newer command supersedes an affected state, never retry the stale command; it could restore old lighting. On stop/fault prefer RESET rather than stale replay.

## 6. Parser and resynchronization

The receiver buffers arbitrary chunks: one byte, partial header/payload, multiple frames, or mixtures. It searches for `A5 5A`, waits for 13 header bytes, rejects length over 64 before payload allocation, waits for the declared frame, then checks CRC before interpretation.

After oversized length or bad CRC it advances one byte and searches again, rather than trusting corruption. Garbage is discarded while a trailing lone `A5` is retained as a partial prefix. Partial frames stay buffered. A valid frame after garbage, a dropped byte, or corruption is therefore recoverable. UART reads have no message boundary.

## 7. Safety, timing, and throughput

Pico outputs initialize OFF. A new session and RESET force OFF. Before show, after stop, reconnect, and unrecoverable state, Master should establish a session and strive to RESET all slaves. Communication loss alone cannot guarantee OFF without a future watchdog: this is a known limitation.

Recommended MVP transport is UART **115200 baud, 8-N-1**, but baud is not protocol semantics. At 10 wire bits/byte:

| Updates | Payload | Frame | Wire time |
|---:|---:|---:|---:|
| 1 | 3 B | 18 B | 1.563 ms |
| 4 | 9 B | 24 B | 2.083 ms |
| 8 | 17 B | 32 B | 2.778 ms |

Actual accuracy also includes ESP32 scheduling, UART queues, and Pico validation/driver latency. Pico has no show clock; v1 intentionally has no clock synchronization.

## 8. Golden vectors

Spaces separate bytes. All use address 7, session `0x89ABCDEF`; exact structured values live in host tests.

```text
HELLO       A5 5A 01 01 07 34 12 EF CD AB 89 00 00 DA C1
HELLO_ACK   A5 5A 01 02 07 34 12 EF CD AB 89 05 00 02 01 01 00 08 CC 47
PING        A5 5A 01 03 07 35 12 EF CD AB 89 04 00 40 30 20 10 BD 2B
PONG        A5 5A 01 04 07 35 12 EF CD AB 89 04 00 40 30 20 10 BB 5B
RESET       A5 5A 01 05 07 36 12 EF CD AB 89 00 00 49 E3
SET one     A5 5A 01 06 07 37 12 EF CD AB 89 03 00 01 03 01 49 C5
SET three   A5 5A 01 06 07 38 12 EF CD AB 89 07 00 03 01 01 02 00 07 01 9D C0
ACK         A5 5A 01 07 07 37 12 EF CD AB 89 00 00 10 7A
NACK        A5 5A 01 08 07 39 12 EF CD AB 89 01 00 03 CA 30
GET_STATUS  A5 5A 01 09 07 3A 12 EF CD AB 89 00 00 80 15
STATUS      A5 5A 01 0A 07 3A 12 EF CD AB 89 08 00 01 07 01 08 02 01 01 89 18 64
```

Firmware should run these as cross-language conformance vectors. The standalone `123456789 → 29B1` check prevents matching encoder/decoder CRC bugs.

## 9. Known limitations

- no security/authentication;
- no v1 broadcast behavior despite reserving 255;
- no timestamped execution or clock sync;
- only logical batch atomicity, not guaranteed hardware-simultaneous switching;
- one-entry duplicate cache assumes ordered UART and constrained outstanding work;
- no communication-loss watchdog;
- mapping/configuration and score upload are future layers.
