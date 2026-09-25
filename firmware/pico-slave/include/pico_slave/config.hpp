#pragma once

#include <array>
#include <cstdint>

namespace pico_slave::config {

struct OutputDefinition { uint8_t output_id; uint8_t gpio; bool active_high; };

constexpr uint8_t kSlaveAddress = 7;
constexpr uint16_t kFirmwareId = 0x0102;
constexpr uint8_t kUartInstance = 1;
constexpr uint32_t kUartBaud = 115200;
constexpr uint8_t kUartTxPin = 4;
constexpr uint8_t kUartRxPin = 5;
constexpr std::array<OutputDefinition, 4> kOutputs{{
    {0, 10, true}, {1, 11, true}, {2, 12, true}, {3, 13, true},
}};

constexpr uint8_t kFirmwareVersionMajor = 1;
constexpr uint8_t kFirmwareVersionMinor = 0;
constexpr uint8_t kFirmwareVersionPatch = 0;

}  // namespace pico_slave::config
