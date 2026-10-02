> **Historical v1 design:** retained for reference; current production firmware is documented by `docs/protocols/esp32-pico-protocol-v2.md` and the firmware README files.

# Pico Slave firmware v1 architecture

The firmware in `firmware/pico-slave` follows the stable Protocol v1 without a
Pico-specific wire variant.

## Boundaries and data flow

```text
UART1 transport (main.cpp)
  -> fixed-buffer StreamParser
  -> Protocol v1 frame codec and CRC
  -> CommandProcessor (session, duplicate cache, commands)
  -> OutputController interface
  -> PicoOutputController
  -> RP2040 GPIO
```

`protocol.cpp`, `stream_parser.cpp`, and `command_processor.cpp` are portable
C++17 and have no Pico SDK dependency. Host tests inject `FakeOutputs`.
Production injects `PicoOutputController`, which owns polarity conversion and
the explicit output-ID-to-GPIO map.

## Safety and lifecycle

At boot GPIO pads are preloaded to the inactive physical level, changed to
outputs, and reset OFF before UART starts. A different valid HELLO session also
resets all outputs, clears the one-entry response cache, and activates the new
session. Repeating HELLO in the same session does not reset outputs.

Session-bound commands before HELLO or with a mismatched session receive
`BAD_SESSION`. A request whose sequence equals the last completed sequence in
the active session replays the exact cached response without touching outputs.
Equality—not integer ordering—is used, so `65535 -> 0` is valid.

SET_OUTPUTS decodes and validates shape, IDs, states, and duplicate IDs before
calling `applyBatch`; invalid batches cannot partially apply. The production
controller then performs the GPIO writes in one compact loop before ACK.
RESET_OUTPUTS uses the same controller reset operation. STATUS reads controller
state and reports Protocol v1 fields and its output-ID-indexed bitmap.

Internal diagnostic flags currently assign bit 0 to parser errors, bit 1 to
invalid commands, and bit 2 to output failures. Protocol v1 explicitly leaves
these assignments as firmware integration details. No extra wire fields are
introduced.

## Limitations

- GPIO switching is logically atomic but not physically simultaneous.
- Response transmission uses the Pico SDK blocking UART write only after a
  complete command; frame reception never blocks waiting for a packet.
- The duplicate cache intentionally covers only the immediately completed
  request, as specified by v1.
- There is no communication-loss watchdog, ESP32 firmware, desktop serial
  transport, score upload, scheduler, PWM, wireless transport, or updater.
- Target compilation requires an externally installed Pico SDK/toolchain;
  portable host tests do not.
