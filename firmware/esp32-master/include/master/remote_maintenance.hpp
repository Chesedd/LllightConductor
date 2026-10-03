#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace master {
struct NetworkConfig {
  std::string ssid;
  std::string password;
  uint16_t tcp_port = 3333;
};
inline bool valid_network_config(const NetworkConfig &v) {
  return v.ssid.size() <= 32 && v.password.size() <= 63 && v.tcp_port != 0;
}
class NetworkConfigStore {
public:
  virtual ~NetworkConfigStore() = default;
  virtual bool load(NetworkConfig &) = 0;
  virtual bool save(const NetworkConfig &) = 0;
};
class FirmwareUpdater {
public:
  virtual ~FirmwareUpdater() = default;
  virtual bool begin(uint32_t, const std::array<uint8_t, 32> &, uint16_t &) = 0;
  virtual bool write(uint32_t, const uint8_t *, size_t) = 0;
  virtual bool finish(std::array<uint8_t, 32> &) = 0;
  virtual void cancel() = 0;
};
class SystemControl {
public:
  virtual ~SystemControl() = default;
  virtual void restart() = 0;
};
} // namespace master
