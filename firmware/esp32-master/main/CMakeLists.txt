idf_component_register(
  SRCS "app_main.cpp" "../src/protocol.cpp" "../src/session_manager.cpp"
       "../src/scheduler.cpp" "../src/show_controller.cpp" "../src/uart_transport.cpp"
       "../src/demo_show.cpp" "../src/desktop_protocol.cpp" "../src/sha256.cpp"
       "../src/prepared_binary.cpp" "../src/desktop_command_processor.cpp" "../src/esp_desktop_uart.cpp"
  INCLUDE_DIRS "../include")
