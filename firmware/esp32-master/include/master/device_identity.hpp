#pragma once
#include <array>
#include <cstdint>
namespace master {
std::array<uint8_t,16> stable_device_id(const std::array<uint8_t,6>& factory_mac);
}
