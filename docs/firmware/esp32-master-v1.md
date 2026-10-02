> **Historical v1 design:** retained for reference; current production firmware is documented by `docs/protocols/esp32-pico-protocol-v2.md` and the firmware README files.

# ESP32 Master firmware v1

## Scope and architecture

The ESP32 is the single show-clock authority in one costume. It retains an already
prepared show, validates it, establishes Protocol v1 sessions, forces Pico outputs
OFF, schedules frames, sends one batch per slave, processes responses asynchronously,
records faults, and attempts a safe reset on stop/fatal failure. It also implements
the portable Desktop Protocol v1 receive/control stack; a real USB/UART desktop
adapter remains deliberately out of scope, as do Wi-Fi/Bluetooth/OTA and multi-ESP
synchronization.

```text
DesktopTransport -> Desktop streaming parser / frame codec
  -> DesktopCommandProcessor -> upload staging / PMB1 decoder
  -> owned candidate -> atomic active selection
  -> ShowController
PreparedMasterShow
  -> ShowScheduler
  -> ShowController / Pico command planner
  -> SessionManager
  -> portable Protocol v1 codec / stream parser
  -> PicoTransport (ESP-IDF UART or host fake)
```

The Desktop and Pico codecs have explicit names and are independent. Desktop frames
use explicit little-endian access, CRC-32/ISO-HDLC, a 1024-byte payload limit, and a
bounded 1040-byte parser. Uploads are sequential and limited to 512 KiB. `END_UPLOAD`
verifies portable SHA-256 over the canonical bytes and decodes an owning
`OwnedPreparedMasterShow`; scheduler views are rebuilt from that owned storage and
never point into the discarded upload transaction.

One validated candidate and one active artifact are held separately. Failed upload
or validation cannot modify the active artifact, and only `ACTIVATE_SHOW` atomically
moves the candidate into the active slot. Both are RAM-only and disappear on reboot;
flash persistence is a later stage.

`DeviceIdentityProvider` separates the required stable 128-bit identity from the
protocol core. Host tests inject a fixed identity. No ESP-IDF hardware identity
provider is wired yet, so production integration must derive and persist a stable ID
before exposing a real desktop transport; it must never generate one per HELLO.

`ShowController` owns lifecycle decisions, `SessionManager` owns mutable per-Pico
state, and `ShowScheduler` owns clock position and diagnostics. Production has one
polling control task, so ISR and scheduler never race. Fixed arrays bound sessions
(8), pending requests (8 per Pico), payloads (64 bytes), and parser storage; realtime
dispatch allocates no memory.

Desktop HELLO creates a communication session, clears the bounded 16-entry replay
window, and cancels only an incomplete upload. Candidate/active artifacts and Pico
execution survive reconnection. Exact duplicate requests in the retained window
replay the exact encoded response; conflicting reuse is rejected. After sequence
wrap, clients must not reuse a sequence that is still in this finite window for a
different request.

Wire state is produced in one mapping: upload takes precedence, Pico preparation and
ready map to `READY`, scheduler execution maps to `RUNNING`, and controller fault
maps to `FAULT`. STATUS reports owned artifact identities/duration, monotonic clamped
position, real configured/online Pico counts, and scheduler lateness. Fault detail is
numeric; raw C++ strings are not a wire API. START is acknowledged after asynchronous
preparation is accepted, and STOP uses the existing scheduler-stop/Pico-reset path.

The normative contract remains
[`esp32-pico-protocol-v1.md`](../protocols/esp32-pico-protocol-v1.md). A separate
portable ESP32 codec avoids a risky Pico refactor and is checked against the exact
shared golden bytes and independent CRC standard value.

## Prepared show boundary

```text
Desktop: Authoring Score -> Runtime Compiler -> CompiledMasterScore
         -> hardware preparation -> PreparedMasterShow
ESP32:   PreparedMasterShow -> scheduler -> SET_OUTPUTS -> Pico
```

The immutable model is duration plus ordered frames, ordered slave batches, and
numeric `(outputId, Off|On)` updates. Firmware never resolves channel IDs, topology
IDs, or `hardwareOutputIdentifier`. `load()` is the future upload seam, without
defining its wire format now.

Validation rejects inconsistent arrays, decreasing/out-of-duration frames, reserved
address 255, empty or oversized batches, duplicate/nonascending slave batches,
duplicate outputs, and invalid states. Ascending slave address gives deterministic
dispatch order, not simultaneous physical switching.

## Lifecycle and safety

States are `Idle`, `PreparingHello`, `PreparingReset`, `Ready`, `Running`, `Stopping`,
and `Fault`.

1. Boot is `Idle`; score execution is stopped and outputs are expected OFF.
2. Prepare discovers required slaves and sends `HELLO` with boot-derived, nonconstant
   session IDs.
3. Every matching `HELLO_ACK` is required. Although a new Pico session clears output,
   explicit `RESET_OUTPUTS` follows as defense in depth.
4. All reset ACKs are required for `Ready`; start is rejected before it.
5. Start captures the monotonic clock and enters `Running`.
6. Natural completion returns to `Ready`; the demo's final state is OFF.
7. Idempotent stop halts future frames, sends reset to every known Pico, then reaches
   `Idle` after ACKs or `Fault` after retry failure.
8. Fatal setup/scheduler failure stops scheduling, attempts reset, and stays `Fault`.

A failed Pico is marked offline/faulted without changing the absolute show clock for
other Picos. This version does not reconnect mid-show. “Expected OFF” cannot guarantee
electrical OFF after a severed link; that requires a future Pico watchdog or safety
circuit.

## Clock, scheduler, diagnostics, and batching

Production uses monotonic `esp_timer_get_time()`. Milliseconds are promoted before
multiplication and deadlines use signed 64-bit microseconds:

```text
deadlineUs = showStartUs + int64(timeMs) * 1000
```

Every deadline is relative to `showStartUs`, never the prior frame, so late work does
not accumulate drift. The task uses coarse FreeRTOS delay away from a deadline and
short polling near it rather than continuous busy-spin. Late frames are dispatched
immediately, never implicitly skipped or merged. Diagnostics retain last lateness,
maximum lateness, and late-frame count.

One prepared slave batch becomes one atomic `SET_OUTPUTS`, rather than one packet per
output. Slave batches are dispatched in ascending address order.

## Sessions, pending requests, and faults

Each logical Pico owns address, session, independent modulo-65536 sequence, online
and fault flags, last response/NACK, and a bounded pending table. Matching requires
address, session, sequence, and response kind; stale/unrelated responses are ignored.
The scheduler never blocks for an ACK.

Control requests use the Protocol v1 recommendation: 50 ms timeout and three total
sends of identical encoded bytes/sequence. Exhaustion faults and offlines the Pico.
Realtime requests use bounded tracking and retry only while current. The conservative
v1 supersession policy retires **every older pending SET_OUTPUTS for that Pico** when
a newer one is sent, even for disjoint outputs. This trades retries for simplicity
and guarantees an old transition cannot restore stale state. NACK faults the Pico;
`BAD_SESSION` does not trigger complex recovery during a show.

## Transport, UART, and electrical limit

`PicoTransport` and `MonotonicClock` isolate portable logic from ESP-IDF and allow
deterministic fakes. The production adapter maps address 7 onto one UART1 at 115200
8-N-1 with example ESP32 pins TX17/RX16. Ordinary UART is not multi-drop; never join
multiple Pico TX lines. Logical multi-Pico support awaits approved multi-UART, mux,
RS-485, or other hardware.

Wire ESP32 TX → Pico UART1 RX GP5, ESP32 RX ← Pico UART1 TX GP4, and common GND. Both
are 3.3 V logic. Never connect EL inverter power or high voltage to UART/GPIO.

## Demo and verification

The static demo drives Pico 7 outputs 0–3 at 0, 500, 1000, 1500, 2000, and 2500 ms.
Auto-start is disabled by default and may be deliberately enabled in menuconfig for
bench testing only.

Host tests cover show validation, empty/zero/ordered/late absolute scheduling, drift,
lateness, batching/order, stop, lifecycle gating, session establishment, sequence
independence/wrap, response matching, NACK, retry exhaustion, nonblocking realtime
ACK, supersession, parser recovery, fixed Protocol v1 vectors, and
`123456789 -> 0x29B1`. An in-memory Pico peer integration flow covers HELLO,
HELLO_ACK, reset/ACK, READY, timed SET_OUTPUTS/ACK, and stop/reset.
Desktop host coverage additionally checks literal TypeScript frame fixtures,
CRC-32 `123456789 -> CBF43926`, byte streaming/recovery, the canonical PMB1 fixture
and SHA-256, upload/candidate/activation, replay, session replacement, START, STATUS,
and STOP through fake desktop and Pico transports.
