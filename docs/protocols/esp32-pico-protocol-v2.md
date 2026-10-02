# ESP32 ↔ Pico protocol v2 — one-way command stream

## Hardware contract

Version 2 is the current hardware protocol. It matches the physical open-loop path
`ESP32 TX → Pico RX → GPIO → MOSFET logic input`; there is no Pico-to-ESP32 wire.
The production defaults are **ESP32 GPIO18 TX** and **Pico GP5 UART1 RX**, plus a
common ground. Connect GPIO18 to the configured Pico UART RX GPIO (never infer RX
from a board label such as “TX2”). The Pico RX GPIO is the compile-time constant
`config::kUartRxPin`; the ESP32 pin is `CONFIG_LLLIGHT_PICO_UART_TX_PIN`.

Protocol v1 remains documented as the deprecated bidirectional prototype. Its
HELLO/ACK/NACK/PING/PONG/GET_STATUS/STATUS exchange is not part of v2. The ESP32
never waits for a response and cannot report physical Pico liveness.

## Frame

All integers are little-endian. A frame is `A5 5A`, version `02`, message type,
slave address (0–254), sequence u16, show epoch u32, payload length u16, payload,
and CRC u16. CRC-16/CCITT-FALSE (poly 0x1021, init 0xffff) covers version through
payload. Payload is bounded at 64 bytes. Sequence/epoch support diagnostics and
safe duplicate recognition, not delivery guarantees.

Only these ESP32-to-Pico types are active:

* `05 RESET_OUTPUTS`: empty payload; all configured outputs go OFF.
* `06 SET_OUTPUTS`: count u8 followed by `count` pairs `(outputId u8, state u8)`.
  Count is 1–31 and state is 0/1. The Pico validates length, IDs, states, duplicate
  IDs, address, version, and CRC before one atomic batch apply. An exact duplicate
  sequence/session/payload is accepted as an idempotent no-op.

Golden vectors (address 7, epoch `89abcdef`) are:

```
RESET seq=1234: A5 5A 02 05 07 34 12 EF CD AB 89 00 00 15 14
SET seq=1235 [(3,ON)]: A5 5A 02 06 07 35 12 EF CD AB 89 03 00 01 03 01 59 E8
SET seq=1236 [(1,ON),(2,OFF),(3,ON)]: A5 5A 02 06 07 36 12 EF CD AB 89 07 00 03 01 01 02 00 03 01 05 FD
```

Bad CRC and invalid frames are discarded without GPIO changes or a response.
CRC detects corruption at the receiver; it does **not** guarantee delivery. A
broken wire, powered-off or hung Pico, or lost packet is unknowable to ESP32.

## Lifecycle and diagnostics

Pico boots with GP10–GP13 (output IDs 0–3) OFF. Prepare sends RESET and becomes
Ready immediately. START sends RESET once more and starts the ESP32 absolute-
deadline scheduler; timeline batches become SET commands. STOP stops scheduling,
sends RESET immediately, and is repeat-safe. There are no retries or ACK faults.

`PICO_SLAVE_DIAGNOSTICS=ON` is the bring-up default. USB CDC stdout (not the
binary UART) prints complete-frame results only:

```
PICO READY
slave=7
rxPin=GP5
RX seq=12 RESET_OUTPUTS applied
RX seq=13 SET_OUTPUTS count=2 applied
RX CRC_ERROR
RX stats bytes=... frames=... valid=... crc=... invalid=... applied=...
```

A valid newly-applied command pulses the onboard LED for 35 ms using a deadline;
no frame handler sleeps. Local counters are `bytesReceived`, `framesReceived`,
`validFrames`, `crcErrors`, `invalidFrames`, `resetCommandsApplied`, and
`setCommandsApplied`. USB/LED are human observability, never protocol feedback.
Disable them with CMake `-DPICO_SLAVE_DIAGNOSTICS=OFF`.

## First hardware test

1. Wire ESP32 GPIO18 to Pico GP5 (or the explicitly configured RX GPIO), and GND
   to GND. Do not wire Pico TX back to ESP32.
2. Keep Pico USB attached to the PC and open its CDC serial output.
3. Reset ESP32. Confirm `PICO READY`, then `RESET_OUTPUTS applied`, and an LED pulse.
4. START a demo/show; confirm SET log lines and a pulse per valid applied frame.
5. STOP; confirm `RESET_OUTPUTS applied`.

USB CDC and UART1 RX operate simultaneously because SDK stdout UART is disabled;
ASCII diagnostics are never written onto the protocol UART.
