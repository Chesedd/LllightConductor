# Desktop ↔ ESP32 serial architecture

## Boundary and configuration

The React application talks to `DesktopEsp32Connection`, which owns Protocol v1 framing, streaming parsing, sessions, request matching, retries, upload and status decoding. It only sees the `DesktopEsp32Transport` interface. `TauriSerialPortGateway` implements that interface with four small native commands. Rust uses the mature, cross-platform `serialport` crate directly rather than a Tauri plugin.

The native side is byte transport only: enumerate, open, read, write and close. A single owned port has one reader thread and one cloned write handle. Shutdown is signalled and joined. Tauri events carry bounded byte arrays; this avoids hex/base64 expansion while preserving arbitrary read boundaries. Protocol parsing never occurs in Rust.

Serial is **460800 baud, 8 data bits, no parity, 1 stop bit, no flow control**. The handshake timeout is 1000 ms. Normal requests use 750 ms and two retransmissions of the exact encoded bytes and sequence. Sequence numbers are uint16 and wrap. Disconnect rejects every pending request. A fresh random session ID is created for every open attempt; an open port is not Connected until `HELLO_ACK` is validated.

Port metadata (type, VID/PID, manufacturer, product and serial number where the OS supplies it) is only a discovery hint. `HELLO_ACK.deviceId` is authoritative. Windows `COMx` names are never persisted as identity. Busy, access-denied, removal, read and write failures are represented as structured error codes.

## Firmware physical transport

The baseline production adapter uses a dedicated ESP-IDF UART at 460800 8-N-1. Defaults are UART2, TX GPIO25 and RX GPIO26 and are explicit menuconfig values. A USB-to-3.3 V UART bridge exposes it to the PC. Pico traffic remains on UART1/GPIO17/GPIO16, and ESP-IDF logs remain on the configured console; binary protocol and text logs must never share a stream. Not every ESP32 variant has UART2 or these GPIOs, so select a compatible port/pins for the actual board. Native USB Serial/JTAG can be added behind the same boundary after a target board is fixed.

The stable 128-bit device ID is the first 16 bytes of SHA-256 over the domain string `lllight-device-v1` plus the factory eFuse base MAC. The MAC is not treated as a secret. Shows and connection state remain volatile across reboot.

## Session, binding, and operation

A project binding stores the 32-character protocol device ID against one virtual ESP32 Master. Project V3 already supports this in `physicalDevice.hardwareId`, so no schema migration is needed. One device cannot bind to two Masters, and one Master has at most one ESP32 binding. Disconnect never removes a binding and never sends STOP.

Upload selects only the prepared artifact for the bound Master. It sends BEGIN, chunks sized from both the protocol payload limit (1024 minus four offset bytes) and `UPLOAD_READY`, END, validates `UPLOAD_COMPLETE` SHA-256, activates, then verifies STATUS. Cancellation closes the connection because Protocol v1 intentionally has no ABORT command; reconnecting creates a new session and the firmware discards staging. Start requires a fault-free active device artifact, but does not require it to match the current local artifact. The UI displays Match, Different, or No local artifact.

## Manual hardware test

1. Build and flash the Pico firmware; wire Pico UART1 GP4/GP5 and ground to ESP32 UART1 GPIO17/GPIO16 as documented.
2. Select the real ESP32 target and configure the dedicated desktop UART/pins in `idf.py menuconfig`.
3. Build and flash ESP32. Keep its debug console separate from the desktop UART.
4. Connect a 3.3 V USB-UART bridge to the configured desktop TX/RX (cross TX/RX) and common ground, then connect it to the PC.
5. Open the desktop app, visit **Devices**, choose **Refresh Ports**, select the bridge and **Connect**.
6. Verify Device ID, firmware, protocol, state and Pico online/configured counts.
7. Open/create a project, then bind the connected ID to the intended Costume / Master.
8. In the editor run **Compile**, then **Prepare**.
9. Return to Devices and choose **Upload & Activate**. Verify progress completes and local/device hashes match.
10. Choose **Start Show** and verify the expected Pico GPIO/LED output.
11. Choose **Stop Show** and verify outputs are OFF.
12. Optionally start again, disconnect without stopping, reconnect, and verify STATUS reports the autonomous device state.

## Limitations

Only one desktop connection is supported. There is no multi-ESP synchronization, scheduled start, wireless transport, encryption, flashing, or persistent artifact storage. Physical operation has not been validated unless an ESP-IDF target build and the above bench procedure are completed for the selected board.
