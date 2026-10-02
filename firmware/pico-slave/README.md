# Pico slave firmware — one-way protocol v2

The RP2040 is an RX-only actuator. Default wiring is **ESP32 GPIO18 → Pico GP5
(UART1 RX)** and common GND. `config::kUartRxPin` in `include/pico_slave/config.hpp`
is the explicit compile-time RX selection. There is no required TX pin and the
firmware emits no protocol bytes. Outputs 0–3 map to GP10–GP13 and are OFF at boot.

Build for Raspberry Pi Pico with the Pico SDK in `PICO_SDK_PATH`:

```sh
cmake -S firmware/pico-slave -B build/pico -DPICO_BOARD=pico -DPICO_SLAVE_DIAGNOSTICS=ON
cmake --build build/pico
```

The target artifact is `pico_slave.uf2`. Diagnostics default ON: complete-frame
logs use USB CDC and successful applies pulse the onboard LED for 35 ms without
blocking. Disable production diagnostics with `-DPICO_SLAVE_DIAGNOSTICS=OFF`.
See `docs/protocols/esp32-pico-protocol-v2.md` for framing and bring-up steps.
