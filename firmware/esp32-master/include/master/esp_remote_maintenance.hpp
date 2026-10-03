#pragma once
#include "esp_ota_ops.h"
#include "master/remote_maintenance.hpp"
#include "mbedtls/sha256.h"
namespace master {
class EspNetworkConfigStore final : public NetworkConfigStore {
public:
  explicit EspNetworkConfigStore(NetworkConfig defaults)
      : defaults_(std::move(defaults)) {}
  bool load(NetworkConfig &) override;
  bool save(const NetworkConfig &) override;

private:
  NetworkConfig defaults_;
};
class EspFirmwareUpdater final : public FirmwareUpdater {
public:
  bool begin(uint32_t, const std::array<uint8_t, 32> &, uint16_t &) override;
  bool write(uint32_t, const uint8_t *, size_t) override;
  bool finish(std::array<uint8_t, 32> &) override;
  void cancel() override;

private:
  esp_ota_handle_t handle_{};
  const esp_partition_t *partition_{};
  bool active_{};
  mbedtls_sha256_context sha_{};
  std::array<uint8_t, 32> expected_{};
};
class EspSystemControl final : public SystemControl {
public:
  void restart() override;
};
} // namespace master
