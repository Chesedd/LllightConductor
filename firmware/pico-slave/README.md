# Raspberry Pi Pico Protocol v1 slave

First working Raspberry Pi Pico firmware for the normative
[`ESP32 ↔ Pico Protocol v1`](../../docs/protocols/esp32-pico-protocol-v1.md).
It is a binary UART actuator endpoint—not a show scheduler and not an ESP32 or
desktop transport implementation.

## Hardware configuration

All deployment settings are compile-time constants in
`include/pico_slave/config.hpp`. The default development mapping is explicit;
an output ID is **not** inferred from a GPIO number.

| Protocol output ID | Pico GPIO | Polarity |
|---:|---:|---|
| 0 | GP10 | active high |
| 1 | GP11 | active high |
| 2 | GP12 | active high |
| 3 | GP13 | active high |

The slave address is `7`. Protocol UART uses configurable instance `uart1`, **115200 8-N-1**, TX
GP4 and RX GP5. These pins do not overlap the outputs. `active_high=false` is
supported for an active-low driver; protocol ON/OFF remains logical.

### Wiring

```text
ESP32 TX  -> Pico GP5 (UART RX)
ESP32 RX  <- Pico GP4 (UART TX)
ESP32 GND <-> Pico GND                 (common ground is required)
Pico GP10/11/12/13 -> driver control inputs
```

RP2040 GPIO uses **3.3 V logic**. Never apply 5 V, 7.4 V, or another power
voltage directly to a GPIO. Use an appropriate interface or level shifter when
the driver input is incompatible.

The Pico does **not** power EL wire or an EL inverter. Each output controls only
the safe control side of a suitable MOSFET module, relay module, or other driver
stage. The inverter is a separate power/high-voltage component: never connect
its high-voltage AC output to Pico GPIO.

## Boot and runtime behavior

The output controller initializes each pad with its inactive level before
enabling output direction, then resets all logical states OFF. UART is
initialized only after this safety sequence. The non-blocking main loop drains
available UART bytes into a fixed-size streaming parser and sends binary
responses. No heap allocation occurs in the real-time protocol path.

The parser accepts fragmented/combined input, discards garbage, bounds payloads
at 64 bytes, checks CRC, and resynchronizes after malformed data. The command
processor implements HELLO/session reset, one-entry exact response replay,
modulo-`uint16_t` sequences, PING/PONG, atomic validation-before-apply
SET_OUTPUTS, RESET_OUTPUTS, and STATUS. Wrong-address frames are ignored;
address 255 is not broadcast. Framing/CRC failures are dropped without NACK.

`PICO_SLAVE_DEBUG` is off by default. If enabled, diagnostics use USB stdio;
UART1 remains binary-protocol-only. A communication-loss watchdog is
intentionally not enabled because Protocol v1 does not define that runtime
behavior; it is a future safety feature.

## Host tests (no Pico required)

```sh
cmake -S firmware/pico-slave -B build/pico-host -DPICO_SLAVE_HOST_TESTS=ON
cmake --build build/pico-host
ctest --test-dir build/pico-host --output-on-failure
```

Tests exercise CRC, fixed documentation golden vectors, frame encoding and
decoding, parser recovery, sessions and wrap, duplicates, batch atomicity,
reset, ping, and status against an in-memory output controller.

## Pico SDK build and flashing

Install a recent Raspberry Pi Pico SDK and its ARM toolchain, initialize SDK
submodules, and export `PICO_SDK_PATH` to the SDK checkout. No IDE is required.

```sh
cmake -S firmware/pico-slave -B build/pico-slave
cmake --build build/pico-slave
```

The flash image is `build/pico-slave/pico_slave.uf2`. Hold **BOOTSEL** while
connecting the Pico over USB, then copy that UF2 to the mounted `RPI-RP2` drive.

Firmware version constants are `1.0.0`; the wire HELLO_ACK carries only the
Protocol v1 deployment firmware ID (`0x0102`), capabilities (`SET_OUTPUTS`), and
configured output count. It does not add a private version payload.
