idf_component_register(
  SRCS "app_main.cpp" "../src/protocol.cpp" "../src/pico_command_sender.cpp"
       "../src/scheduler.cpp" "../src/show_controller.cpp" "../src/uart_transport.cpp"
       "../src/demo_show.cpp" "../src/desktop_protocol.cpp" "../src/sha256.cpp"
       "../src/prepared_binary.cpp" "../src/desktop_command_processor.cpp" "../src/esp_desktop_uart.cpp"
       "../src/device_identity.cpp" "../src/esp_desktop_tcp.cpp" "../src/esp_remote_maintenance.cpp"
  INCLUDE_DIRS "../include"
  REQUIRES esp_wifi esp_netif nvs_flash lwip app_update mbedtls esp_timer esp_driver_uart)
