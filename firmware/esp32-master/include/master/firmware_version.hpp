#pragma once
#include <cstdint>
namespace master {
struct FirmwareVersion {
  uint8_t major, minor, patch;
};
inline constexpr FirmwareVersion kFirmwareVersion{1, 1, 0};
} // namespace master
