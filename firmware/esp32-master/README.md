# ESP32 master firmware — Pico protocol v2

The Pico transport is an open-loop, TX-only UART. Production defaults are UART1,
**ESP32 GPIO18 TX**, 115200 8N1, and logical Pico address 7. Connect GPIO18 to the
Pico's configured UART RX GPIO (currently GP5) plus common GND. Do not add a
Pico-to-ESP32 return wire. Configure the port/pin through
`CONFIG_LLLIGHT_PICO_UART_PORT` and `CONFIG_LLLIGHT_PICO_UART_TX_PIN`.

`PicoCommandSender` sends RESET_OUTPUTS and SET_OUTPUTS without pending requests,
ACKs, retries, timeouts, or an online state. Prepare and START each issue a safe
RESET; STOP stops the scheduler and immediately issues RESET. Desktop Protocol v1,
show formats, and the absolute-deadline scheduler are unchanged. Desktop status
keeps its existing layout but reports Pico online count as zero/unavailable and
configured count separately.

See `docs/protocols/esp32-pico-protocol-v2.md` for framing, limitations, golden
vectors, Pico USB/LED diagnostics, and the hardware verification procedure.

## Pico UART bench reset loop

The compile-time option `CONFIG_LLLIGHT_PICO_BENCH_RESET_LOOP` is disabled by
default. Enable it under **One-way Pico transport** in `idf.py menuconfig` to
send a Protocol v2 `RESET_OUTPUTS` to slave address 7 about once per second.
The loop uses `PicoCommandSender` and timestamp-based scheduling, so normal main
loop processing continues. Console `result=OK` means only that the ESP32 UART
accepted the local transmission; the Pico receive LED is the physical receive
and apply indication.

## Desktop TCP/Wi-Fi transport

The production default remains the dedicated Desktop UART. To use raw TCP, run
`idf.py menuconfig`, choose **Desktop transport → TCP over Wi-Fi**, and enter the
local STA SSID/password. Credentials are local build configuration: never commit
real credentials. The default port is 3333. After DHCP, the monitor prints
`Desktop TCP listening on <assigned-ip>:3333`. One client is accepted at a time;
disconnect returns the server to listening and does not alter scheduler/show state.
