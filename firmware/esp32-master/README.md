# ESP32 Master firmware v1

ESP-IDF Master prototype for one point-to-point Pico link. It stores a static
prepared show, owns the monotonic show clock, establishes Protocol v1, explicitly
resets outputs, dispatches batched updates, and tracks replies asynchronously.
The portable C++17 core now accepts Desktop Protocol v1 through an in-memory-testable
`DesktopTransport` boundary. A production desktop serial adapter, networking, and
multi-Master synchronization remain out of scope.

## Requirements and build

- ESP-IDF **v5.2 or newer v5.x** (ESP-IDF 5.2–5.5 API surface)
- CMake 3.16+ and C++17 for host tests

```sh
. "$HOME/esp/esp-idf/export.sh"
cd firmware/esp32-master
idf.py set-target esp32       # select the real module when different
idf.py menuconfig
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

Demo auto-start defaults **off**. For a deliberate bench run, enable
`Component config > Lllight Master > Auto-start demo when READY`. Preparation still
requires HELLO/HELLO_ACK and RESET/ACK before start.

```sh
cmake -S host-tests -B build-host
cmake --build build-host
ctest --test-dir build-host --output-on-failure
```

## UART and wiring

Example defaults in `UartConfig` are UART1, 115200 8-N-1, ESP32 TX GPIO17, ESP32 RX
GPIO16, peer address 7. They do **not** assume a particular board; adjust them for
the selected module.

| ESP32 example | Raspberry Pi Pico | Direction |
|---|---|---|
| GPIO17 / TX | GP5 / UART1 RX | ESP32 → Pico |
| GPIO16 / RX | GP4 / UART1 TX | ESP32 ← Pico |
| GND | GND | common reference |

Do not wire TX to TX. Both UARTs use 3.3 V logic and are normally directly
compatible with common ground. **Never connect an EL inverter, its high-voltage
output, or its power section to UART/GPIO.**

Production currently supports exactly **one Pico on one UART**. Ordinary UART is
point-to-point: never parallel Pico TX pins. The core models multiple logical
addresses for a later approved multi-UART, mux, RS-485, or other transport.

## Demo

The static fixture targets Pico 7: output 0 ON at 0 ms; output 1 ON at 500 ms;
output 0 OFF and 2 ON at 1000 ms; outputs 1 and 2 OFF at 1500 ms; output 3 ON at
2000 ms and OFF at 2500 ms. It is not a production storage format.

The ESP-IDF debug console and binary Pico UART are separate. Logs report state
transitions; Protocol bytes never go to the console.

## Known limitations

- one physical Pico despite the multi-address portable core;
- no flash persistence or multi-ESP sync; desktop serial is the dedicated UART described below;
- active and staged artifacts are volatile RAM; reboot loses both;
- production identity uses the factory base MAC and is covered by a fixed host fixture;
- no communication-loss watchdog, so a broken wire cannot guarantee physical OFF;
- compile-time auto-start is the first prototype's only local demo trigger;
- measured timing depends on target/load and needs hardware characterization.

See [`../../docs/firmware/esp32-master-v1.md`](../../docs/firmware/esp32-master-v1.md).

## Desktop serial transport

The production baseline now runs Desktop Protocol v1 on a **dedicated** configurable
UART (defaults: UART2, TX GPIO25, RX GPIO26) at 460800 8-N-1. Connect it through a
3.3 V USB-UART bridge. Configure the UART and pins under `Desktop serial transport`
in menuconfig for the selected chip; chips without this UART require another explicit
configuration/adapter. Startup fails with a diagnostic if the selected UART does not
exist, is UART1 (reserved for Pico), or is the configured ESP-IDF UART console. Do not
select GPIO17/GPIO16 (Pico), console pins, or pins unavailable on the selected package.

Device identity is stable across reboot: the first 128 bits of SHA-256 over the
`lllight-device-v1` domain and factory eFuse base MAC. Active/candidate shows remain
RAM-only. See [`../../docs/architecture/desktop-esp32-serial.md`](../../docs/architecture/desktop-esp32-serial.md)
for architecture and the complete hardware test procedure.
