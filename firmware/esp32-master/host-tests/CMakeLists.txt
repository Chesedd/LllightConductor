cmake_minimum_required(VERSION 3.16)
project(esp32_master_host_tests LANGUAGES CXX)
enable_testing()
add_executable(esp32_master_tests tests.cpp ../src/protocol.cpp ../src/session_manager.cpp
  ../src/scheduler.cpp ../src/show_controller.cpp ../src/demo_show.cpp
  ../src/desktop_protocol.cpp ../src/sha256.cpp ../src/prepared_binary.cpp
  ../src/desktop_command_processor.cpp ../src/device_identity.cpp)
target_include_directories(esp32_master_tests PRIVATE ../include)
target_compile_features(esp32_master_tests PRIVATE cxx_std_17)
target_compile_options(esp32_master_tests PRIVATE -Wall -Wextra -Werror -pedantic)
add_test(NAME esp32_master_tests COMMAND esp32_master_tests)
