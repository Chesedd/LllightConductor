# Standard Raspberry Pi Pico SDK external-project bootstrap.
if(DEFINED ENV{PICO_SDK_PATH} AND NOT PICO_SDK_PATH)
  set(PICO_SDK_PATH $ENV{PICO_SDK_PATH})
endif()
if(NOT PICO_SDK_PATH)
  message(FATAL_ERROR "Set PICO_SDK_PATH to a Raspberry Pi Pico SDK checkout")
endif()
include(${PICO_SDK_PATH}/external/pico_sdk_import.cmake)
